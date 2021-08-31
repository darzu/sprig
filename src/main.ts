import { mat4, vec3 } from './gl-matrix.js';

/*
file layout:
    shaders
    utility constants
    setup meshes
    setup pipeline common resources
    setup shadow pipeline
    setup render pipeline
    create shadow pipeline bundle
    create render pipeline bundle
    setup interactivity
    render loop:
        track perf
        update interactivity
        render bundles
    utility code

    TO SIMPLIFY:
        Mesh add to buffer code
        dependencies between pipeline and loop
        bundling shadows
*/

// Defines shaders in WGSL for the shadow and regular rendering pipelines. Likely you'll want
// these in external files but they've been inlined for redistribution convenience.
const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
    };
`;
const vertexShaderForShadows = shaderSceneStruct + `
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
const vertexShader = shaderSceneStruct + `
    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] normal : vec3<f32>;
        [[location(2)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };

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
const fragmentShader = shaderSceneStruct + `
    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

    [[stage(fragment)]]
    fn main(
        [[location(0)]] shadowPos : vec3<f32>,
        [[location(1)]] normal : vec3<f32>,
        [[location(2)]] color : vec3<f32>,
        ) -> [[location(0)]] vec4<f32> {
        let shadowVis : f32 = textureSampleCompare(shadowMap, shadowSampler, shadowPos.xy, shadowPos.z - 0.007);
        let sunLight : f32 = shadowVis * clamp(dot(-scene.lightDir, normal), 0.0, 1.0);
        let resultColor: vec3<f32> = color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// useful constants
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

const antiAliasSampleCount = 4;
const swapChainFormat = 'bgra8unorm';

const depthStencilFormat = 'depth24plus-stencil8';
const shadowDepthStencilFormat = 'depth32float';

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspectRatio = 1;

function resize(device: GPUDevice, canvasWidth: number, canvasHeight: number) {
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

interface Mesh {
    pos: vec3[];
    tri: vec3[];
    colors: vec3[];  // colors per triangle in r,g,b float [0-1] format
}

function unshareVertices(input: Mesh): Mesh {
    // TODO: this shouldn't be needed once "flat" shading is supported in Chrome's WGSL, 
    // https://bugs.chromium.org/p/tint/issues/detail?id=746&q=interpolate&can=2
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
    return { pos, tri, colors: input.colors }
}

function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
    // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
    const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
    vec3.normalize(n, n)
    return n;
}

interface MeshHandle {
    // handles into the buffers
    vertNumOffset: number,
    indicesNumOffset: number,
    modelUniByteOffset: number,
    triCount: number,
    // data
    transform: mat4,
    model: Mesh,
}

// // attach to HTML canvas 
let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
// //      needed for: resize, click events, pointer lock
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice();
// //      needed for: vertex/index/uniform createBuffer, queue, createBindGroup, createBindGroupLayout, createTexture, createSampler, 
// //                   createPipelineLayout, createShaderModule, createRenderPipeline, createRenderBundleEncoder, createCommandEncoder
// //      tasks: create buffers, update buffers, create pipelines, bind buffers to pipeline, render bundle,  
const context = canvasRef.getContext('gpupresent')!;
//      needed for: configure, getCurrentTexture()
//      tasks: initialize canvas, do render
// window, needed for: keyboard, mouse events

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

// define our meshes (ideally these would be imported from a standard format)
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
        [0, 1, 2], [0, 2, 3], // front
        [4, 5, 1], [4, 1, 0], // top
        [3, 4, 0], [3, 7, 4], // right
        [2, 1, 5], [2, 5, 6], // left
        [6, 3, 2], [6, 7, 3], // bottom
        [5, 4, 7], [5, 7, 6], // back
    ],
    colors: [
        [0.2, 0.0, 0.0], [0.2, 0.0, 0.0], // front
        [0.0, 0.2, 0.0], [0.0, 0.2, 0.0], // top
        [0.0, 0.0, 0.2], [0.0, 0.0, 0.2], // right
        [0.2, 0.2, 0.0], [0.2, 0.2, 0.0], // left
        [0.0, 0.2, 0.2], [0.0, 0.2, 0.2], // bottom
        [0.2, 0.0, 0.2], [0.2, 0.0, 0.2], // back
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
        [0, 2, 3], [0, 3, 1], // top
        [3, 2, 0], [1, 3, 0], // bottom
    ],
    colors: [
        [0.05, 0.1, 0.05], [0.05, 0.1, 0.05],
        [0.05, 0.1, 0.05], [0.05, 0.1, 0.05],
    ],
}

// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
const vertexDataFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' }, // normals
];
// these help us pack and use vertices in that format
const vertElStride = (3/*pos*/ + 3/*color*/ + 3/*normal*/)
const vertByteSize = bytesPerFloat * vertElStride;
function bufferWriteVertex(buffer: Float32Array, offset: number, position: vec3, color: vec3, normal: vec3) {
    bufferWriteVec3(buffer, offset + 0, position);
    bufferWriteVec3(buffer, offset + 3, color);
    bufferWriteVec3(buffer, offset + 6, normal);
}

// define the format of our models' uniform buffer
const meshUniByteSize = align(
    bytesPerMat4 // transform
    + bytesPerFloat // max draw distance
    , 256);
if (meshUniByteSize % 256 !== 0) {
    console.error("invalid mesh uni byte size, not 256 byte aligned: " + meshUniByteSize)
}

const maxVerts = 100000;
const maxTris = 100000;
const maxMeshes = 10000;
function createMeshBuffers(device: GPUDevice) {
    // space stats
    console.log(`New mesh pool`);
    console.log(`   ${maxVerts * vertByteSize / 1024} KB for verts`);
    console.log(`   ${true ? maxTris * bytesPerTri / 1024 : 0} KB for indices`);
    console.log(`   ${maxMeshes * meshUniByteSize / 1024} KB for models`);
    // TODO(@darzu): MESH FORMAT
    const assumedBytesPerModel =
        bytesPerMat4 // transform
        + bytesPerFloat // max draw distance
    const unusedBytesPerModel = 256 - assumedBytesPerModel % 256
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per model (${(unusedBytesPerModel * maxMeshes / 1024).toFixed(1)} KB total waste)`);

    const _vertBuffer = device.createBuffer({
        size: maxVerts * vertByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    const _indexBuffer = device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });
    const meshUniBufferSize = meshUniByteSize * maxMeshes;
    const _meshUniBuffer = device.createBuffer({
        size: align(meshUniBufferSize, 256),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { _vertBuffer, _indexBuffer, _meshUniBuffer };
}
const { _vertBuffer, _indexBuffer, _meshUniBuffer } = createMeshBuffers(device);

function createSceneBuffers(device: GPUDevice) {
    // TODO(@darzu): SCENE FORMAT
    const sharedUniBufferSize =
        bytesPerMat4 * 2 // camera and light projection
        + bytesPerVec3 * 1 // light pos
    const sharedUniBuffer = device.createBuffer({
        size: align(sharedUniBufferSize, 256),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return { sharedUniBuffer };
}
const { sharedUniBuffer } = createSceneBuffers(device);

function gpuBufferWriteMeshTransform(m: MeshHandle) {
    device.queue.writeBuffer(_meshUniBuffer, m.modelUniByteOffset, (m.transform as Float32Array).buffer);
}

// add our meshes to the vertex and index buffers
let verticesMap = new Float32Array(_vertBuffer.getMappedRange())
let indicesMap = new Uint16Array(_indexBuffer.getMappedRange());

const meshHandles: MeshHandle[] = [];
let _numVerts = 0;
let _numTris = 0;
function addMesh(m: Mesh): MeshHandle {
    m = unshareVertices(m); // work-around; see TODO inside function
    if (verticesMap === null)
        throw "Use preRender() and postRender() functions"
    if (_numVerts + m.pos.length > maxVerts)
        throw "Too many vertices!"
    if (_numTris + m.tri.length > maxTris)
        throw "Too many triangles!"

    const vertNumOffset = _numVerts;
    const indicesNumOffset = _numTris * 3;

    m.tri.forEach((triInd, i) => {
        const vOff = (_numVerts) * vertElStride
        const iOff = (_numTris) * indicesPerTriangle
        if (indicesMap) {
            indicesMap[iOff + 0] = triInd[0]
            indicesMap[iOff + 1] = triInd[1]
            indicesMap[iOff + 2] = triInd[2]
        }
        const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
        bufferWriteVertex(verticesMap, vOff + 0 * vertElStride, m.pos[triInd[0]], m.colors[i], normal)
        bufferWriteVertex(verticesMap, vOff + 1 * vertElStride, m.pos[triInd[1]], m.colors[i], normal)
        bufferWriteVertex(verticesMap, vOff + 2 * vertElStride, m.pos[triInd[2]], m.colors[i], normal)
        _numVerts += 3;
        _numTris += 1;
    })

    const transform = mat4.create() as Float32Array;

    const uniOffset = meshHandles.length * meshUniByteSize;
    device.queue.writeBuffer(_meshUniBuffer, uniOffset, transform.buffer);

    const res: MeshHandle = {
        vertNumOffset,
        indicesNumOffset,
        modelUniByteOffset: uniOffset,
        transform,
        triCount: m.tri.length,
        model: m,
    }

    meshHandles.push(res)
    return res;
}

const ground = addMesh(PLANE);
mat4.translate(ground.transform, ground.transform, [0, -3, 0])
gpuBufferWriteMeshTransform(ground);

const player = addMesh(CUBE);

_vertBuffer.unmap()
_indexBuffer.unmap()

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
pitch(cameraOffset, -Math.PI / 4)
gpuBufferWriteMeshTransform(player)

// create a directional light and compute it's projection (for shadows) and direction
const worldOrigin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.lookAt(mat4.create(), lightPosition, worldOrigin, upVector);
const lightProjectionMatrix = mat4.ortho(mat4.create(), -80, 80, -80, 80, -200, 300);
const lightViewProjMatrix = mat4.multiply(mat4.create(), lightProjectionMatrix, lightViewMatrix);
const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
vec3.normalize(lightDir, lightDir);
// write the light data to the shared uniform buffer
device.queue.writeBuffer(sharedUniBuffer, bytesPerMat4 * 1, (lightViewProjMatrix as Float32Array).buffer);
device.queue.writeBuffer(sharedUniBuffer, bytesPerMat4 * 2, (lightDir as Float32Array).buffer);

// setup a binding for our per-mesh uniforms
const modelUniBindGroupLayout = device.createBindGroupLayout({
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: meshUniByteSize },
    }],
});
const modelUniBindGroup = device.createBindGroup({
    layout: modelUniBindGroupLayout,
    entries: [{
        binding: 0,
        resource: { buffer: _meshUniBuffer, size: meshUniByteSize, },
    }],
});

// configure our canvas backed swapchain
context.configure({ device, format: swapChainFormat });

// we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
const primitiveBackcull: GPUPrimitiveState = {
    topology: 'triangle-list',
    cullMode: 'back',
    frontFace: 'ccw',
};

// define the resource bindings for the shadow pipeline
const shadowSharedUniBindGroupLayout = device.createBindGroupLayout({
    entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
});
const shadowSharedUniBindGroup = device.createBindGroup({
    layout: shadowSharedUniBindGroupLayout,
    entries: [
        { binding: 0, resource: { buffer: sharedUniBuffer } }
    ],
});

// ???
const shadowDepthTextureDesc: GPUTextureDescriptor = {
    size: { width: 2048 * 2, height: 2048 * 2 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
    format: shadowDepthStencilFormat,
}
const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
const shadowDepthTextureView = shadowDepthTexture.createView();
// define the resource bindings for the mesh rendering pipeline
const renderSharedUniBindGroupLayout = device.createBindGroupLayout({
    entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
    ],
});
const renderSharedUniBindGroup = device.createBindGroup({
    layout: renderSharedUniBindGroupLayout,
    entries: [
        { binding: 0, resource: { buffer: sharedUniBuffer } },
        { binding: 1, resource: shadowDepthTextureView },
        { binding: 2, resource: device.createSampler({ compare: 'less' }) },
    ],
});

function createShadowRenderPipeline(device: GPUDevice) {
    // setup our first phase pipeline which tracks the depth of meshes 
    // from the point of view of the lighting so we know where the shadows are
    const shadowPipelineDesc: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
            bindGroupLayouts: [shadowSharedUniBindGroupLayout, modelUniBindGroupLayout],
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
    return device.createRenderPipeline(shadowPipelineDesc);
}
const shadowPipeline = createShadowRenderPipeline(device);

function createRenderPipeline(device: GPUDevice): GPURenderPipeline {
    // setup our second phase pipeline which renders meshes to the canvas
    const renderPipelineDesc: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderSharedUniBindGroupLayout, modelUniBindGroupLayout],
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
    return renderPipeline;
}
const renderPipeline = createRenderPipeline(device);

// record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
// This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
const bundleEncoder = device.createRenderBundleEncoder({
    colorFormats: [swapChainFormat],
    depthStencilFormat: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
});
bundleEncoder.setPipeline(renderPipeline);
bundleEncoder.setBindGroup(0, renderSharedUniBindGroup);
bundleEncoder.setVertexBuffer(0, _vertBuffer);
bundleEncoder.setIndexBuffer(_indexBuffer, 'uint16');
for (let m of meshHandles) {
    bundleEncoder.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
    bundleEncoder.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
}
let renderBundle = bundleEncoder.finish()

// initialize performance metrics
let debugDiv = document.getElementById('debug-div') as HTMLDivElement;
let previousFrameTime = 0;
let avgJsTimeMs = 0
let avgFrameTimeMs = 0

// our main game loop
function renderFrame(timeMs: number) {
    // track performance metrics
    const start = performance.now();
    const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
    previousFrameTime = timeMs;

    // resize (if necessary)
    resize(device, canvasRef.width, canvasRef.height);

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

    // render from the light's point of view to a depth buffer so we know where shadows are
    // TODO(@darzu): try bundled shadows
    const commandEncoder = device.createCommandEncoder();
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
    const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
    shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
    shadowPass.setPipeline(shadowPipeline);
    shadowPass.setVertexBuffer(0, _vertBuffer);
    shadowPass.setIndexBuffer(_indexBuffer, 'uint16');
    for (let m of meshHandles) {
        shadowPass.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        shadowPass.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
    }
    shadowPass.endPass();

    // calculate and write our view and project matrices
    const viewMatrix = mat4.create()
    mat4.multiply(viewMatrix, viewMatrix, player.transform)
    mat4.multiply(viewMatrix, viewMatrix, cameraOffset)
    mat4.translate(viewMatrix, viewMatrix, [0, 0, 10]) // TODO(@darzu): can this be merged into the camera offset?
    mat4.invert(viewMatrix, viewMatrix);
    const projectionMatrix = mat4.perspective(mat4.create(), (2 * Math.PI) / 5, aspectRatio, 1, 10000.0/*view distance*/);
    const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix) as Float32Array
    device.queue.writeBuffer(sharedUniBuffer, 0, viewProj.buffer);

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: colorTextureView,
            resolveTarget: context.getCurrentTexture().createView(),
            loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
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
    device.queue.submit([commandEncoder.finish()]);

    // calculate performance metrics as running, weighted averages across frames
    const jsTime = performance.now() - start;
    const avgWeight = 0.05
    avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
    avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs
    const avgFPS = 1000 / avgFrameTimeMs;
    debugDiv.innerText = `js: ${avgJsTimeMs.toFixed(2)}ms, frame: ${avgFrameTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)}`
}

// run our game loop using 'requestAnimationFrame`
if (renderFrame) {
    const _renderFrame = (time: number) => {
        renderFrame(time);
        requestAnimationFrame(_renderFrame);
    }
    requestAnimationFrame(_renderFrame);
}

// math utilities
function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}

// matrix utilities
function pitch(m: mat4, rad: number) { return mat4.rotateX(m, m, rad); }
function yaw(m: mat4, rad: number) { return mat4.rotateY(m, m, rad); }
function roll(m: mat4, rad: number) { return mat4.rotateZ(m, m, rad); }
function moveX(m: mat4, n: number) { return mat4.translate(m, m, [n, 0, 0]); }
function moveY(m: mat4, n: number) { return mat4.translate(m, m, [0, n, 0]); }
function moveZ(m: mat4, n: number) { return mat4.translate(m, m, [0, 0, n]); }

// buffer utilities
function bufferWriteVec3(buffer: Float32Array, offset: number, v: vec3) {
    buffer[offset + 0] = v[0]
    buffer[offset + 1] = v[1]
    buffer[offset + 2] = v[2]
}