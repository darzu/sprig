// rendering pipeline for meshes

import { MeshMemoryPool as MeshPool } from "./mesh";

// TODO: canvas ref
// TODO: navigator.gpu typings
//          @webgpu/types
// TODO: frag_depth
const vertexPositionColorWGSL =
    `
[[stage(fragment)]]
fn main(
    [[location(0)]] modelPos: vec4<f32>,
    [[location(1)]] color: vec3<f32>
    ) -> [[location(0)]] vec4<f32> {
    var xTan: vec3<f32> = dpdx(modelPos).xyz;
    var yTan: vec3<f32> = dpdy(modelPos).xyz;
    var norm: vec3<f32> = normalize(cross(xTan, yTan));

    var lDirection: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var lColor: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var ambient: vec4<f32> = vec4<f32>(color, 1.0); // vec4<f32>(0.0, 0.2, 0.2, 0.2);

    var diffuse: vec4<f32> = vec4<f32>(max(dot(lDirection, -norm), 0.0) * lColor, 1.0);

    return ambient + diffuse;
    // return vec4<f32>(norm, 1.0);
}
`;

const basicVertWGSL =
    `
[[block]] struct SharedUnis {
    viewProj : mat4x4<f32>;
};
[[binding(0), group(0)]] var<uniform> sharedUnis : SharedUnis;
[[block]] struct ModelUnis {
    model : mat4x4<f32>;
};
[[binding(0), group(1)]] var<uniform> modelUnis : ModelUnis;

struct VertexOutput {
    [[builtin(position)]] pos : vec4<f32>;
    [[location(0)]] modelPos: vec4<f32>;
    [[location(1)]] color: vec3<f32>;
};

[[stage(vertex)]]
fn main(
    [[location(0)]] position : vec3<f32>,
    [[location(1)]] color : vec3<f32>,
    [[location(2)]] color2 : vec3<f32>
    ) -> VertexOutput {
    var output : VertexOutput;
    var pos4: vec4<f32> = vec4<f32>(position, 1.0);
    output.pos =  sharedUnis.viewProj * modelUnis.model * pos4;
    // output.color = vec4<f32>(normal, 1.0);
    // output.color = 0.5 * (pos4 + vec4<f32>(1.0, 1.0, 1.0, 1.0));
    // output.modelPos = sharedUnis.viewProj * pos4;
    output.modelPos = sharedUnis.viewProj * pos4;
    // output.color = color2;
    // output.color = vec3<f32>(0.2, 0.5, 0.4);
    output.color = color;

    return output;
}
`;

const shadowDepthTextureSize = 1024;

// const maxNumVerts = 1000;
// const maxNumTri = 1000;
// const maxNumModels = 100;


const sampleCount = 4;

const swapChainFormat = 'bgra8unorm';

const shadowDepthTextureDesc: GPUTextureDescriptor = {
    size: {
        width: shadowDepthTextureSize,
        height: shadowDepthTextureSize,
        // TODO(@darzu): deprecated
        // depth: 1,
    },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
    format: 'depth32float',
}

const maxNumInstances = 1000;
const instanceByteSize = Float32Array.BYTES_PER_ELEMENT * 3/*color*/

const depthStencilFormat = 'depth24plus';

export interface MeshRenderer {
    // TODO(@darzu): what should really be exposed?
    sharedUniBuffer: GPUBuffer,
    createRenderBundle: () => GPURenderBundle,
    renderBundle: (commandEncoder: GPUCommandEncoder, bundle: GPURenderBundle) => void,
}

