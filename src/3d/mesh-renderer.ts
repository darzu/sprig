// rendering pipeline for meshes

import { mat4 } from "../ext/gl-matrix.js";
import { mat4ByteSize, MeshMemoryPool, MeshMemoryPool as MeshPool, MeshMemoryPoolOptions, vec3ByteSize } from "./mesh.js";

const shadowDepthTextureSize = 1024 * 2;

// TODO(@darzu): SCENE FORMAT
const sceneStruct = `
[[block]] struct Scene {
  cameraViewProjMatrix : mat4x4<f32>;
  lightViewProjMatrix : mat4x4<f32>;
  lightPos : vec3<f32>;
  time : f32;
  displacer: vec3<f32>;
};
`

const wgslShaders = {
    vertexShadow: sceneStruct + `

  [[block]] struct Model {
    modelMatrix : mat4x4<f32>;
  };

  [[group(0), binding(0)]] var<uniform> scene : Scene;
  [[group(1), binding(0)]] var<uniform> model : Model;

  [[stage(vertex)]]
  fn main([[location(0)]] position : vec3<f32>)
       -> [[builtin(position)]] vec4<f32> {
    return scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
  }
  `,

    fragmentShadow: `
  [[stage(fragment)]]
  fn main() {
  }
  `,

    vertex: sceneStruct + `

    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] fragPos : vec3<f32>;
        [[location(2)]] fragNorm : vec3<f32>;
        [[location(3)]] color : vec3<f32>;
        [[location(4)]] swayHeight : f32;

        [[builtin(position)]] Position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        [[location(0)]] position : vec3<f32>,
        [[location(1)]] color : vec3<f32>,
        [[location(2)]] normal : vec3<f32>,
        // TODO(@darzu): VERTEX FORMAT
        [[location(3)]] swayHeight : f32,
        ) -> VertexOutput {
        var output : VertexOutput;

        let worldPos: vec4<f32> = model.modelMatrix * vec4<f32>(position, 1.0);

        // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight : vec4<f32> = scene.lightViewProjMatrix * worldPos;

        // Convert XY to (0, 1)
        // Y is flipped because texture coords are Y-down.
        output.shadowPos = vec3<f32>(
            posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
            posFromLight.z
        );

        let dist3ToDisplacer: vec4<f32> = worldPos - vec4<f32>(scene.displacer, 1.0);
        let distToDisplacer: f32 = distance(vec3<f32>(), dist3ToDisplacer.xyz);
        let displaceStr: f32 = clamp(pow(2.5 / distToDisplacer, 5.0), 0.0, 1.0);
        let localDisplacement: vec4<f32> = (normalize(dist3ToDisplacer) * displaceStr);
        let displacerDisplacement: vec4<f32> = vec4<f32>(localDisplacement.x, min(0.0, localDisplacement.y) , localDisplacement.z, 0.0) * swayHeight;

        let swayScale: f32 = swayHeight * 0.12;
        let timeScale: f32 = scene.time * 0.0015;
        let xSway: f32 = 2.0 * sin(1.0 * (worldPos.x + worldPos.y + worldPos.z + timeScale)) + 1.0;
        let zSway: f32 = 1.0 * sin(2.0 * (worldPos.x + worldPos.y + worldPos.z + timeScale)) + 0.5;
        let sway: vec4<f32> = vec4<f32>(xSway, 0.0, zSway, 0.0) * swayScale;
        output.Position = scene.cameraViewProjMatrix * (worldPos + sway + displacerDisplacement);
        output.fragPos = output.Position.xyz;
        // output.fragNorm = normal;
        output.fragNorm = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
        output.color = color;
        output.swayHeight = swayHeight;
        return output;
    }
    `,
    fragment: `
    [[block]] struct Scene {
        lightViewProjMatrix : mat4x4<f32>;
        cameraViewProjMatrix : mat4x4<f32>;
        lightPos : vec3<f32>;
        time : f32;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

    struct FragmentInput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] fragPos : vec3<f32>;
        [[location(2)]] fragNorm : vec3<f32>;
        [[location(3)]] color : vec3<f32>;
        // TODO: use swayHeight?
        [[location(4)]] swayHeight : f32;
        [[builtin(front_facing)]] front: bool;
    };

    let albedo : vec3<f32> = vec3<f32>(0.9, 0.9, 0.9);
    let ambientFactor : f32 = 0.4;
    let lightColor : vec3<f32> =  vec3<f32>(1.0, 1.0, 1.0);

    [[stage(fragment)]]
    fn main(input : FragmentInput) -> [[location(0)]] vec4<f32> {
        // Percentage-closer filtering. Sample texels in the region
        // to smooth the result.
        var visibility : f32 = 0.0;
        for (var y : i32 = -1 ; y <= 1 ; y = y + 1) {
            for (var x : i32 = -1 ; x <= 1 ; x = x + 1) {
                let offset : vec2<f32> = vec2<f32>(
                f32(x) * ${1 / shadowDepthTextureSize},
                f32(y) * ${1 / shadowDepthTextureSize});

                visibility = visibility + textureSampleCompare(
                shadowMap, shadowSampler,
                input.shadowPos.xy + offset, input.shadowPos.z - 0.007);
            }
        }
        visibility = visibility / 9.0;

        let normSign: f32 = select(1.0, -1.0, input.front);
        let norm: vec3<f32> = input.fragNorm * normSign;
        let antiNorm: vec3<f32> = norm * -1.0;

        let lightDir: vec3<f32> = normalize(scene.lightPos - input.fragPos);
        let lambert : f32 = max(dot(lightDir, norm), 0.0);
        let antiLambert : f32 = 1.5 - max(dot(lightDir, antiNorm), 0.0);
        let lightingFactor : f32 = min(visibility * lambert, 1.0) * 1.5;
        let diffuse: vec3<f32> = lightColor * lightingFactor;
        let ambient: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0) * ambientFactor * antiLambert;

        // return vec4<f32>(norm, 1.0);

        return vec4<f32>((diffuse + ambient) * input.color, 1.0);

        // return vec4<f32>(lightingFactor * input.color, 1.0);
        // return vec4<f32>(lightingFactor * albedo, 1.0);
    }
    `,
}

