import { mat4, vec3 } from '../ext/gl-matrix.js';
import { jitter } from '../math.js';
import { initGrassSystem } from './grass.js';

// Defines shaders in WGSL for the shadow and regular rendering pipelines. Likely you'll want
// these in external files but they've been inlined for redistribution convenience.
const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
    };
`;
const vertexShaderForShadows = `
    ${shaderSceneStruct}

    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    [[stage(vertex)]]
    fn main([[location(0)]] position : vec3<f32>) -> [[builtin(position)]] vec4<f32> {
        return scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
    }
`;
const fragmentShaderForShadows = `
    [[stage(fragment)]] fn main() { }
`;
const vertexShaderOutput = `
    struct VertexOutput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(2)]] [[interpolate(flat)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };
`
const vertexShader = `
    ${shaderSceneStruct}

    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    ${vertexShaderOutput}

    [[stage(vertex)]]
    fn main(
        [[location(0)]] position : vec3<f32>,
        [[location(1)]] color : vec3<f32>,
        [[location(2)]] normal : vec3<f32>,
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.modelMatrix * vec4<f32>(position, 1.0);
        // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight : vec4<f32> = scene.lightViewProjMatrix * worldPos;
        // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
        output.shadowPos = vec3<f32>(
            posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
            posFromLight.z
        );
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
        output.color = color;
        return output;
    }
`;
const fragmentShader = `
    ${shaderSceneStruct}

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    // TODO(@darzu): waiting on this sample to work again: http://austin-eng.com/webgpu-samples/samples/shadowMapping
    // [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

    ${vertexShaderOutput}

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let shadowVis : f32 = 1.0;
        // let shadowVis : f32 = textureSampleCompare(shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);
        let sunLight : f32 = shadowVis * clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// useful constants
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerUint16 = Uint16Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

// render pipeline parameters
const antiAliasSampleCount = 4;
const swapChainFormat = 'bgra8unorm';
const depthStencilFormat = 'depth24plus-stencil8';
const shadowDepthStencilFormat = 'depth32float';
const backgroundColor = { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };

// this state is recomputed upon canvas resize
let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspectRatio = 1;

// recomputes textures, widths, and aspect ratio on canvas resize
function checkCanvasResize(device: GPUDevice, canvasWidth: number, canvasHeight: number) {
    if (lastWidth === canvasWidth && lastHeight === canvasHeight)
        return;

    if (depthTexture) depthTexture.destroy();
    if (colorTexture) colorTexture.destroy();

    depthTexture = device.createTexture({
        size: { width: canvasWidth, height: canvasHeight },
        format: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthTextureView = depthTexture.createView();

    colorTexture = device.createTexture({
        size: { width: canvasWidth, height: canvasHeight },
        sampleCount: antiAliasSampleCount,
        format: swapChainFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });;
    colorTextureView = colorTexture.createView();

    lastWidth = canvasWidth;
    lastHeight = canvasHeight;

    aspectRatio = Math.abs(canvasWidth / canvasHeight);
}

// defines the geometry and coloring of a mesh
export interface Mesh {
    pos: vec3[];
    tri: vec3[];
    colors: vec3[];  // colors per triangle in r,g,b float [0-1] format
    // format flags:
    usesProvoking?: boolean,
    verticesUnshared?: boolean, // TODO(@darzu): support
}

function unshareVertices(input: Mesh): Mesh {
    const pos: vec3[] = []
    const tri: vec3[] = []
    input.tri.forEach(([i0, i1, i2], i) => {
        pos.push(input.pos[i0]);
        pos.push(input.pos[i1]);
        pos.push(input.pos[i2]);
        tri.push([
            i * 3 + 0,
            i * 3 + 1,
            i * 3 + 2,
        ])
    })
    return { pos, tri, colors: input.colors, verticesUnshared: true }
}
function unshareProvokingVertices(input: Mesh): Mesh {
    const pos: vec3[] = [...input.pos]
    const tri: vec3[] = []
    const provoking: { [key: number]: boolean } = {}
    input.tri.forEach(([i0, i1, i2], triI) => {
        if (!provoking[i0]) {
            // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
            provoking[i0] = true;
            tri.push([i0, i1, i2])
        } else if (!provoking[i1]) {
            // First vertex was taken, so let's see if we can rotate the indices to get an unused 
            // provoking vertex.
            provoking[i1] = true;
            tri.push([i1, i2, i0])
        } else if (!provoking[i2]) {
            // ditto
            provoking[i2] = true;
            tri.push([i2, i0, i1])
        } else {
            // All vertices are taken, so create a new one
            const i3 = pos.length;
            pos.push(input.pos[i0])
            provoking[i3] = true;
            tri.push([i3, i1, i2])
        }
    })
    return { ...input, pos, tri, usesProvoking: true }
}

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need
// to track offsets into those buffers so we can make modifications and form draw calls.
export interface MeshHandle {
    // handles into the buffers
    pool: MeshPool,
    vertNumOffset: number,
    indicesNumOffset: number,
    modelUniByteOffset: number,
    numTris: number,
    // data
    transform: mat4,
    model?: Mesh,
}

// define our meshes (ideally these would be imported from a standard format)
const CUBE: Mesh = unshareProvokingVertices({
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
        [0, 1, 2], [0, 2, 3], // front
        [4, 5, 1], [4, 1, 0], // top
        [3, 4, 0], [3, 7, 4], // right
        [2, 1, 5], [2, 5, 6], // left
        [6, 3, 2], [6, 7, 3], // bottom
        [5, 4, 7], [5, 7, 6], // back
    ],
    colors: [
        [0.2, 0, 0], [0.2, 0, 0], // front
        [0.2, 0, 0], [0.2, 0, 0], // top
        [0.2, 0, 0], [0.2, 0, 0], // right
        [0.2, 0, 0], [0.2, 0, 0], // left
        [0.2, 0, 0], [0.2, 0, 0], // bottom
        [0.2, 0, 0], [0.2, 0, 0], // back
    ],
})
const PLANE: Mesh = unshareProvokingVertices({
    pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
    ],
    tri: [
        [0, 2, 3], [0, 3, 1], // top
        [3, 2, 0], [1, 3, 0], // bottom
    ],
    colors: [
        [0.02, 0.02, 0.02], [0.02, 0.02, 0.02],
        [0.02, 0.02, 0.02], [0.02, 0.02, 0.02],
    ],
})

// TODO(@darzu): VERTEX FORMAT
// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
const vertexDataFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' }, // normals
];
// these help us pack and use vertices in that format
export const vertElStride = (3/*pos*/ + 3/*color*/ + 3/*normal*/)
export const vertByteSize = bytesPerFloat * vertElStride;

