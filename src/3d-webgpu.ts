import { mat4, vec3 } from './ext/gl-matrix.js';

// face normals vs vertex normals
interface Mesh {
    // vertex positions (x,y,z)
    pos: vec3[];
    // triangles (vert indices, ccw)
    tri: vec3[];
}
interface ExpandedMesh extends Mesh {
    // face normals, per triangle
    fnorm: vec3[];
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
        [3, 4, 0],
        [3, 7, 4],
        // left
        [2, 1, 5],
        [2, 5, 6],
        // bottom
        [6, 3, 2],
        [6, 7, 3],
        // back
        [5, 4, 7],
        [5, 4, 6],
    ]
}

const PLANE: Mesh = {
    pos: [
        [+10, 0, +10],
        [-10, 0, +10],
        [+10, 0, -10],
        [-10, 0, -10],
    ],
    tri: [
        // top
        [0, 2, 3],
        [0, 3, 1],
        // bottom
        [3, 2, 0],
        [1, 3, 0],
    ]
}

function computeNormal([p1, p2, p3]: [vec3, vec3, vec3]): vec3 {
    // https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    // cross product of two edges
    // edge 1
    const u: vec3 = [0, 0, 0]
    vec3.sub(u, p2, p1)
    // edge 2
    const v: vec3 = [0, 0, 0]
    vec3.sub(v, p3, p1)
    // cross
    const n: vec3 = [0, 0, 0]
    vec3.cross(n, u, v)

    vec3.normalize(n, n)

    return n;
}
function computeNormals(m: Mesh): vec3[] {
    const triPoses = m.tri.map(([i0, i1, i2]) => [m.pos[i0], m.pos[i1], m.pos[i2]] as [vec3, vec3, vec3])
    return triPoses.map(computeNormal)
}

// TODO: canvas ref
// TODO: navigator.gpu typings
//          @webgpu/types

const vertexPositionColorWGSL =
`
[[stage(fragment)]]
fn main([[location(0)]] color: vec4<f32>) -> [[location(0)]] vec4<f32> {
    var xTan: vec3<f32> = dpdx(color).xyz;
    var yTan: vec3<f32> = dpdy(color).xyz;
    var norm: vec3<f32> = normalize(cross(xTan, yTan));

    var lDirection: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var lColor: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);
    var ambient: vec4<f32> = vec4<f32>(0.0, 0.2, 0.2, 0.2);

    var diffuse: vec4<f32> = vec4<f32>(max(dot(lDirection, -norm), 0.0) * lColor, 1.0);

    return ambient + diffuse;
    // return vec4<f32>(norm, 1.0);
}
`;

const basicVertWGSL =
`
[[block]] struct Uniforms {
    modelViewProjectionMatrix : mat4x4<f32>;
};
[[binding(0), group(0)]] var<uniform> uniforms : Uniforms;

struct VertexOutput {
    [[builtin(position)]] pos : vec4<f32>;
    [[location(0)]] color: vec4<f32>;
};

[[stage(vertex)]]
fn main(
    [[location(0)]] position : vec3<f32>,
    [[location(1)]] normal : vec3<f32>
    ) -> VertexOutput {
    var output : VertexOutput;
    var pos4: vec4<f32> = vec4<f32>(position, 1.0);
    output.pos = uniforms.modelViewProjectionMatrix * pos4;
    // output.color = vec4<f32>(normal, 1.0);
    // output.color = 0.5 * (pos4 + vec4<f32>(1.0, 1.0, 1.0, 1.0));
    output.color = uniforms.modelViewProjectionMatrix * pos4;

    return output;
}
`;

const shadowDepthTextureSize = 1024;

const maxNumVerts = 1000;
const maxNumTri = 1000;

const vertStride = (3/*pos*/ + 3/*norm*/)
const vertSize = Float32Array.BYTES_PER_ELEMENT * vertStride
const triStride = 3/*ind per tri*/;
const triSize = Uint16Array.BYTES_PER_ELEMENT * triStride;

function addMeshToBuffers(m: Mesh, verts: Float32Array, numVerts: number, indices: Uint16Array, numTri: number): void {
    const norms = computeNormals(m);
    m.pos.forEach((v, i) => {
        const off = (numVerts + i) * vertStride
        verts[off + 0] = v[0]
        verts[off + 1] = v[1]
        verts[off + 2] = v[2]
        // TODO(@darzu): normals needed?
        verts[off + 3] = 0
        verts[off + 4] = 0
        verts[off + 5] = 0
    })
    m.tri.forEach((t, i) => {
        const off = (numTri + i) * triStride
        indices[off + 0] = t[0] + numVerts
        indices[off + 1] = t[1] + numVerts
        indices[off + 2] = t[2] + numVerts
        // set vertex normals for the first vertex per triangle
        // verts[off + t[0] + 3] = norms[i][0]
    })
}

const sampleCount = 4;

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

    /*
    tracking meshes:
        add to vertex & index buffers
            add current vertex count to as triangle offset
        resize buffers if needed
            nahh.. fixed size, max count
        track current number of vertices

    */
    let numVerts = 0;
    let numTris = 0;

    const verticesBuffer = device.createBuffer({
        size: maxNumVerts * vertSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });

    const indexBuffer = device.createBuffer({
        size: maxNumTri * triSize,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });

    {
        const vertsMap = new Float32Array(verticesBuffer.getMappedRange())
        const indMap = new Uint16Array(indexBuffer.getMappedRange());

        function addMesh(m: Mesh) {
            if (numVerts + m.pos.length > maxNumVerts) {
                console.error("Too many vertices!")
                return;
            }
            if (numTris + m.tri.length > maxNumTri) {
                console.error("Too many triangles!")
                return;
            }

            addMeshToBuffers(m, vertsMap, numVerts, indMap, numTris);
            numVerts += m.pos.length;
            numTris += m.tri.length;
        }

        {
            // TODO(@darzu): add meshes!
            addMesh(CUBE);
            addMesh(PLANE);
        }

        indexBuffer.unmap();
        verticesBuffer.unmap();
    }

    // GPUDepthStencilStateDescriptor


    // Create the depth texture for rendering/sampling the shadow map.
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
    const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
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
                    arrayStride: vertSize,
                    attributes: [
                        {
                            // position
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3',
                        },
                        {
                            // normals
                            shaderLocation: 1,
                            offset: 0,
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
            format: 'depth24plus',
        },
        multisample: {
            count: sampleCount,
        },
    });

    const depthTexture = device.createTexture({
        size: { width: canvasRef.width, height: canvasRef.width },
        format: 'depth24plus',
        sampleCount,
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

    // Declare swapchain image handles
    let colorTexture: GPUTexture = device.createTexture({
        size: {
            width: canvasRef.width,
            height: canvasRef.height,
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



    const aspect = Math.abs(canvasRef.width / canvasRef.height);
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

    function getTransformationMatrix() {
        const viewMatrix = mat4.create();
        mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -40));
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


        // Acquire next image from swapchain
        colorTexture = swapChain.getCurrentTexture();
        colorTextureView = colorTexture.createView();
        renderPassDescriptor.colorAttachments[0].resolveTarget = colorTextureView;

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.setVertexBuffer(0, verticesBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(numTris * 3);
        // passEncoder.draw(CUBE.pos.length, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
};

// Attach to html
let canvas = document.getElementById('my_Canvas') as HTMLCanvasElement;
await init(canvas)


// scratch


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