// const maxNumVerts = 1000;
// const maxNumTri = 1000;
// const maxNumModels = 100;

const sampleCount = 4;

const swapChainFormat = 'bgra8unorm';

const shadowDepthTextureDesc: GPUTextureDescriptor = {
    size: {
        width: shadowDepthTextureSize,
        height: shadowDepthTextureSize,
        depthOrArrayLayers: 1,
    },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
    format: 'depth32float',
}

const maxNumInstances = 1000;
const instanceByteSize = Float32Array.BYTES_PER_ELEMENT * 3/*color*/

// TODO(@darzu): depth24plus-stencil8
const depthStencilFormat = 'depth24plus-stencil8';

// TODO(@darzu): move this out?
const lightProjectionMatrix = mat4.create();
{
    const left = -80;
    const right = 80;
    const bottom = -80;
    const top = 80;
    const near = -200;
    const far = 300;
    mat4.ortho(lightProjectionMatrix, left, right, bottom, top, near, far);
}

export interface MeshRenderer {
    // TODO(@darzu): what should really be exposed?
    sharedUniBuffer: GPUBuffer,
    rebuildBundles: (meshPools: MeshMemoryPool[]) => void,
    render: (commandEncoder: GPUCommandEncoder, meshPools: MeshMemoryPool[], canvasWidth: number, canvasHeight: number) => void,
}

