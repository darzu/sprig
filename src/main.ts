import { mat4, vec3 } from './gl-matrix.js';

const CUBE: MeshModel = {
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

const PLANE: MeshModel = {
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

function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}

const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

const wgslSceneStruct = `
[[block]] struct Scene {
    cameraViewProjMatrix : mat4x4<f32>;
    lightViewProjMatrix : mat4x4<f32>;
    lightDir : vec3<f32>;
}; `

const wgslShaders = {
    vertexShadow: wgslSceneStruct + `
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

    vertex: wgslSceneStruct + `
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
    `,
    fragment: wgslSceneStruct + `
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
    `,
}

const antiAliasSampleCount = 4;
const swapChainFormat = 'bgra8unorm';

const depthStencilFormat = 'depth24plus-stencil8';
const shadowDepthStencilFormat = 'depth32float';

const shadowDepthTextureDesc: GPUTextureDescriptor = {
    size: { width: 2048 * 2, height: 2048 * 2 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
    format: shadowDepthStencilFormat,
}

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspect = 1;

const projectionMatrix = mat4.create();

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

    aspect = Math.abs(canvasWidth / canvasHeight);

    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 10000.0/*view distance*/);
}

interface MeshModel {
    pos: vec3[];
    tri: vec3[];
    colors: vec3[];  // colors per triangle in r,g,b float [0-1] format
}

function unshareVertices(input: MeshModel): MeshModel {
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

function computeNormals(m: MeshModel): vec3[] {
    const triPoses = m.tri.map(([i0, i1, i2]) => [m.pos[i0], m.pos[i1], m.pos[i2]] as [vec3, vec3, vec3])
    return triPoses.map(([p1, p2, p3]) => {
        // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
        const n = vec3.cross(vec3.create(), vec3.sub(vec3.create(), p2, p1), vec3.sub(vec3.create(), p3, p1))
        vec3.normalize(n, n)
        return n;
    })
}

// TODO(@darzu): this can be simplified
function addMeshToBuffers(
    m: MeshModel,
    verts: Float32Array, prevNumVerts2: number, vertElStride: number,
    indices: Uint16Array | null, prevNumTri2: number): void {
    // NOTE: we currently assumes vertices are unshared, this should be fixed by
    const norms = computeNormals(m);
    m.tri.forEach((triInd, i) => {
        const triPos: [vec3, vec3, vec3] = [m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]]];
        const triNorms: [vec3, vec3, vec3] = [norms[i], norms[i], norms[i]];
        const triColors: [vec3, vec3, vec3] = [m.colors[i], m.colors[i], m.colors[i]];
        const prevNumVerts: number = prevNumVerts2 + i * 3;
        const prevNumTri: number = prevNumTri2 + i;
        {
            const vOff = prevNumVerts * vertElStride
            const iOff = prevNumTri * indicesPerTriangle
            if (indices) {
                indices[iOff + 0] = triInd[0]
                indices[iOff + 1] = triInd[1]
                indices[iOff + 2] = triInd[2]
            }
            // set per-face vertex data
            // position
            verts[vOff + 0 * vertElStride + 0] = triPos[0][0]
            verts[vOff + 0 * vertElStride + 1] = triPos[0][1]
            verts[vOff + 0 * vertElStride + 2] = triPos[0][2]
            verts[vOff + 1 * vertElStride + 0] = triPos[1][0]
            verts[vOff + 1 * vertElStride + 1] = triPos[1][1]
            verts[vOff + 1 * vertElStride + 2] = triPos[1][2]
            verts[vOff + 2 * vertElStride + 0] = triPos[2][0]
            verts[vOff + 2 * vertElStride + 1] = triPos[2][1]
            verts[vOff + 2 * vertElStride + 2] = triPos[2][2]
            // color
            const [r1, g1, b1] = triColors[0]
            const [r2, g2, b2] = triColors[1]
            const [r3, g3, b3] = triColors[2]
            verts[vOff + 0 * vertElStride + 3] = r1
            verts[vOff + 0 * vertElStride + 4] = g1
            verts[vOff + 0 * vertElStride + 5] = b1
            verts[vOff + 1 * vertElStride + 3] = r2
            verts[vOff + 1 * vertElStride + 4] = g2
            verts[vOff + 1 * vertElStride + 5] = b2
            verts[vOff + 2 * vertElStride + 3] = r3
            verts[vOff + 2 * vertElStride + 4] = g3
            verts[vOff + 2 * vertElStride + 5] = b3
            // normals
            const [nx1, ny1, nz1] = triNorms[0]
            verts[vOff + 0 * vertElStride + 6] = nx1
            verts[vOff + 0 * vertElStride + 7] = ny1
            verts[vOff + 0 * vertElStride + 8] = nz1
            const [nx2, ny2, nz2] = triNorms[1]
            verts[vOff + 1 * vertElStride + 6] = nx2
            verts[vOff + 1 * vertElStride + 7] = ny2
            verts[vOff + 1 * vertElStride + 8] = nz2
            const [nx3, ny3, nz3] = triNorms[2]
            verts[vOff + 2 * vertElStride + 6] = nx3
            verts[vOff + 2 * vertElStride + 7] = ny3
            verts[vOff + 2 * vertElStride + 8] = nz3
        }
    })
}

// TODO(@darzu): rename to MeshHandle ?
interface Mesh {
    // handles into the buffers
    vertNumOffset: number,
    indicesNumOffset: number,
    modelUniByteOffset: number,
    triCount: number,

    // data
    transform: mat4,
    model: MeshModel,
}

// TODO(@darzu): we want a nicer interface, but for now since it's 1-1 with the memory pool, just put it in that
// interface MeshPool {
//     _meshes: Mesh[],
//     addMesh: (mesh: MeshModel) => void,
// }

// function createMeshPool(memPool: MeshMemoryPool) {
//     const _meshes: Mesh[] = [];

// }


// TODO(@darzu): VERTEX FORMAT
const vertElStride = (3/*pos*/ + 3/*color*/ + 3/*normal*/ + 1/*swayHeight*/)

interface Transformable {
    getTransform: () => mat4;
    pitch: (rad: number) => void;
    yaw: (rad: number) => void;
    roll: (rad: number) => void;
    moveX: (n: number) => void;
    moveY: (n: number) => void;
    moveZ: (n: number) => void;
}

function mkAffineTransformable(): Transformable {
    const transform = mat4.create();
    return {
        getTransform: () => {
            return mat4.clone(transform);
        },
        pitch: (rad: number) => {
            mat4.rotateX(transform, transform, rad)
        },
        yaw: (rad: number) => {
            mat4.rotateY(transform, transform, rad)
        },
        roll: (rad: number) => {
            mat4.rotateZ(transform, transform, rad)
        },
        moveX: (n: number) => {
            mat4.translate(transform, transform, [n, 0, 0]);
        },
        moveY: (n: number) => {
            mat4.translate(transform, transform, [0, n, 0]);
        },
        moveZ: (n: number) => {
            mat4.translate(transform, transform, [0, 0, n]);
        },
    }
}



// Attach to html
let canvasRef = document.getElementById('sample-canvas') as HTMLCanvasElement;
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter!.requestDevice();

const context = canvasRef.getContext('gpupresent')!;

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

const meshUniByteSize = align(
    bytesPerMat4 // transform
    + bytesPerFloat // max draw distance
    , 256);
const vertByteSize = bytesPerFloat * vertElStride;

const maxVerts = 100000;
const maxTris = 100000;
const maxMeshes = 10000;

if (meshUniByteSize % 256 !== 0) {
    console.error("invalid mesh uni byte size, not 256 byte aligned: " + meshUniByteSize)
}

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
const _meshes: Mesh[] = [];
let _numVerts = 0;
let _numTris = 0;

let _vertsMap: Float32Array | null = null;
let _indMap: Uint16Array | null = null;

function addMeshes(meshesToAdd: MeshModel[], shadowCasters: boolean): Mesh[] {
    function addMesh(m: MeshModel): Mesh {
        if (_vertsMap === null)
            throw "Use preRender() and postRender() functions"

        m = unshareVertices(m);

        if (_numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!"
        if (_numTris + m.tri.length > maxTris)
            throw "Too many triangles!"

        addMeshToBuffers(m, _vertsMap, _numVerts, vertElStride, _indMap, _numTris);

        const transform = mat4.create() as Float32Array;

        const uniOffset = _meshes.length * meshUniByteSize;
        device.queue.writeBuffer(_meshUniBuffer, uniOffset, transform.buffer);

        const res: Mesh = {
            vertNumOffset: _numVerts,
            indicesNumOffset: _numTris * 3,
            modelUniByteOffset: uniOffset,
            transform,
            triCount: m.tri.length,
            model: m,
        }
        _numVerts += m.pos.length;
        _numTris += m.tri.length;
        return res;
    }

    const newMeshes = meshesToAdd.map(m => addMesh(m))

    _meshes.push(...newMeshes)

    return newMeshes
}

function writeMeshTransform(m: Mesh) {
    device.queue.writeBuffer(_meshUniBuffer, m.modelUniByteOffset, (m.transform as Float32Array).buffer);
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

const shadowDepthTexture = device.createTexture(shadowDepthTextureDesc);
const shadowDepthTextureView = shadowDepthTexture.createView();

// TODO(@darzu): SCENE FORMAT
const sharedUniBufferSize =
    bytesPerMat4 * 2 // camera and light projection
    + bytesPerVec3 * 1 // light pos
const sharedUniBuffer = device.createBuffer({
    size: align(sharedUniBufferSize, 256),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const shadowSharedUniBindGroup = device.createBindGroup({
    layout: shadowSharedUniBindGroupLayout,
    entries: [
        { binding: 0, resource: { buffer: sharedUniBuffer } }
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

const vertexBuffersLayout: GPUVertexBufferLayout[] = [{
    arrayStride: vertByteSize,
    attributes: [
        // position
        { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' },
        // color
        { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' },
        // normals
        { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' },
        // sway height
        { shaderLocation: 3, offset: bytesPerVec3 * 3, format: 'float32' },
    ],
}];

const primitiveBackcull: GPUPrimitiveState = {
    topology: 'triangle-list',
    cullMode: 'back',
    frontFace: 'ccw',
};

const shadowPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [shadowSharedUniBindGroupLayout, modelUniBindGroupLayout],
});

const shadowPipelineDesc: GPURenderPipelineDescriptor = {
    layout: shadowPipelineLayout,
    vertex: {
        module: device.createShaderModule({ code: wgslShaders.vertexShadow }),
        entryPoint: 'main',
        buffers: vertexBuffersLayout,
    },
    fragment: {
        module: device.createShaderModule({ code: wgslShaders.fragmentShadow }),
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

const renderPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [renderSharedUniBindGroupLayout, modelUniBindGroupLayout],
});

const renderPipelineDesc: GPURenderPipelineDescriptor = {
    layout: renderPipelineLayout,
    vertex: {
        module: device.createShaderModule({ code: wgslShaders.vertex }),
        entryPoint: 'main',
        buffers: vertexBuffersLayout,
    },
    fragment: {
        module: device.createShaderModule({ code: wgslShaders.fragment }),
        entryPoint: 'main',
        targets: [{ format: swapChainFormat }],
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
        count: antiAliasSampleCount,
    },
};

const renderPipeline = device.createRenderPipeline(renderPipelineDesc);

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

// cursor lock
let cursorLocked = false
canvasRef.onclick = (_) => {
    if (!cursorLocked)
        canvasRef.requestPointerLock();
    cursorLocked = true
}

_vertsMap = new Float32Array(_vertBuffer.getMappedRange())
_indMap = new Uint16Array(_indexBuffer.getMappedRange());

const [planeHandle] = addMeshes([
    PLANE
], true)
mat4.translate(planeHandle.transform, planeHandle.transform, [0, -3, 0])
writeMeshTransform(planeHandle);

const [playerM] = addMeshes([CUBE], true)

_vertBuffer.unmap()
_indexBuffer.unmap()
_vertsMap = null;
_indMap = null;

const cameraPos = mkAffineTransformable();
cameraPos.pitch(-Math.PI / 4)

// register key stuff
window.addEventListener('keydown', function (event: KeyboardEvent) {
    onKeyDown(event);
}, false);
window.addEventListener('keyup', function (event: KeyboardEvent) {
    onKeyUp(event);
}, false);
window.addEventListener('mousemove', function (event: MouseEvent) {
    onmousemove(event);
}, false);

const pressedKeys: { [keycode: string]: boolean } = {}
function onKeyDown(ev: KeyboardEvent) {
    const k = ev.key.toLowerCase();
    if (pressedKeys[k] === undefined)
        console.log(`new key: ${k}`)
    pressedKeys[k] = true
}
function onKeyUp(ev: KeyboardEvent) {
    pressedKeys[ev.key.toLowerCase()] = false
}
let mouseDeltaX = 0;
let mouseDeltaY = 0;
function onmousemove(ev: MouseEvent) {
    mouseDeltaX += ev.movementX
    mouseDeltaY += ev.movementY
}

const playerT = mkAffineTransformable();
playerM.transform = playerT.getTransform();
writeMeshTransform(playerM)

// write light source
const lightProjectionMatrix = mat4.ortho(mat4.create(), -80, 80, -80, 80, -200, 300);

// init light
const origin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const lightDir = vec3.subtract(vec3.create(), origin, lightPosition);
vec3.normalize(lightDir, lightDir);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.create();
mat4.lookAt(lightViewMatrix, lightPosition, origin, upVector);
const lightViewProjMatrix = mat4.create();
mat4.multiply(lightViewProjMatrix, lightProjectionMatrix, lightViewMatrix);
device.queue.writeBuffer(sharedUniBuffer, bytesPerMat4 * 1, (lightViewProjMatrix as Float32Array).buffer);
device.queue.writeBuffer(sharedUniBuffer, bytesPerMat4 * 2, (lightDir as Float32Array).buffer);

const modelUniBindGroup = device.createBindGroup({
    layout: modelUniBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: _meshUniBuffer, size: meshUniByteSize, }, },],
});

const bundleEncoder = device.createRenderBundleEncoder({
    colorFormats: [swapChainFormat],
    depthStencilFormat: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
});
bundleEncoder.setPipeline(renderPipeline);
bundleEncoder.setBindGroup(0, renderSharedUniBindGroup);
bundleEncoder.setVertexBuffer(0, _vertBuffer);
bundleEncoder.setIndexBuffer(_indexBuffer, 'uint16');
const uniOffset = [0];
for (let m of _meshes) {
    uniOffset[0] = m.modelUniByteOffset;
    bundleEncoder.setBindGroup(1, modelUniBindGroup, uniOffset);
    bundleEncoder.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
}
let renderBundle = bundleEncoder.finish()

const swapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
});

let debugDiv = document.getElementById('debug-div') as HTMLDivElement;

let previousFrameTime = 0;
let avgJsTimeMs = 0
let avgFrameTimeMs = 0

resize(device, 100, 100);

function renderFrame(timeMs: number) {
    // track performance metrics
    const start = performance.now();
    const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
    previousFrameTime = timeMs;

    // resize (if necessary)
    resize(device, canvasRef.width, canvasRef.height);

    // process inputs
    const playerSpeed = pressedKeys[' '] ? 1.0 : 0.2; // spacebar boosts
    if (pressedKeys['w']) // forward
        playerT.moveZ(-playerSpeed)
    if (pressedKeys['s']) // backward
        playerT.moveZ(playerSpeed)
    if (pressedKeys['a']) // left
        playerT.moveX(-playerSpeed)
    if (pressedKeys['d']) // right
        playerT.moveX(playerSpeed)
    if (pressedKeys['shift']) // up
        playerT.moveY(playerSpeed)
    if (pressedKeys['c']) // down
        playerT.moveY(-playerSpeed)
    if (mouseDeltaX !== 0)
        playerT.yaw(-mouseDeltaX * 0.01);
    if (mouseDeltaY !== 0)
        cameraPos.pitch(-mouseDeltaY * 0.01);

    // reset accummulated mouse delta
    mouseDeltaX = 0;
    mouseDeltaY = 0;

    // apply movement to the "player"
    playerM.transform = playerT.getTransform();
    writeMeshTransform(playerM);

    // calculate and write our view matrix
    const viewMatrix = mat4.create()
    mat4.multiply(viewMatrix, viewMatrix, playerT.getTransform())
    mat4.multiply(viewMatrix, viewMatrix, cameraPos.getTransform())
    mat4.translate(viewMatrix, viewMatrix, [0, 0, 10])
    mat4.invert(viewMatrix, viewMatrix);
    const viewProj = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix) as Float32Array
    device.queue.writeBuffer(sharedUniBuffer, 0, viewProj.buffer);

    // render from the light's point of view to a depth buffer so we know where shadows are
    const commandEncoder = device.createCommandEncoder();
    const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
    shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
    shadowPass.setPipeline(shadowPipeline);
    shadowPass.setVertexBuffer(0, _vertBuffer);
    shadowPass.setIndexBuffer(_indexBuffer, 'uint16');
    const uniOffset = [0];
    for (let m of _meshes) {
        uniOffset[0] = m.modelUniByteOffset;
        shadowPass.setBindGroup(1, modelUniBindGroup, uniOffset);
        shadowPass.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
    }
    shadowPass.endPass();

    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: colorTextureView,
            resolveTarget: swapChain.getCurrentTexture().createView(),
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

    // weighted average
    const jsTime = performance.now() - start;
    const avgWeight = 0.05
    avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
    avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs
    const avgFPS = 1000 / avgFrameTimeMs;
    debugDiv.innerText = `js: ${avgJsTimeMs.toFixed(2)}ms, frame: ${avgFrameTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)}`
}

if (renderFrame) {
    const _renderFrame = (time: number) => {
        renderFrame(time);
        requestAnimationFrame(_renderFrame);
    }
    requestAnimationFrame(_renderFrame);
}