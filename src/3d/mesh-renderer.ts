// rendering pipeline for meshes

import { mat4 } from "../ext/gl-matrix.js";
import { mat4ByteSize, MeshMemoryPool as MeshPool, vec3ByteSize } from "./mesh.js";

const shadowDepthTextureSize = 1024 * 4;

const wgslShaders = {
    vertexShadow: `
  [[block]] struct Scene {
    cameraViewProjMatrix : mat4x4<f32>;
    lightViewProjMatrix : mat4x4<f32>;
    lightPos : vec3<f32>;
  };

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

    vertex: `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightPos : vec3<f32>;
    };

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

    [[builtin(position)]] Position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        [[location(0)]] position : vec3<f32>,
        [[location(1)]] color : vec3<f32>,
        [[location(2)]] normal : vec3<f32>
        ) -> VertexOutput {
    var output : VertexOutput;

    // XY is in (-1, 1) space, Z is in (0, 1) space
    let posFromLight : vec4<f32> = scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);

    // Convert XY to (0, 1)
    // Y is flipped because texture coords are Y-down.
    output.shadowPos = vec3<f32>(
        posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
        posFromLight.z
    );

    output.Position = scene.cameraViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
    output.fragPos = output.Position.xyz;
    // output.fragNorm = normal;
    output.fragNorm = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
    output.color = color;
    return output;
    }
    `,
    fragment: `
    [[block]] struct Scene {
    lightViewProjMatrix : mat4x4<f32>;
    cameraViewProjMatrix : mat4x4<f32>;
    lightPos : vec3<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

    struct FragmentInput {
    [[location(0)]] shadowPos : vec3<f32>;
    [[location(1)]] fragPos : vec3<f32>;
    [[location(2)]] fragNorm : vec3<f32>;
    [[location(3)]] color : vec3<f32>;
    };

    let albedo : vec3<f32> = vec3<f32>(0.9, 0.9, 0.9);
    let ambientFactor : f32 = 0.6;
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

    let lambertFactor : f32 = max(dot(normalize(scene.lightPos - input.fragPos), input.fragNorm), 0.0);
    let lightingFactor : f32 = min(visibility * lambertFactor, 1.0) * 1.5;
    let diffuse: vec3<f32> = lightColor * lightingFactor;
    let ambient: vec3<f32> = vec3<f32>(0.9, 0.9, 0.9) * ambientFactor;

    // return vec4<f32>(input.fragNorm, 1.0);

    return vec4<f32>((diffuse + ambient) * input.color, 1.0);

    // return vec4<f32>(lightingFactor * input.color, 1.0);
    // return vec4<f32>(lightingFactor * albedo, 1.0);
    }
    `,
}

const basicVertWGSL =
    `
[[block]] struct SharedUnis {
    viewProj : mat4x4<f32>;
    // TODO: use
    lightViewProjMatrix : mat4x4<f32>;
    lightPos : vec3<f32>;
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
    rebuildBundles: () => void,
    render: (commandEncoder: GPUCommandEncoder) => void,
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
        mat4ByteSize * 2 // camera and light pos
        + vec3ByteSize * 1;
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

    const vertexBuffersLayout: GPUVertexBufferLayout[] = [
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
                {
                    // normals
                    shaderLocation: 2,
                    offset: 4 * 3 * 2,
                    format: 'float32x3',
                },
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
                    shaderLocation: 3,
                    offset: 0,
                    format: 'float32x3',
                },
            ],
        },
    ];

    const primitive: GPUPrimitiveState = {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
        // frontFace: 'ccw', // TODO(dz):
    };

    const shadowPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [shadowSharedUniBindGroupLayout, modelUniBindGroupLayout],
    });

    const shadowPipeline = device.createRenderPipeline({
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
        primitive,
    });

    const renderPipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [renderSharedUniBindGroupLayout, modelUniBindGroupLayout],
    });

    const renderPipeline = device.createRenderPipeline({
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
        primitive,

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
    // 'depth24plus-stencil8'

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

    function rebuildBundles() {
        // TODO(@darzu): use bundle
        // {
        //     const shadowBundleRenderDesc: GPURenderBundleEncoderDescriptor = {
        //         colorFormats: [],
        //         // TODO(@darzu): 
        //         // depthStencilFormat: depthStencilFormat,
        //         // TODO(@darzu): 
        //         // sampleCount: 1,
        //     }

        //     const shadowPass = device.createRenderBundleEncoder(shadowBundleRenderDesc);

        //     shadowPass.setPipeline(shadowPipeline);
        //     shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
        //     shadowPass.setVertexBuffer(0, meshPool._vertBuffer);
        //     shadowPass.setVertexBuffer(1, instanceDataBuffer);
        //     shadowPass.setIndexBuffer(meshPool._indexBuffer, 'uint16');
        //     // TODO(@darzu): one draw call per mesh?
        //     const uniOffset = [0];
        //     for (let m of meshPool._meshes) {
        //         // TODO(@darzu): set bind group
        //         uniOffset[0] = m.modelUniByteOffset;
        //         shadowPass.setBindGroup(1, modelUniBindGroup, uniOffset);
        //         shadowPass.drawIndexed(m.model.tri.length * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        //     }
        //     shadowRenderBundle = shadowPass.finish()
        // }
        {
            // create render bundle
            const bundleRenderDesc: GPURenderBundleEncoderDescriptor = {
                colorFormats: [swapChainFormat],
                depthStencilFormat: depthStencilFormat,
                sampleCount,
            }

            const bundleEncoder = device.createRenderBundleEncoder(bundleRenderDesc);

            bundleEncoder.setPipeline(renderPipeline);
            bundleEncoder.setBindGroup(0, renderSharedUniBindGroup);
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
            renderBundle = bundleEncoder.finish()
        }
    }

    function render(commandEncoder: GPUCommandEncoder) {
        // TODO(@darzu):  this feels akward
        // Acquire next image from swapchain
        colorTexture = swapChain.getCurrentTexture();
        colorTextureView = colorTexture.createView();
        renderPassDescriptor.colorAttachments[0].resolveTarget = colorTextureView;

        const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
        // shadowPassEncoder.executeBundles([shadowRenderBundle]);
        // TODO(@darzu): use bundle
        {
            shadowPass.setPipeline(shadowPipeline);
            shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
            shadowPass.setVertexBuffer(0, meshPool._vertBuffer);
            shadowPass.setVertexBuffer(1, instanceDataBuffer);
            shadowPass.setIndexBuffer(meshPool._indexBuffer, 'uint16');
            // TODO(@darzu): one draw call per mesh?
            const uniOffset = [0];
            for (let m of meshPool._meshes) {
                // TODO(@darzu): set bind group
                uniOffset[0] = m.modelUniByteOffset;
                shadowPass.setBindGroup(1, modelUniBindGroup, uniOffset);
                shadowPass.drawIndexed(m.model.tri.length * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
            }
            // shadowRenderBundle = shadowPass.finish()
        }
        shadowPass.endPass();

        const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        renderPassEncoder.executeBundles([renderBundle]);
        renderPassEncoder.endPass();

        return commandEncoder;
    }

    return {
        sharedUniBuffer,
        rebuildBundles,
        render,
    };
}
