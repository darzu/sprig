import { mat4, vec3 } from './ext/gl-matrix.js';

// face normals vs vertex normals
interface Mesh {
    // vertex positions (x,y,z)
    pos: [number, number, number][];
    // triangles (vert indices, ccw)
    tri: [number, number, number][];
}
interface ExpandedMesh extends Mesh {
    // face normals, per triangle
    fnorm: [number, number, number][];
}

const CUBE: Mesh = {
    pos: [
        [+1.0, +1.0, +1.0],
        [-1.0, +1.0, +1.0],
        [-1.0, -1.0, +1.0],
        [+1.0, -1.0, +1.0],
        [+1.0, +1.0, -1.0],
        [-1.0, +1.0, -1.0],
        [-1.0, -1.0, -1.0],
        [+1.0, -1.0, -1.0],
    ],
    tri: [
        // front
        [0, 1, 2],
        [0, 2, 3],
        // top
        [4, 5, 1],
        [4, 1, 0],
        // right
        [4, 0, 3],
        [4, 3, 7],
        // left
        [1, 5, 2],
        [2, 5, 6],
        // bottom
        [6, 3, 2],
        [6, 7, 3],
        // back
        [5, 4, 7],
        [5, 4, 6],
    ]
}

// TODO: canvas ref
// TODO: navigator.gpu typings
//          @webgpu/types

const vertexPositionColorWGSL =
`
[[stage(fragment)]]
fn main([[location(0)]] fragUV: vec2<f32>,
        [[location(1)]] fragPosition: vec4<f32>) -> [[location(0)]] vec4<f32> {
    return fragPosition;
}
`;

const basicVertWGSL = `
[[block]] struct Uniforms {
    modelViewProjectionMatrix : mat4x4<f32>;
};
[[binding(0), group(0)]] var<uniform> uniforms : Uniforms;

struct VertexOutput {
    [[builtin(position)]] Position : vec4<f32>;
    [[location(0)]] fragUV : vec2<f32>;
    [[location(1)]] fragPosition: vec4<f32>;
};

[[stage(vertex)]]
fn main([[location(0)]] position : vec4<f32>,
        [[location(1)]] uv : vec2<f32>) -> VertexOutput {
    var output : VertexOutput;
    output.Position = uniforms.modelViewProjectionMatrix * position;
    output.fragUV = uv;
    output.fragPosition = 0.5 * (position + vec4<f32>(1.0, 1.0, 1.0, 1.0));
    // output.fragPosition = position;

    return output;
}
`;

export const cubeVertexSize = 4 * 10; // Byte size of one cube vertex.
export const cubePositionOffset = 0;
export const cubeColorOffset = 4 * 4; // Byte offset of cube vertex color attribute.
export const cubeUVOffset = 4 * 8;
export const cubeVertexCount = 36;

// prettier-ignore
export const cubeVertexArray = new Float32Array([
    // float4 position, float4 color, float2 uv,
    1, -1, 1, 1,    1, 0, 1, 1, 1, 1,
    -1, -1, 1, 1,   1, 0, 1, 1, 0, 1,
    -1, -1, -1, 1,  1, 0, 1, 1, 0, 0,
    1, -1, -1, 1,   1, 0, 1, 1, 1, 0,
    1, -1, 1, 1,    1, 0, 1, 1, 1, 1,
    -1, -1, -1, 1,  1, 0, 1, 1, 0, 0,

    1, 1, 1, 1,     1, 0, 1, 1, 1, 1,
    1, -1, 1, 1,    1, 0, 1, 1, 0, 1,
    1, -1, -1, 1,   1, 0, 1, 1, 0, 0,
    1, 1, -1, 1,    1, 0, 1, 1, 1, 0,
    1, 1, 1, 1,     1, 0, 1, 1, 1, 1,
    1, -1, -1, 1,   1, 0, 1, 1, 0, 0,

    -1, 1, 1, 1, 0, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 0, 1,
    1, 1, -1, 1, 1, 1, 0, 1, 0, 0,
    -1, 1, -1, 1, 0, 1, 0, 1, 1, 0,
    -1, 1, 1, 1, 0, 1, 1, 1, 1, 1,
    1, 1, -1, 1, 1, 1, 0, 1, 0, 0,

    -1, -1, 1, 1, 0, 0, 1, 1, 1, 1,
    -1, 1, 1, 1, 0, 1, 1, 1, 0, 1,
    -1, 1, -1, 1, 0, 1, 0, 1, 0, 0,
    -1, -1, -1, 1, 0, 0, 0, 1, 1, 0,
    -1, -1, 1, 1, 0, 0, 1, 1, 1, 1,
    -1, 1, -1, 1, 0, 1, 0, 1, 0, 0,

    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    -1, 1, 1, 1, 0, 1, 1, 1, 0, 1,
    -1, -1, 1, 1, 0, 0, 1, 1, 0, 0,
    -1, -1, 1, 1, 0, 0, 1, 1, 0, 0,
    1, -1, 1, 1, 1, 0, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,

    1, -1, -1, 1, 1, 0, 0, 1, 1, 1,
    -1, -1, -1, 1, 0, 0, 0, 1, 0, 1,
    -1, 1, -1, 1, 0, 1, 0, 1, 0, 0,
    1, 1, -1, 1, 1, 1, 0, 1, 1, 0,
    1, -1, -1, 1, 1, 0, 0, 1, 1, 1,
    -1, 1, -1, 1, 0, 1, 0, 1, 0, 0,
]);