// define the format of our models' uniform buffer
const meshUniByteSizeExact =
    bytesPerMat4 // transform
    + bytesPerFloat // max draw distance;
export const meshUniByteSizeAligned = align(meshUniByteSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the format of our scene's uniform data
const sceneUniBufferSizeExact =
    bytesPerMat4 * 2 // camera and light projection
    + bytesPerVec3 * 1 // light pos
export const sceneUniBufferSizeAligned = align(sceneUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned

// TODO(@darzu): vertex formatting?
interface VertexFormat {
    // addToBuffer
    // 
}

export interface MeshPoolOpts {
    maxMeshes: number,
    maxTris: number,
    maxVerts: number,
}
export interface MeshPoolBuilder {
    // options
    opts: MeshPoolOpts,
    // memory mapped buffers
    verticesMap: Float32Array,
    indicesMap: Uint16Array,
    uniformMap: Uint8Array,
    numTris: number,
    numVerts: number,
    allMeshes: MeshHandle[],
    // handles
    device: GPUDevice,
    poolHandle: MeshPool,
    // methods
    addMesh: (m: Mesh) => MeshHandle,
    finish: () => MeshPool,
}
export interface MeshPool {
    // options
    opts: MeshPoolOpts,
    // buffers
    verticesBuffer: GPUBuffer,
    indicesBuffer: GPUBuffer,
    _meshUniBuffer: GPUBuffer,
    // data
    allMeshes: MeshHandle[],
    numTris: number,
    numVerts: number,
    // handles
    device: GPUDevice,
}

export function createMeshPoolBuilder(device: GPUDevice, opts: MeshPoolOpts): MeshPoolBuilder {
    const { maxMeshes, maxTris, maxVerts } = opts;

    // log our estimated space usage stats
    console.log(`Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`);
    console.log(`   ${(maxVerts * vertByteSize / 1024).toFixed(1)} KB for verts`);
    console.log(`   ${(maxTris * bytesPerTri / 1024).toFixed(1)} KB for indices`);
    console.log(`   ${(maxMeshes * meshUniByteSizeAligned / 1024).toFixed(1)} KB for other object data`);
    const unusedBytesPerModel = 256 - meshUniByteSizeExact % 256
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(unusedBytesPerModel * maxMeshes / 1024).toFixed(1)} KB total waste)`);
    const totalReservedBytes = maxVerts * vertByteSize + maxTris * bytesPerTri + maxMeshes * meshUniByteSizeAligned;
    console.log(`Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(1)} KB`);

    // create our mesh buffers (vertex, index, uniform)
    const verticesBuffer = device.createBuffer({
        size: maxVerts * vertByteSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const indicesBuffer = device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const _meshUniBuffer = device.createBuffer({
        size: meshUniByteSizeAligned * maxMeshes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });

    const allMeshes: MeshHandle[] = [];

    // to modify buffers, we need to map them into JS space; we'll need to unmap later
    let verticesMap = new Float32Array(verticesBuffer.getMappedRange())
    let indicesMap = new Uint16Array(indicesBuffer.getMappedRange());
    let uniformMap = new Uint8Array(_meshUniBuffer.getMappedRange());

    const pool: MeshPool = {
        opts,
        device,
        verticesBuffer,
        indicesBuffer,
        _meshUniBuffer,
        allMeshes,
        numTris: 0,
        numVerts: 0,
    }

    const builder: MeshPoolBuilder = {
        opts,
        device,
        verticesMap,
        indicesMap,
        uniformMap,
        numTris: 0,
        numVerts: 0,
        allMeshes,
        poolHandle: pool,
        addMesh,
        finish,
    };

    // add our meshes to the vertex and index buffers
    function addMesh(m: Mesh): MeshHandle {
        // m = unshareVertices(m); // work-around; see TODO inside function
        if (!m.usesProvoking)
            m = unshareProvokingVertices(m);
        if (verticesMap === null)
            throw "Use preRender() and postRender() functions"
        if (builder.numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!"
        if (builder.numTris + m.tri.length > maxTris)
            throw "Too many triangles!"

        const vertNumOffset = builder.numVerts;
        const indicesNumOffset = builder.numTris * indicesPerTriangle;

        m.pos.forEach((pos, i) => {
            const vOff = (builder.numVerts + i) * vertElStride
            verticesMap.set([...pos, ...[0.5, 0.5, 0.5], ...[1.0, 0.0, 0.0]], vOff)
        })
        m.tri.forEach((triInd, i) => {
            const iOff = (builder.numTris + i) * indicesPerTriangle
            indicesMap[iOff + 0] = triInd[0]
            indicesMap[iOff + 1] = triInd[1]
            indicesMap[iOff + 2] = triInd[2]
            const vOff = (builder.numVerts + triInd[0]) * vertElStride
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
            verticesMap.set([...m.pos[triInd[0]], ...m.colors[i], ...normal], vOff)
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        })

        builder.numVerts += m.pos.length;
        builder.numTris += m.tri.length;

        const transform = mat4.create() as Float32Array;

        const uniOffset = allMeshes.length * meshUniByteSizeAligned;
        uniformMap.set(transform, uniOffset)

        const res: MeshHandle = {
            vertNumOffset,
            indicesNumOffset,
            modelUniByteOffset: uniOffset,
            transform,
            numTris: m.tri.length,
            model: m,
            pool,
        }

        allMeshes.push(res)
        return res;
    }

    function finish(): MeshPool {
        // unmap the buffers so the GPU can use them
        verticesBuffer.unmap()
        indicesBuffer.unmap()
        _meshUniBuffer.unmap()

        pool.numTris = builder.numTris;
        pool.numVerts = builder.numVerts;

        console.log(`Finishing pool with: ${builder.numTris} triangles, ${builder.numVerts} vertices`);

        return pool;
    }

    return builder;
}

// utilities for mesh pools
// TODO(@darzu): move into pool interface?
export function gpuBufferWriteMeshTransform(m: MeshHandle) {
    m.pool.device.queue.writeBuffer(m.pool._meshUniBuffer, m.modelUniByteOffset, (m.transform as Float32Array).buffer);
}

// create a directional light and compute it's projection (for shadows) and direction
const worldOrigin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.lookAt(mat4.create(), lightPosition, worldOrigin, upVector);
const lightProjectionMatrix = mat4.ortho(mat4.create(), -80, 80, -80, 80, -200, 300);
const lightViewProjMatrix = mat4.multiply(mat4.create(), lightProjectionMatrix, lightViewMatrix);
const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
vec3.normalize(lightDir, lightDir);

type RenderFrameFn = (timeMS: number) => void;
function attachToCanvas(canvasRef: HTMLCanvasElement, device: GPUDevice): RenderFrameFn {
    // configure our canvas backed swapchain
    const context = canvasRef.getContext('gpupresent')!;
    context.configure({ device, format: swapChainFormat });

    // create our scene's uniform buffer
    const sceneUniBuffer = device.createBuffer({
        size: sceneUniBufferSizeAligned,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // setup a binding for our per-mesh uniforms
    const modelUniBindGroupLayout = device.createBindGroupLayout({
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: meshUniByteSizeAligned },
        }],
    });

    const poolBuilder = createMeshPoolBuilder(device, {
        maxMeshes: 100,
        maxTris: 300,
        maxVerts: 900
    });

    // TODO(@darzu): adding via pool should work...
    const ground = poolBuilder.addMesh(PLANE);
    const player = poolBuilder.addMesh(CUBE);
    const randomCubes: MeshHandle[] = [];
    for (let i = 0; i < 10; i++) {
        // create cubes with random colors
        const color: vec3 = [Math.random(), Math.random(), Math.random()];
        const coloredCube: Mesh = { ...CUBE, colors: CUBE.colors.map(_ => color) }
        randomCubes.push(poolBuilder.addMesh(coloredCube));
    }

    const pool = poolBuilder.finish();
    const poolUniBindGroup = device.createBindGroup({
        layout: modelUniBindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: pool._meshUniBuffer, size: meshUniByteSizeAligned, },
        }],
    });

    // place the ground
    mat4.translate(ground.transform, ground.transform, [0, -3, -8])
    mat4.scale(ground.transform, ground.transform, [10, 10, 10])
    gpuBufferWriteMeshTransform(ground);

    // initialize our cubes; each will have a random axis of rotation
    const randomCubesAxis: vec3[] = []
    for (let m of randomCubes) {
        // place and rotate cubes randomly
        mat4.translate(m.transform, m.transform, [Math.random() * 20 - 10, Math.random() * 5, -Math.random() * 10 - 5])
        const axis: vec3 = vec3.normalize(vec3.create(), [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        randomCubesAxis.push(axis)
        gpuBufferWriteMeshTransform(m);
    }

    // init grass
    const grass = initGrassSystem(device)

    // track which keys are pressed for use in the game loop
    const pressedKeys: { [keycode: string]: boolean } = {}
    window.addEventListener('keydown', (ev) => pressedKeys[ev.key.toLowerCase()] = true, false);
    window.addEventListener('keyup', (ev) => pressedKeys[ev.key.toLowerCase()] = false, false);

    // track mouse movement for use in the game loop
    let _mouseAccumulatedX = 0;
    let _mouseAccummulatedY = 0;
    window.addEventListener('mousemove', (ev) => {
        _mouseAccumulatedX += ev.movementX
        _mouseAccummulatedY += ev.movementY
    }, false);
    function takeAccumulatedMouseMovement(): { x: number, y: number } {
        const result = { x: _mouseAccumulatedX, y: _mouseAccummulatedY };
        _mouseAccumulatedX = 0; // reset accumulators
        _mouseAccummulatedY = 0;
        return result
    }

    // when the player clicks on the canvas, lock the cursor for better gaming (the browser lets them exit)
    function doLockMouse() {
        canvasRef.requestPointerLock();
        canvasRef.removeEventListener('click', doLockMouse)
    }
    canvasRef.addEventListener('click', doLockMouse)

    // create the "player", which is an affine matrix tracking position & orientation of a cube
    // the camera will follow behind it.
    const cameraOffset = mat4.create();
    pitch(cameraOffset, -Math.PI / 8)
    gpuBufferWriteMeshTransform(player)

    // write the light data to the scene uniform buffer
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 1, (lightViewProjMatrix as Float32Array).buffer);
    device.queue.writeBuffer(sceneUniBuffer, bytesPerMat4 * 2, (lightDir as Float32Array).buffer);

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const primitiveBackcull: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'none', // TODO(@darzu): 
        // cullMode: 'back', 
        frontFace: 'ccw',
    };

    // define the resource bindings for the shadow pipeline
    const shadowSceneUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
    });
    const shadowSceneUniBindGroup = device.createBindGroup({
        layout: shadowSceneUniBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: sceneUniBuffer } }
        ],
    });

    // create the texture that our shadow pass will render to
    const shadowDepthTextureDesc: GPUTextureDescriptor = {
        size: { width: 2048 * 2, height: 2048 * 2 },
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
        format: shadowDepthStencilFormat,
    }
    const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
    const shadowDepthTextureView = shadowDepthTexture.createView();

    // define the resource bindings for the mesh rendering pipeline
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            // TODO(@darzu): waiting on this sample to work again: http://austin-eng.com/webgpu-samples/samples/shadowMapping
            // { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        ],
    });
    const renderSceneUniBindGroup = device.createBindGroup({
        layout: renderSceneUniBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: sceneUniBuffer } },
            { binding: 1, resource: shadowDepthTextureView },
            // TODO(@darzu): waiting on this sample to work again: http://austin-eng.com/webgpu-samples/samples/shadowMapping
            // { binding: 2, resource: device.createSampler({ compare: 'less' }) },
        ],
    });

    // setup our first phase pipeline which tracks the depth of meshes 
    // from the point of view of the lighting so we know where the shadows are
    const shadowPipelineDesc: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
            bindGroupLayouts: [shadowSceneUniBindGroupLayout, modelUniBindGroupLayout],
        }),
        vertex: {
            module: device.createShaderModule({ code: vertexShaderForShadows }),
            entryPoint: 'main',
            buffers: [{
                arrayStride: vertByteSize,
                attributes: vertexDataFormat,
            }],
        },
        fragment: {
            module: device.createShaderModule({ code: fragmentShaderForShadows }),
            entryPoint: 'main',
            targets: [],
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: shadowDepthStencilFormat,
        },
        primitive: primitiveBackcull,
    };
    const shadowPipeline = device.createRenderPipeline(shadowPipelineDesc);

    // setup our second phase pipeline which renders meshes to the canvas
    const renderPipelineDesc: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderSceneUniBindGroupLayout, modelUniBindGroupLayout],
        }),
        vertex: {
            module: device.createShaderModule({ code: vertexShader }),
            entryPoint: 'main',
            buffers: [{
                arrayStride: vertByteSize,
                attributes: vertexDataFormat,
            }],
        },
        fragment: {
            module: device.createShaderModule({ code: fragmentShader }),
            entryPoint: 'main',
            targets: [{ format: swapChainFormat }],
        },
        primitive: primitiveBackcull,
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: depthStencilFormat,
        },
        multisample: {
            count: antiAliasSampleCount,
        },
    };
    const renderPipeline = device.createRenderPipeline(renderPipelineDesc);

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const shadowBundleEnc = device.createRenderBundleEncoder({
        colorFormats: [],
        depthStencilFormat: shadowDepthStencilFormat,
    });
    shadowBundleEnc.setPipeline(shadowPipeline);
    shadowBundleEnc.setBindGroup(0, shadowSceneUniBindGroup);
    shadowBundleEnc.setVertexBuffer(0, pool.verticesBuffer);
    shadowBundleEnc.setIndexBuffer(pool.indicesBuffer, 'uint16');
    for (let m of pool.allMeshes) {
        shadowBundleEnc.setBindGroup(1, poolUniBindGroup, [m.modelUniByteOffset]);
        shadowBundleEnc.drawIndexed(m.numTris * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
    }
    let shadowBundle = shadowBundleEnc.finish()

    const bundleEnc = device.createRenderBundleEncoder({
        colorFormats: [swapChainFormat],
        depthStencilFormat: depthStencilFormat,
        sampleCount: antiAliasSampleCount,
    });
    bundleEnc.setPipeline(renderPipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    for (let p of [pool, ...grass.getGrassPools()]) {
        // TODO(@darzu): not super happy about these being created during bundle time...
        const modelUniBindGroup = device.createBindGroup({
            layout: modelUniBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: p._meshUniBuffer, size: meshUniByteSizeAligned, },
            }],
        });

        bundleEnc.setVertexBuffer(0, p.verticesBuffer);
        bundleEnc.setIndexBuffer(p.indicesBuffer, 'uint16');
        for (let m of p.allMeshes) {
            bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
            bundleEnc.drawIndexed(m.numTris * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
        }
    }
    let renderBundle = bundleEnc.finish()

    // initialize performance metrics
    let debugDiv = document.getElementById('debug-div') as HTMLDivElement;
    let previousFrameTime = 0;
    let avgJsTimeMs = 0
    let avgFrameTimeMs = 0

    // controls for this demo
    const controlsStr = `controls: WASD, shift/c, mouse, spacebar`

    // our main game loop
    function renderFrame(timeMs: number) {
        // track performance metrics
        const start = performance.now();
        const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
        previousFrameTime = timeMs;

        // resize (if necessary)
        checkCanvasResize(device, canvasRef.width, canvasRef.height);

        // process inputs and move the player & camera
        const playerSpeed = pressedKeys[' '] ? 1.0 : 0.2; // spacebar boosts speed
        if (pressedKeys['w']) moveZ(player.transform, -playerSpeed) // forward
        if (pressedKeys['s']) moveZ(player.transform, playerSpeed) // backward
        if (pressedKeys['a']) moveX(player.transform, -playerSpeed) // left
        if (pressedKeys['d']) moveX(player.transform, playerSpeed) // right
        if (pressedKeys['shift']) moveY(player.transform, playerSpeed) // up
        if (pressedKeys['c']) moveY(player.transform, -playerSpeed) // down
        const { x: mouseX, y: mouseY } = takeAccumulatedMouseMovement();
        yaw(player.transform, -mouseX * 0.01);
        pitch(cameraOffset, -mouseY * 0.01);

        // apply the players movement by writting to the model uniform buffer
        gpuBufferWriteMeshTransform(player);

        // rotate the random cubes
        for (let i = 0; i < randomCubes.length; i++) {
            const m = randomCubes[i]
            const axis = randomCubesAxis[i]
            mat4.rotate(m.transform, m.transform, Math.PI * 0.01, axis);
            gpuBufferWriteMeshTransform(m);
        }

        // update grass
        const playerPos = getPositionFromTransform(player.transform)
        grass.update(playerPos)

        // render from the light's point of view to a depth buffer so we know where shadows are
        const commandEncoder = device.createCommandEncoder();
        const shadowRenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
                view: shadowDepthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        });
        shadowRenderPassEncoder.executeBundles([shadowBundle]);
        shadowRenderPassEncoder.endPass();

        // calculate and write our view and project matrices
        const viewMatrix = mat4.create()
        mat4.multiply(viewMatrix, viewMatrix, player.transform)
        mat4.multiply(viewMatrix, viewMatrix, cameraOffset)
        mat4.translate(viewMatrix, viewMatrix, [0, 0, 10]) // TODO(@darzu): can this be merged into the camera offset?
        mat4.invert(viewMatrix, viewMatrix);
        const projectionMatrix = mat4.perspective(mat4.create(), (2 * Math.PI) / 5, aspectRatio, 1, 10000.0/*view distance*/);
        const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix) as Float32Array
        device.queue.writeBuffer(sceneUniBuffer, 0, viewProj.buffer);

        // render to the canvas' via our swap-chain
        const renderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: colorTextureView,
                resolveTarget: context.getCurrentTexture().createView(),
                loadValue: backgroundColor,
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: depthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        });
        renderPassEncoder.executeBundles([renderBundle]);
        renderPassEncoder.endPass();

        // submit render passes to GPU
        device.queue.submit([commandEncoder.finish()]);

        // calculate performance metrics as running, weighted averages across frames
        const jsTime = performance.now() - start;
        const avgWeight = 0.05
        avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
        avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs
        const avgFPS = 1000 / avgFrameTimeMs;
        debugDiv.innerText = controlsStr
            + `\n` + `(js per frame: ${avgJsTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)})`
    }
    return renderFrame;
}

// math utilities
function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}
function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
    vec3.normalize(n, n)
    return n;
}

// matrix utilities
function pitch(m: mat4, rad: number) { return mat4.rotateX(m, m, rad); }
function yaw(m: mat4, rad: number) { return mat4.rotateY(m, m, rad); }
function roll(m: mat4, rad: number) { return mat4.rotateZ(m, m, rad); }
function moveX(m: mat4, n: number) { return mat4.translate(m, m, [n, 0, 0]); }
function moveY(m: mat4, n: number) { return mat4.translate(m, m, [0, n, 0]); }
function moveZ(m: mat4, n: number) { return mat4.translate(m, m, [0, 0, n]); }
export function getPositionFromTransform(t: mat4): vec3 {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos
}

async function main() {
    const start = performance.now();

    // attach to HTML canvas 
    let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    // resize the canvas when the window resizes
    function onWindowResize() {
        canvasRef.width = window.innerWidth;
        canvasRef.style.width = `${window.innerWidth}px`;
        canvasRef.height = window.innerHeight;
        canvasRef.style.height = `${window.innerHeight}px`;
    }
    window.onresize = function () {
        onWindowResize();
    }
    onWindowResize();

    // build our scene for the canvas
    const renderFrame = attachToCanvas(canvasRef, device);
    console.log(`JS init time: ${(performance.now() - start).toFixed(1)}ms`)

    // run our game loop using 'requestAnimationFrame`
    if (renderFrame) {
        const _renderFrame = (time: number) => {
            renderFrame(time);
            requestAnimationFrame(_renderFrame);
        }
        requestAnimationFrame(_renderFrame);
    }
}
await main()