export function createMeshRenderer(
    meshPool: MeshPool, device: GPUDevice, context: GPUCanvasContext,
    canvasWidth: number, canvasHeight: number): MeshRenderer {
    /*
    TODO: we'll probably switch when enga@chromium.org does
    configureSwapChain() is deprecated. Use configure() instead and call getCurrentTexture()
    directly on the context. Note that configure() must also be called if you want to change
    the size of the textures returned by getCurrentTexture()
    */
    const swapChain = context.configureSwapChain({
        device,
        format: swapChainFormat,
    });

    // Create the depth texture for rendering/sampling the shadow map.
    const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
    const shadowDepthTextureView = shadowDepthTexture.createView();

    const instanceDataBuffer = device.createBuffer({
        size: maxNumInstances * instanceByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    {
        const instMap = new Float32Array(instanceDataBuffer.getMappedRange())
        for (let i = 0; i < maxNumInstances; i++) {
            const off = i * instanceByteSize
            // TODO(@darzu): colors
            instMap[off + 0] = Math.random()
            instMap[off + 1] = Math.random()
            instMap[off + 2] = Math.random()
        }
        instanceDataBuffer.unmap();
    }

    const modelUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                    hasDynamicOffset: true,
                    // TODO(@darzu): why have this?
                    minBindingSize: meshPool._opts.meshUniByteSize,
                },
            },
        ],
    });

    // creating binding group
    // TODO(@darzu): we don't want to use binding groups here
    const modelUniBindGroup = device.createBindGroup({
        layout: modelUniBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: meshPool._meshUniBuffer,
                    offset: 0, // TODO(@darzu): different offsets per model
                    // TODO(@darzu): needed?
                    size: meshPool._opts.meshUniByteSize,
                },
            },
        ],
    });

    const sharedUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                    // hasDynamicOffset: true,
                    // TODO(@darzu): why have this?
                    // minBindingSize: 20,
                },
            },
        ],
    });

    const sharedUniBufferSize = 4 * 16; // 4x4 matrix
    const sharedUniBuffer = device.createBuffer({
        size: sharedUniBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sharedUniBindGroup = device.createBindGroup({
        layout: sharedUniBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: sharedUniBuffer,
                },
            },
        ],
    });

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [sharedUniBindGroupLayout, modelUniBindGroupLayout],
    });


    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: device.createShaderModule({
                code: basicVertWGSL,
            }),
            entryPoint: 'main',
            buffers: [
                {
                    // TODO(@darzu): the buffer index should be connected to the pool probably?
                    arrayStride: meshPool._opts.vertByteSize,
                    attributes: [
                        {
                            // position
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3',
                        },
                        {
                            // color
                            shaderLocation: 1,
                            offset: 4 * 3,
                            format: 'float32x3',
                        },
                        // {
                        //     // normals
                        //     shaderLocation: 1,
                        //     offset: 0,
                        //     format: 'float32x3',
                        // },
                        // {
                        //     // uv
                        //     shaderLocation: 1,
                        //     offset: cubeUVOffset,
                        //     format: 'float32x2',
                        // },
                    ],
                },
                {
                    // per-instance data
                    stepMode: "instance",
                    arrayStride: instanceByteSize,
                    attributes: [
                        {
                            // color
                            shaderLocation: 2,
                            offset: 0,
                            format: 'float32x3',
                        },
                    ],
                },
            ],
        },
        fragment: {
            module: device.createShaderModule({
                code: vertexPositionColorWGSL,
            }),
            entryPoint: 'main',
            targets: [
                {
                    format: swapChainFormat,
                },
            ],
        },
        primitive: {
            topology: 'triangle-list',

            // Backface culling since the cube is solid piece of geometry.
            // Faces pointing away from the camera will be occluded by faces
            // pointing toward the camera.
            cullMode: 'back',
            // frontFace: 'ccw', // TODO(dz):
        },

        // Enable depth testing so that the fragment closest to the camera
        // is rendered in front.
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: depthStencilFormat,
        },
        multisample: {
            count: sampleCount,
        },
    });

    const depthTexture = device.createTexture({
        size: { width: canvasWidth, height: canvasHeight },
        format: depthStencilFormat,
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });


    // Declare swapchain image handles
    let colorTexture: GPUTexture = device.createTexture({
        size: {
            width: canvasWidth,
            height: canvasHeight,
        },
        sampleCount,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });;
    let colorTextureView: GPUTextureView = colorTexture.createView();

    const colorAtt: GPURenderPassColorAttachmentNew = {
        view: colorTextureView,
        resolveTarget: swapChain.getCurrentTexture().createView(),
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        storeOp: 'store',
    };
    const renderPassDescriptor = {
        colorAttachments: [colorAtt],
        depthStencilAttachment: {
            view: depthTexture.createView(),

            depthLoadValue: 1.0,
            depthStoreOp: 'store',
            stencilLoadValue: 0,
            stencilStoreOp: 'store',
        },
    } as const;

    function createRenderBundle(): GPURenderBundle {
        // create render bundle
        const bundleRenderDesc: GPURenderBundleEncoderDescriptor = {
            colorFormats: [swapChainFormat],
            depthStencilFormat: depthStencilFormat,
            sampleCount,
        }

        const bundleEncoder = device.createRenderBundleEncoder(bundleRenderDesc);
        // const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        bundleEncoder.setPipeline(pipeline);
        bundleEncoder.setBindGroup(0, sharedUniBindGroup);
        bundleEncoder.setVertexBuffer(0, meshPool._vertBuffer);
        bundleEncoder.setVertexBuffer(1, instanceDataBuffer);
        bundleEncoder.setIndexBuffer(meshPool._indexBuffer, 'uint16');
        // TODO(@darzu): one draw call per mesh?
        const uniOffset = [0];
        for (let m of meshPool._meshes) {
            // TODO(@darzu): set bind group
            uniOffset[0] = m.modelUniByteOffset;
            bundleEncoder.setBindGroup(1, modelUniBindGroup, uniOffset);
            bundleEncoder.drawIndexed(m.model.tri.length * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        }
        const renderBundle = bundleEncoder.finish()
        return renderBundle;
    }

    function renderBundle(commandEncoder: GPUCommandEncoder, bundle: GPURenderBundle) {
        // TODO(@darzu):  this feels akward
        // Acquire next image from swapchain
        colorTexture = swapChain.getCurrentTexture();
        colorTextureView = colorTexture.createView();
        renderPassDescriptor.colorAttachments[0].resolveTarget = colorTextureView;

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.executeBundles([bundle]);
        passEncoder.endPass();

        return commandEncoder;
    }

    return {
        sharedUniBuffer,
        createRenderBundle,
        renderBundle,
    };
}