export function createMeshRenderer(
    meshUniByteSize: number,
    vertByteSize: number,
    device: GPUDevice, context: GPUCanvasContext): MeshRenderer {
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
                    minBindingSize: meshUniByteSize,
                },
            },
        ],
    });

    const shadowSharedUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: 'uniform',
                    // hasDynamicOffset: true,
                    // TODO(@darzu): why have this?
                    // minBindingSize: 20,
                },
            },
        ],
    });

    const renderSharedUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: 'uniform',
                    // hasDynamicOffset: true,
                    // TODO(@darzu): why have this?
                    // minBindingSize: 20,
                },
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: 'depth',
                },
            },
            {
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'comparison',
                },
            },
        ],
    });

    // Create the depth texture for rendering/sampling the shadow map.
    const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
    // TODO(@darzu): use
    const shadowDepthTextureView = shadowDepthTexture.createView();

    const sharedUniBufferSize =
        // Two 4x4 viewProj matrices,
        // one for the camera and one for the light.
        // Then a vec3 for the light position.
        mat4ByteSize * 2 // camera and light projection
        + vec3ByteSize * 1 // light pos
        + Float32Array.BYTES_PER_ELEMENT * 1 // time
        // TODO(@darzu): SCENE FORMAT
        + vec3ByteSize // displacer
    const sharedUniBuffer = device.createBuffer({
        size: sharedUniBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shadowSharedUniBindGroup = device.createBindGroup({
        layout: shadowSharedUniBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: sharedUniBuffer,
                },
            },
        ],
    });

    const renderSharedUniBindGroup = device.createBindGroup({
        layout: renderSharedUniBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: sharedUniBuffer,
                },
            },
            {
                binding: 1,
                resource: shadowDepthTextureView,
            },
            {
                binding: 2,
                // TODO(@darzu): what's a sampler here?
                resource: device.createSampler({
                    compare: 'less',
                }),
            },
        ],
    });

    console.log(`vertByteSize: ${vertByteSize}, should be: ${vec3ByteSize * 3 + Float32Array.BYTES_PER_ELEMENT}`)
    const vertexBuffersLayout: GPUVertexBufferLayout[] = [
        {
            // TODO(@darzu): the buffer index should be connected to the pool probably?
            // TODO(@darzu): VERTEX FORMAT
            arrayStride: vertByteSize,
            attributes: [
                {
                    // position
                    shaderLocation: 0,
                    offset: vec3ByteSize * 0,
                    format: 'float32x3',
                },
                {
                    // color
                    shaderLocation: 1,
                    offset: vec3ByteSize * 1,
                    format: 'float32x3',
                },
                {
                    // normals
                    shaderLocation: 2,
                    offset: vec3ByteSize * 2,
                    format: 'float32x3',
                },
                {
                    // sway height
                    shaderLocation: 3,
                    offset: vec3ByteSize * 3,
                    format: 'float32',
                },
                // {
                //     // uv
                //     shaderLocation: 1,
                //     offset: cubeUVOffset,
                //     format: 'float32x2',
                // },
            ],
        },
        // TODO(@darzu): VERTEX FORMAT
        // {
        //     // per-instance data
        //     stepMode: "instance",
        //     arrayStride: instanceByteSize,
        //     attributes: [
        //         {
        //             // color
        //             shaderLocation: 4,
        //             offset: 0,
        //             format: 'float32x3',
        //         },
        //     ],
        // },
    ];

    const primitiveBackcull: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'back',
        // frontFace: 'ccw', // TODO(dz):
    };
    const primitiveTwosided: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'none',
        // frontFace: 'ccw', // TODO(dz):
    };

    const shadowPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [shadowSharedUniBindGroupLayout, modelUniBindGroupLayout],
    });

    const shadowPipelineDesc: GPURenderPipelineDescriptor = {
        layout: shadowPipelineLayout, // TODO(@darzu): same for shadow and not?
        vertex: {
            module: device.createShaderModule({
                code: wgslShaders.vertexShadow,
            }),
            entryPoint: 'main',
            buffers: vertexBuffersLayout,
        },
        fragment: {
            // This should be omitted and we can use a vertex-only pipeline, but it's
            // not yet implemented.
            module: device.createShaderModule({
                code: wgslShaders.fragmentShadow,
            }),
            entryPoint: 'main',
            targets: [],
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth32float',
        },
        primitive: primitiveBackcull,
    };

    const shadowPipeline = device.createRenderPipeline(shadowPipelineDesc);
    const shadowPipelineTwosided = device.createRenderPipeline({
        ...shadowPipelineDesc,
        primitive: primitiveTwosided
    });

    const renderPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [renderSharedUniBindGroupLayout, modelUniBindGroupLayout],
    });

    const renderPipelineDesc: GPURenderPipelineDescriptor = {
        layout: renderPipelineLayout,
        vertex: {
            module: device.createShaderModule({
                code: wgslShaders.vertex,
                // TODO(@darzu):
                // code: basicVertWGSL,
            }),
            entryPoint: 'main',
            buffers: vertexBuffersLayout,
        },
        fragment: {
            module: device.createShaderModule({
                code: wgslShaders.fragment,
                // TODO(@darzu):
                // code: vertexPositionColorWGSL,
            }),
            entryPoint: 'main',
            targets: [
                {
                    format: swapChainFormat,
                },
            ],
        },
        primitive: primitiveBackcull,

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
    };

    const renderPipeline = device.createRenderPipeline(renderPipelineDesc);
    const renderPipelineTwosided = device.createRenderPipeline({
        ...renderPipelineDesc,
        primitive: primitiveTwosided,

    });
    // 'depth24plus-stencil8'


    let depthTexture: GPUTexture;
    let depthTextureView: GPUTextureView;
    let colorTexture: GPUTexture;
    let colorTextureView: GPUTextureView;
    let lastWidth = 0;
    let lastHeight = 0;

    function resize(canvasWidth: number, canvasHeight: number) {
        if (depthTexture && colorTexture && lastWidth === canvasWidth && lastHeight === canvasHeight)
            return;

        if (depthTexture)
            depthTexture.destroy();
        if (colorTexture)
            colorTexture.destroy();

        console.log("resizing")

        depthTexture = device.createTexture({
            size: { width: canvasWidth, height: canvasHeight },
            format: depthStencilFormat,
            sampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        depthTextureView = depthTexture.createView();

        // Declare swapchain image handles
        colorTexture = device.createTexture({
            size: {
                width: canvasWidth,
                height: canvasHeight,
            },
            sampleCount,
            format: swapChainFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });;
        colorTextureView = colorTexture.createView();

        lastWidth = canvasWidth;
        lastHeight = canvasHeight;
    }
    resize(100, 100);

    // TODO(@darzu): how do we handle this abstraction with multiple passes e.g. shadows?

    const shadowPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [],
        depthStencilAttachment: {
            view: shadowDepthTextureView,
            depthLoadValue: 1.0,
            depthStoreOp: 'store',
            stencilLoadValue: 0,
            stencilStoreOp: 'store',
        },
    };

    let shadowRenderBundle: GPURenderBundle;
    let renderBundle: GPURenderBundle;

    function rebuildBundles(meshPools: MeshMemoryPool[]) {
        // create render bundle
        const bundleRenderDesc: GPURenderBundleEncoderDescriptor = {
            colorFormats: [swapChainFormat],
            depthStencilFormat: depthStencilFormat,
            sampleCount,
        }

        const bundleEncoder = device.createRenderBundleEncoder(bundleRenderDesc);

        for (let pool of meshPools) {
            if (pool._opts.backfaceCulling)
                bundleEncoder.setPipeline(renderPipeline);
            else
                bundleEncoder.setPipeline(renderPipelineTwosided);

            bundleEncoder.setBindGroup(0, renderSharedUniBindGroup);
            const modelUniBindGroup = device.createBindGroup({
                layout: modelUniBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: pool._meshUniBuffer,
                            offset: 0, // TODO(@darzu): different offsets per model
                            // TODO(@darzu): needed?
                            size: meshUniByteSize,
                        },
                    },
                ],
            });
            console.log(`bufer size? ${pool._numVerts * vertByteSize}`)
            bundleEncoder.setVertexBuffer(0, pool._vertBuffer, 0, pool._numVerts * vertByteSize);
            // bundleEncoder.setVertexBuffer(1, instanceDataBuffer);
            if (pool._indexBuffer)
                bundleEncoder.setIndexBuffer(pool._indexBuffer, 'uint16');
            // TODO(@darzu): one draw call per mesh?
            const uniOffset = [0];
            for (let m of pool._meshes) {
                // TODO(@darzu): set bind group
                uniOffset[0] = m.modelUniByteOffset;
                bundleEncoder.setBindGroup(1, modelUniBindGroup, uniOffset);
                console.dir(m)
                if (pool._indexBuffer)
                    bundleEncoder.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
                else {
                    console.log(`drawing ${m.triCount * 3} vertices starting at ${m.vertNumOffset}`)
                    // console.log(`indices:`);
                    bundleEncoder.draw(m.triCount * 3, undefined, m.vertNumOffset);
                }
            }
        }
        renderBundle = bundleEncoder.finish()
    }

    function render(commandEncoder: GPUCommandEncoder, meshPools: MeshMemoryPool[], canvasWidth: number, canvasHeight: number) {
        // console.log(`w: ${canvasWidth}, h: ${canvasHeight}`)
        resize(canvasWidth, canvasHeight);

        // TODO(@darzu):  this feels akward
        // Acquire next image from swapchain
        // colorTexture = swapChain.getCurrentTexture();
        // colorTextureView = colorTexture.createView();

        const colorAtt: GPURenderPassColorAttachmentNew = {
            view: colorTextureView,
            resolveTarget: swapChain.getCurrentTexture().createView(),
            loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
            storeOp: 'store',
        };
        const renderPassDescriptor = {
            colorAttachments: [colorAtt],
            depthStencilAttachment: {
                view: depthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        } as const;

        // const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
        // // shadowPassEncoder.executeBundles([shadowRenderBundle]);
        // // TODO(@darzu): use bundle
        // {
        //     shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
        //     for (let pool of meshPools) {
        //         if (pool._opts.backfaceCulling)
        //             shadowPass.setPipeline(shadowPipeline);
        //         else
        //             shadowPass.setPipeline(shadowPipelineTwosided);

        //         const modelUniBindGroup = device.createBindGroup({
        //             layout: modelUniBindGroupLayout,
        //             entries: [
        //                 {
        //                     binding: 0,
        //                     resource: {
        //                         buffer: pool._meshUniBuffer,
        //                         offset: 0, // TODO(@darzu): different offsets per model
        //                         // TODO(@darzu): needed?
        //                         size: meshUniByteSize,
        //                     },
        //                 },
        //             ],
        //         });
        //         shadowPass.setVertexBuffer(0, pool._vertBuffer);
        //         shadowPass.setVertexBuffer(1, instanceDataBuffer);
        //         if (pool._indexBuffer)
        //             shadowPass.setIndexBuffer(pool._indexBuffer, 'uint16');
        //         // TODO(@darzu): one draw call per mesh?
        //         const uniOffset = [0];
        //         for (let m of pool._meshes) {
        //             // TODO(@darzu): set bind group
        //             uniOffset[0] = m.modelUniByteOffset;
        //             shadowPass.setBindGroup(1, modelUniBindGroup, uniOffset);
        //             if (pool._indexBuffer)
        //                 shadowPass.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        //             else
        //                 shadowPass.draw(m.triCount * 3, undefined, undefined, m.vertNumOffset);
        //         }
        //     }
        //     // shadowRenderBundle = shadowPass.finish()
        // }
        // shadowPass.endPass();

        const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        renderPassEncoder.executeBundles([renderBundle]);
        renderPassEncoder.endPass();

        return commandEncoder;
    }

    const res: MeshRenderer = {
        sharedUniBuffer,
        rebuildBundles,
        render,
    };
    return res;
}
