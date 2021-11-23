import { mat4, vec3 } from "./gl-matrix.js";
import { createMeshPoolBuilder_WebGPU, MeshUniform, SceneUniform, Vertex, } from "./mesh-pool.js";
const PIXEL_PER_PX = null; // 0.5;
// TODO: some state lives in global variables when it should live on the Renderer object
// shaders
const shaderSceneStruct = `
    [[block]] struct Scene {
        ${SceneUniform.GenerateWGSLUniformStruct()}
    };
`;
const vertexShader = shaderSceneStruct +
    `
    [[block]] struct Model {
        ${MeshUniform.GenerateWGSLUniformStruct()}
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        ${Vertex.GenerateWGSLVertexInputStruct(",")}
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.transform * vec4<f32>(position, 1.0);
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.transform * vec4<f32>(normal, 0.0)).xyz;
        output.color = color + model.tint;
        return output;
    }
`;
const fragmentShader = shaderSceneStruct +
    `
    [[group(0), binding(0)]] var<uniform> scene : Scene;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
    };

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;
// render pipeline parameters
const antiAliasSampleCount = 4;
const depthStencilFormat = "depth24plus-stencil8";
const backgroundColor = { r: 0.6, g: 0.63, b: 0.6, a: 1.0 };
export class Renderer_WebGPU {
    constructor(canvas, device, context, adapter, maxMeshes, maxVertices) {
        this.wireMode = "normal";
        this.perspectiveMode = "perspective";
        this.meshObjs = {};
        this.initFinished = false;
        this.depthTexture = null;
        this.depthTextureView = null;
        this.colorTexture = null;
        this.colorTextureView = null;
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.aspectRatio = 1;
        this.needsRebundle = false;
        this.lastWireMode = this.wireMode;
        this.scratchSceneUni = new Uint8Array(SceneUniform.ByteSizeAligned);
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.adapter = adapter;
        this.presentationFormat = context.getPreferredFormat(this.adapter);
        const opts = {
            maxMeshes,
            maxTris: maxVertices,
            maxVerts: maxVertices,
            maxLines: maxVertices * 2,
            shiftMeshIndices: false,
        };
        this.builder = createMeshPoolBuilder_WebGPU(device, opts);
        this.pool = this.builder.poolHandle;
        this.sceneUniformBuffer = device.createBuffer({
            size: SceneUniform.ByteSizeAligned,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // setup scene data:
        this.sceneData = setupScene();
        // workaround because Typescript can't tell this function init's the render bundle
        this.renderBundle = this.createRenderBundle();
    }
    finishInit() {
        if (this.initFinished)
            throw "finishInit called twice";
        this.builder.finish();
        this.initFinished = true;
    }
    gpuBufferWriteAllMeshUniforms() {
        // TODO(@darzu): make this update all meshes at once
        for (let m of Object.values(this.meshObjs)) {
            m.handle.transform = m.obj.transform; // TODO(@darzu): this discrepency isn't great...
            // TODO(@darzu): this is definitely weird. Need to think about this interaction better.
            if (m.obj.color)
                m.handle.tint = m.obj.color;
            this.pool.updateUniform(m.handle);
        }
    }
    // recomputes textures, widths, and aspect ratio on canvas resize
    checkCanvasResize() {
        const devicePixelRatio = PIXEL_PER_PX
            ? PIXEL_PER_PX
            : window.devicePixelRatio || 1;
        const newWidth = this.canvas.clientWidth * devicePixelRatio;
        const newHeight = this.canvas.clientHeight * devicePixelRatio;
        if (this.lastWidth === newWidth && this.lastHeight === newHeight)
            return;
        console.log(`devicePixelRatio: ${devicePixelRatio}`);
        if (this.depthTexture)
            this.depthTexture.destroy();
        if (this.colorTexture)
            this.colorTexture.destroy();
        const newSize = [newWidth, newHeight];
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            size: newSize,
        });
        this.depthTexture = this.device.createTexture({
            size: newSize,
            format: depthStencilFormat,
            sampleCount: antiAliasSampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();
        this.colorTexture = this.device.createTexture({
            size: newSize,
            sampleCount: antiAliasSampleCount,
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.colorTextureView = this.colorTexture.createView();
        this.lastWidth = newWidth;
        this.lastHeight = newHeight;
        this.aspectRatio = Math.abs(newWidth / newHeight);
    }
    /*
      Adds an object to be rendered. Currently expects the GPU's buffers to be memory-mapped.
                    
      TODO: support adding objects when buffers aren't memory-mapped using device.queue
    */
    addObject(o) {
        // console.log(`Adding object ${o.id}`);
        let m = o.mesh();
        // need to introduce a new variable to convince Typescript the mapping is non-null
        const handle = this.initFinished
            ? this.pool.addMesh(m)
            : this.builder.addMesh(m);
        const res = {
            obj: o,
            handle,
        };
        this.meshObjs[o.id] = res;
        this.needsRebundle = true;
        return res;
    }
    addObjectInstance(o, oldHandle) {
        console.log(`Adding (instanced) object ${o.id}`);
        const d = MeshUniform.CloneData(oldHandle);
        const newHandle = this.initFinished
            ? this.pool.addMeshInstance(oldHandle, d)
            : this.builder.addMeshInstance(oldHandle, d);
        const res = {
            obj: o,
            handle: newHandle,
        };
        this.meshObjs[o.id] = res;
        this.needsRebundle = true;
        return res;
    }
    removeObject(o) {
        delete this.meshObjs[o.id];
        this.needsRebundle = true;
    }
    createRenderBundle() {
        this.needsRebundle = false; // TODO(@darzu): hack?
        this.lastWireMode = this.wireMode;
        const modelUniBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "uniform",
                        hasDynamicOffset: true,
                        minBindingSize: MeshUniform.ByteSizeAligned,
                    },
                },
            ],
        });
        const modelUniBindGroup = this.device.createBindGroup({
            layout: modelUniBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.pool.uniformBuffer,
                        size: MeshUniform.ByteSizeAligned,
                    },
                },
            ],
        });
        // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
        const prim_tris = {
            topology: "triangle-list",
            cullMode: "back",
            frontFace: "ccw",
        };
        const prim_lines = {
            topology: "line-list",
        };
        // define the resource bindings for the mesh rendering pipeline
        const renderSceneUniBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });
        const renderSceneUniBindGroup = this.device.createBindGroup({
            layout: renderSceneUniBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
        });
        // setup our second phase pipeline which renders meshes to the canvas
        const renderPipelineDesc_tris = {
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    renderSceneUniBindGroupLayout,
                    modelUniBindGroupLayout,
                ],
            }),
            vertex: {
                module: this.device.createShaderModule({ code: vertexShader }),
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: Vertex.ByteSize,
                        attributes: Vertex.WebGPUFormat,
                    },
                ],
            },
            fragment: {
                module: this.device.createShaderModule({ code: fragmentShader }),
                entryPoint: "main",
                targets: [{ format: this.presentationFormat }],
            },
            primitive: prim_tris,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: depthStencilFormat,
            },
            multisample: {
                count: antiAliasSampleCount,
            },
        };
        const renderPipeline_tris = this.device.createRenderPipeline(renderPipelineDesc_tris);
        const renderPipelineDesc_lines = {
            ...renderPipelineDesc_tris,
            primitive: prim_lines,
        };
        const renderPipeline_lines = this.device.createRenderPipeline(renderPipelineDesc_lines);
        // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
        // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
        const bundleEnc = this.device.createRenderBundleEncoder({
            colorFormats: [this.presentationFormat],
            depthStencilFormat: depthStencilFormat,
            sampleCount: antiAliasSampleCount,
        });
        if (this.wireMode === "normal")
            bundleEnc.setPipeline(renderPipeline_tris);
        else
            bundleEnc.setPipeline(renderPipeline_lines);
        bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
        bundleEnc.setVertexBuffer(0, this.pool.verticesBuffer);
        // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
        if (this.wireMode === "normal")
            bundleEnc.setIndexBuffer(this.pool.triIndicesBuffer, "uint16");
        else
            bundleEnc.setIndexBuffer(this.pool.lineIndicesBuffer, "uint16");
        for (let m of Object.values(this.meshObjs)) {
            bundleEnc.setBindGroup(1, modelUniBindGroup, [
                m.handle.modelUniByteOffset,
            ]);
            if (this.wireMode === "normal")
                bundleEnc.drawIndexed(m.handle.numTris * 3, undefined, m.handle.triIndicesNumOffset, m.handle.vertNumOffset);
            else
                bundleEnc.drawIndexed(m.handle.numLines * 2, undefined, m.handle.lineIndicesNumOffset, m.handle.vertNumOffset);
        }
        this.renderBundle = bundleEnc.finish();
        return this.renderBundle;
    }
    renderFrame(viewMatrix) {
        this.checkCanvasResize();
        const projectionMatrix = mat4.create();
        if (this.perspectiveMode === "ortho") {
            const ORTHO_SIZE = 40;
            mat4.ortho(projectionMatrix, -ORTHO_SIZE, ORTHO_SIZE, -ORTHO_SIZE, ORTHO_SIZE, -400, 200);
        }
        else {
            mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, this.aspectRatio, 1, 10000.0 /*view distance*/);
        }
        const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix);
        this.sceneData.cameraViewProjMatrix = viewProj;
        SceneUniform.Serialize(this.scratchSceneUni, 0, this.sceneData);
        this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, this.scratchSceneUni.buffer);
        // update all mesh transforms
        this.gpuBufferWriteAllMeshUniforms();
        // TODO(@darzu): more fine grain
        if (this.needsRebundle || this.wireMode !== this.lastWireMode)
            this.createRenderBundle();
        // start collecting our render commands for this frame
        const commandEncoder = this.device.createCommandEncoder();
        // render to the canvas' via our swap-chain
        const renderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.colorTextureView,
                    resolveTarget: this.context.getCurrentTexture().createView(),
                    loadValue: backgroundColor,
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: "store",
                stencilLoadValue: 0,
                stencilStoreOp: "store",
            },
        });
        renderPassEncoder.executeBundles([this.renderBundle]);
        renderPassEncoder.endPass();
        // submit render passes to GPU
        this.device.queue.submit([commandEncoder.finish()]);
    }
}
// TODO(@darzu): move somewhere else
export function setupScene() {
    // create a directional light and compute it's projection (for shadows) and direction
    const worldOrigin = vec3.fromValues(0, 0, 0);
    const lightPosition = vec3.fromValues(50, 50, 0);
    const upVector = vec3.fromValues(0, 1, 0);
    const lightViewMatrix = mat4.lookAt(mat4.create(), lightPosition, worldOrigin, upVector);
    const lightProjectionMatrix = mat4.ortho(mat4.create(), -80, 80, -80, 80, -200, 300);
    const lightViewProjMatrix = mat4.multiply(mat4.create(), lightProjectionMatrix, lightViewMatrix);
    const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
    vec3.normalize(lightDir, lightDir);
    return {
        cameraViewProjMatrix: mat4.create(),
        lightViewProjMatrix,
        lightDir,
        time: 0,
        playerPos: [0, 0],
        cameraPos: vec3.create(), // updated later
    };
}
//# sourceMappingURL=render_webgpu.js.map