const shadowDepthTextureSize = 1024;

async function init(canvasRef: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    if (!canvasRef === null) return;
    const context = canvasRef.getContext('gpupresent')!;

    const swapChainFormat = 'bgra8unorm';

    const swapChain = context.configureSwapChain({
        device,
        format: swapChainFormat,
    });

    // Create a vertex buffer from the cube data.
    const verticesBuffer = device.createBuffer({
        size: cubeVertexArray.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
    verticesBuffer.unmap();
    // TODO: vertex, index, normals
    // {
    //     // Create the model vertex buffer.
    //     const vertexBuffer = device.createBuffer({
    //         size: mesh.positions.length * 3 * 2 * Float32Array.BYTES_PER_ELEMENT,
    //         usage: GPUBufferUsage.VERTEX,
    //         mappedAtCreation: true,
    //     });
    //     {
    //         const mapping = new Float32Array(vertexBuffer.getMappedRange());
    //         for (let i = 0; i < mesh.positions.length; ++i) {
    //         mapping.set(mesh.positions[i], 6 * i);
    //         mapping.set(mesh.normals[i], 6 * i + 3);
    //         }
    //         vertexBuffer.unmap();
    //     }

    //     // Create the model index buffer.
    //     const indexCount = mesh.triangles.length * 3;
    //     const indexBuffer = device.createBuffer({
    //         size: indexCount * Uint16Array.BYTES_PER_ELEMENT,
    //         usage: GPUBufferUsage.INDEX,
    //         mappedAtCreation: true,
    //     });
    //     {
    //         const mapping = new Uint16Array(indexBuffer.getMappedRange());
    //         for (let i = 0; i < mesh.triangles.length; ++i) {
    //         mapping.set(mesh.triangles[i], 3 * i);
    //         }
    //         indexBuffer.unmap();
    //     }
    // }

    // Create the depth texture for rendering/sampling the shadow map.
    const shadowDepthTexture = device.createTexture({
        size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
        format: 'depth32float',
    });
    const shadowDepthTextureView = shadowDepthTexture.createView();

    // // Create some common descriptors used for both the shadow pipeline
    // // and the color rendering pipeline.
    // const vertexBuffers: Iterable<GPUVertexBufferLayout> = [
    //     {
    //     arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
    //     attributes: [
    //         {
    //         // position
    //         shaderLocation: 0,
    //         offset: 0,
    //         format: 'float32x3',
    //         },
    //         {
    //         // normal
    //         shaderLocation: 1,
    //         offset: Float32Array.BYTES_PER_ELEMENT * 3,
    //         format: 'float32x3',
    //         },
    //     ],
    //     },
    // ];

    const pipeline = device.createRenderPipeline({
        vertex: {
            module: device.createShaderModule({
                code: basicVertWGSL,
            }),
            entryPoint: 'main',
            buffers: [
                {
                    arrayStride: cubeVertexSize,
                    attributes: [
                        {
                            // position
                            shaderLocation: 0,
                            offset: cubePositionOffset,
                            format: 'float32x4',
                        },
                        {
                            // uv
                            shaderLocation: 1,
                            offset: cubeUVOffset,
                            format: 'float32x2',
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
        },

        // Enable depth testing so that the fragment closest to the camera
        // is rendered in front.
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        },
    });

    const depthTexture = device.createTexture({
        size: { width: canvasRef.width, height: canvasRef.width },
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const uniformBufferSize = 4 * 16; // 4x4 matrix
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer,
                },
            },
        ],
    });

    const colorAtt: GPURenderPassColorAttachmentNew = {
        view: { __brand: "GPUTextureView", label: "" }, // Assigned later
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
        storeOp: 'store',
    };
    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [colorAtt],
        depthStencilAttachment: {
            view: depthTexture.createView(),

            depthLoadValue: 1.0,
            depthStoreOp: 'store',
            stencilLoadValue: 0,
            stencilStoreOp: 'store',
        },
    };

    const aspect = Math.abs(canvasRef.width / canvasRef.height);
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

    function getTransformationMatrix() {
        const viewMatrix = mat4.create();
        mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
        const now = Date.now() / 1000;
        mat4.rotate(
            viewMatrix,
            viewMatrix,
            1,
            vec3.fromValues(Math.sin(now), Math.cos(now), 0)
        );

        const modelViewProjectionMatrix = mat4.create();
        mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

        return modelViewProjectionMatrix as Float32Array;
    }

    function frame() {
        // Sample is no longer the active page.
        if (!canvasRef) return;

        const transformationMatrix = getTransformationMatrix();
        device.queue.writeBuffer(
            uniformBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
        );
        (renderPassDescriptor.colorAttachments as GPURenderPassColorAttachmentNew[])[0].view = swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.setVertexBuffer(0, verticesBuffer);
        passEncoder.draw(cubeVertexCount, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
};

// Attach to html
let canvas = document.getElementById('my_Canvas') as HTMLCanvasElement;
await init(canvas)