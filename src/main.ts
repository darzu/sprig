import { mat4, vec3 } from './gl-matrix.js';

function align(x: number, size: number): number {
    return Math.ceil(x / size) * size
}

const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const triElStride = 3/*ind per tri*/;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * triElStride;

// rendering pipeline for meshes
const shadowDepthTextureSize = 1024 * 2 * 4;

// TODO(@darzu): SCENE FORMAT
const sceneStruct = `
[[block]] struct Scene {
  cameraViewProjMatrix : mat4x4<f32>;
  lightViewProjMatrix : mat4x4<f32>;
  lightDir : vec3<f32>;
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

        [[builtin(position)]] Position : vec4<f32>;
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

        // Convert XY to (0, 1)
        // Y is flipped because texture coords are Y-down.
        output.shadowPos = vec3<f32>(
            posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
            posFromLight.z
        );

        output.Position = scene.cameraViewProjMatrix * worldPos;
        output.fragPos = output.Position.xyz;
        output.fragNorm = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
        output.color = color;
        return output;
    }
    `,
    fragment:
        sceneStruct +
        `
    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
    [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

    struct FragmentInput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] fragPos : vec3<f32>;
        [[location(2)]] fragNorm : vec3<f32>;
        [[location(3)]] color : vec3<f32>;
    };

    let sunStr : f32 = 2.0;
    let sunColor : vec3<f32> =  vec3<f32>(1.0, 1.0, 0.8);
    let sunReflectStr : f32 = 0.5;

    [[stage(fragment)]]
    fn main(input : FragmentInput) -> [[location(0)]] vec4<f32> {
        let shadowVis : f32 = textureSampleCompare(shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);

        let norm: vec3<f32> = normalize(input.fragNorm);

        let lightDir: vec3<f32> = scene.lightDir;
        let sunLight : f32 = shadowVis * clamp(dot(-lightDir, norm), 0.0, 1.0);

        let ambient: f32 = 0.2;

        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + ambient);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
    `,
}

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

const depthStencilFormat = 'depth24plus-stencil8';

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

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspect = 1;

const projectionMatrix = mat4.create();
const viewDistance = 10000.0;

function resize(device: GPUDevice, canvasWidth: number, canvasHeight: number) {
    if (lastWidth === canvasWidth && lastHeight === canvasHeight)
        return;

    if (depthTexture)
        depthTexture.destroy();
    if (colorTexture)
        colorTexture.destroy();

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

    aspect = Math.abs(canvasWidth / canvasHeight);

    mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, viewDistance);
}

// face normals vs vertex normals
interface MeshModel {
    // vertex positions (x,y,z)
    pos: vec3[];
    // triangles (vert indices, ccw)
    tri: vec3[];
    // colors per triangle in r,g,b float [0-1] format
    colors: vec3[];
}

const _scratchSingletonFloatBuffer = new Float32Array(1);

// TODO(@darzu): this shouldn't be needed once "flat" shading is supported in Chrome's WGSL, 
//  and/or PrimativeID is supported https://github.com/gpuweb/gpuweb/issues/1786
function unshareVertices(inp: MeshModel): MeshModel {
    // TODO(@darzu): pre-alloc
    const outVerts: vec3[] = []
    const outTri: vec3[] = []
    inp.tri.forEach(([i0, i1, i2], i) => {
        const v0 = inp.pos[i0];
        const v1 = inp.pos[i1];
        const v2 = inp.pos[i2];
        outVerts.push(v0);
        outVerts.push(v1);
        outVerts.push(v2);
        const vOff = i * 3;
        outTri.push([
            vOff + 0,
            vOff + 1,
            vOff + 2,
        ])
    })
    return {
        pos: outVerts,
        tri: outTri,
        colors: inp.colors,
    }
}

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
        [5, 7, 6],
    ],
    colors: [
        // front
        [0.2, 0.0, 0.0],
        [0.2, 0.0, 0.0],
        // top
        [0.0, 0.2, 0.0],
        [0.0, 0.2, 0.0],
        // right
        [0.0, 0.0, 0.2],
        [0.0, 0.0, 0.2],
        // left
        [0.2, 0.2, 0.0],
        [0.2, 0.2, 0.0],
        // bottom
        [0.0, 0.2, 0.2],
        [0.0, 0.2, 0.2],
        // back
        [0.2, 0.0, 0.2],
        [0.2, 0.0, 0.2],
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
        // top
        [0, 2, 3],
        [0, 3, 1],
        // bottom
        [3, 2, 0],
        [1, 3, 0],
    ],
    colors: [
        [0.05, 0.1, 0.05],
        [0.05, 0.1, 0.05],
        [0.05, 0.1, 0.05],
        [0.05, 0.1, 0.05],
    ],
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
function computeNormals(m: MeshModel): vec3[] {
    const triPoses = m.tri.map(([i0, i1, i2]) => [m.pos[i0], m.pos[i1], m.pos[i2]] as [vec3, vec3, vec3])
    return triPoses.map(computeNormal)
}

function addTriToBuffers(
    triPos: [vec3, vec3, vec3],
    triInd: vec3,
    triNorms: [vec3, vec3, vec3],
    triColors: [vec3, vec3, vec3],
    triSwayHeights: vec3,
    verts: Float32Array, prevNumVerts: number, vertElStride: number,
    indices: Uint16Array | null, prevNumTri: number, shiftIndices = false): void {
    const vOff = prevNumVerts * vertElStride
    const iOff = prevNumTri * triElStride
    const indShift = shiftIndices ? prevNumVerts : 0;
    if (indices) {
        indices[iOff + 0] = triInd[0] + indShift
        indices[iOff + 1] = triInd[1] + indShift
        indices[iOff + 2] = triInd[2] + indShift
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
    // sway height
    const [y0, y1, y2] = triSwayHeights
    verts[vOff + 0 * vertElStride + 9] = y0
    verts[vOff + 1 * vertElStride + 9] = y1
    verts[vOff + 2 * vertElStride + 9] = y2
    }

/*
Adds mesh vertices and indices into buffers. Optionally shifts triangle indicies.
*/
function addMeshToBuffers(
    m: MeshModel,
    verts: Float32Array, prevNumVerts: number, vertElStride: number,
    indices: Uint16Array | null, prevNumTri: number, shiftIndices = false): void {
    // IMPORTANT: assumes unshared vertices
    const norms = computeNormals(m);
    m.tri.forEach((t, i) => {
        addTriToBuffers(
            [m.pos[t[0]], m.pos[t[1]], m.pos[t[2]]],
            t,
            [norms[i], norms[i], norms[i]],
            [m.colors[i], m.colors[i], m.colors[i]],
            [0, 0, 0],
            verts, prevNumVerts + i * 3, vertElStride,
            indices, prevNumTri + i, shiftIndices);
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

    // properties
    shadowCaster: boolean,

    // TODO(@darzu): MESH FORMAT
    // TODO(@darzu): this isn't relevant to all meshes....
    maxDraw: number,
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

function getPositionFromTransform(t: mat4): vec3 {
    // TODO(@darzu): not really necessary
    const pos = vec3.create();
    vec3.transformMat4(pos, pos, t);
    return pos
}

async function init(canvasRef: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    if (!canvasRef === null) return;
    const context = canvasRef.getContext('gpupresent')!;

    // dynamic resize:
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

    // const vertElStride = vertByteSize / bytesPerFloat;

    let _vertsMap: Float32Array | null = null;
    let _indMap: Uint16Array | null = null;

    function _unmap() {
        // console.log("unmapping") // TODO(@darzu): 
        if (_vertsMap)
            _vertBuffer.unmap()
        if (_indMap && _indexBuffer)
            _indexBuffer.unmap()
        _vertsMap = null;
        _indMap = null;
    }

    // TODO(@darzu): misnomer. This doesn't do the mapping
    function _map() {
        // console.log("mapping") // TODO(@darzu): 
        if (!_vertsMap)
            _vertsMap = new Float32Array(_vertBuffer.getMappedRange())
        if (!_indMap && _indexBuffer)
            _indMap = new Uint16Array(_indexBuffer.getMappedRange());
    }

    function addMeshes(meshesToAdd: MeshModel[], shadowCasters: boolean): Mesh[] {
        function addMesh(m: MeshModel): Mesh {
            if (_vertsMap === null) {
                throw "Use preRender() and postRender() functions"
            }

            // TODO(@darzu): temporary
            m = unshareVertices(m);

            if (_numVerts + m.pos.length > maxVerts)
                throw "Too many vertices!"
            if (_numTris + m.tri.length > maxTris)
                throw "Too many triangles!"

            // add to vertex and index buffers
            addMeshToBuffers(m, _vertsMap, _numVerts, vertElStride, _indMap, _numTris, false);

            // create transformation matrix
            const trans = mat4.create() as Float32Array;

            // TODO(@darzu): real transforms
            // mat4.translate(trans, trans, vec3.fromValues(
            //     4 * _meshes.length, // TODO
            //     0, 0));

            // save the transform matrix to the buffer
            // TODO(@darzu): MESH FORMAT
            const uniOffset = _meshes.length * meshUniByteSize;
            device.queue.writeBuffer(
                _meshUniBuffer,
                uniOffset,
                trans.buffer,
                trans.byteOffset,
                trans.byteLength
            );

            // create the result
            const res: Mesh = {
                vertNumOffset: _numVerts, // TODO(@darzu): 
                indicesNumOffset: _numTris * 3, // TODO(@darzu): 
                modelUniByteOffset: uniOffset,
                transform: trans,
                triCount: m.tri.length,

                // TODO(@darzu): hrm
                shadowCaster: shadowCasters,

                model: m,
                maxDraw: 0,
            }
            _numVerts += m.pos.length;
            _numTris += m.tri.length;
            return res;
        }

        const newMeshes = meshesToAdd.map(m => addMesh(m))

        _meshes.push(...newMeshes)

        return newMeshes
        // _indexBuffer.unmap();
        // _vertBuffer.unmap();
    }

    function applyMeshTransform(m: Mesh) {
        // save the transform matrix to the buffer
        // TODO(@darzu): MESH FORMAT
        device.queue.writeBuffer(
            _meshUniBuffer,
            m.modelUniByteOffset,
            (m.transform as Float32Array).buffer,
            (m.transform as Float32Array).byteOffset,
            (m.transform as Float32Array).byteLength
        );
    }

    function applyMeshMaxDraw(m: Mesh) {
        // save the min draw distance to uniform buffer
        _scratchSingletonFloatBuffer[0] = m.maxDraw;
        device.queue.writeBuffer(
            _meshUniBuffer,
            // TODO(@darzu): MESH FORMAT
            m.modelUniByteOffset + bytesPerMat4,
            _scratchSingletonFloatBuffer.buffer,
            _scratchSingletonFloatBuffer.byteOffset,
            _scratchSingletonFloatBuffer.byteLength
        );
    }

        // const res: MeshMemoryPool = {
        //     _opts: memoryPoolOpts,
        //     _vertBuffer,
        //     _indexBuffer,
        //     _meshUniBuffer,
        //     _numVerts,
        //     _numTris,
        //     _meshes,
        //     _vertsMap: () => _vertsMap!,
        //     _indMap: () => _indMap!,
        //     _unmap: _unmap,
        //     _map: _map,
        //     addMeshes,
        //     applyMeshTransform,
        //     applyMeshMaxDraw,
        // }
        // return res;

    const swapChain = context.configureSwapChain({
        device,
        format: swapChainFormat,
    });

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

    // TODO(@darzu): SCENE FORMAT
    const sharedUniBufferSize =
        // Two 4x4 viewProj matrices,
        // one for the camera and one for the light.
        // Then a vec3 for the light position.
        bytesPerMat4 * 2 // camera and light projection
        + bytesPerVec3 * 1 // light pos
        // + bytesPerFloat * 1 // time
    const sharedUniBuffer = device.createBuffer({
        size: align(sharedUniBufferSize, 256),
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
            // TODO(@darzu): VERTEX FORMAT
            arrayStride: vertByteSize,
            attributes: [
                {
                    // position
                    shaderLocation: 0,
                    offset: bytesPerVec3 * 0,
                    format: 'float32x3',
                },
                {
                    // color
                    shaderLocation: 1,
                    offset: bytesPerVec3 * 1,
                    format: 'float32x3',
                },
                {
                    // normals
                    shaderLocation: 2,
                    offset: bytesPerVec3 * 2,
                    format: 'float32x3',
                },
                {
                    // sway height
                    shaderLocation: 3,
                    offset: bytesPerVec3 * 3,
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

    const backfaceCulling = true;

    function render(commandEncoder: GPUCommandEncoder, canvasWidth: number, canvasHeight: number) {

    }

    resize(device, 100, 100);

    // cursor lock
    let cursorLocked = false
    canvas.onclick = (ev) => {
        if (!cursorLocked)
            canvas.requestPointerLock();
        cursorLocked = true
    }

    _map()

    const [planeHandle] = addMeshes([
        PLANE
    ], true)
    mat4.translate(planeHandle.transform, planeHandle.transform, [0, -3, 0])
    applyMeshTransform(planeHandle);

    const [playerM] = addMeshes([CUBE], true)

    _unmap();

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

    function controlPlayer(t: Transformable) {
        // keys
        const speed = pressedKeys[' '] ? 1.0 : 0.2;
        if (pressedKeys['w'])
            t.moveZ(-speed)
        if (pressedKeys['s'])
            t.moveZ(speed)
        if (pressedKeys['a'])
            t.moveX(-speed)
        if (pressedKeys['d'])
            t.moveX(speed)
        if (pressedKeys['shift'])
            t.moveY(speed)
        if (pressedKeys['c'])
            t.moveY(-speed)
        // mouse
        if (mouseDeltaX !== 0)
            t.yaw(-mouseDeltaX * 0.01);
    }

    function cameraFollow(camera: Transformable) {
        if (mouseDeltaY !== 0)
            camera.pitch(-mouseDeltaY * 0.01);
    }

    const playerT = mkAffineTransformable();
    playerM.transform = playerT.getTransform();
    applyMeshTransform(playerM)

    let playerPos = getPositionFromTransform(playerM.transform);

    // write light source
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

    // init light
    {
        const upVector = vec3.fromValues(0, 1, 0);
        const origin = vec3.fromValues(0, 0, 0);
        const lightX = 50;
        const lightY = 50;
        const lightPosition = vec3.fromValues(lightX, lightY, 0);
        const lightDir = vec3.subtract(vec3.create(), origin, lightPosition);
        vec3.normalize(lightDir, lightDir);
        const lightViewMatrix = mat4.create();
        mat4.lookAt(lightViewMatrix, lightPosition, origin, upVector);
        const lightViewProjMatrix = mat4.create();
        mat4.multiply(lightViewProjMatrix, lightProjectionMatrix, lightViewMatrix);
        const lightMatrixData = lightViewProjMatrix as Float32Array;
        device.queue.writeBuffer(
            sharedUniBuffer,
            bytesPerMat4 * 1, // second matrix
            lightMatrixData.buffer,
            lightMatrixData.byteOffset,
            lightMatrixData.byteLength
        );

        const lightData = lightDir as Float32Array;
        device.queue.writeBuffer(
            sharedUniBuffer,
            bytesPerMat4 * 2, // third matrix
            lightData.buffer,
            lightData.byteOffset,
            lightData.byteLength
        );
    }

    {
        // create render bundle
        const bundleRenderDesc: GPURenderBundleEncoderDescriptor = {
            colorFormats: [swapChainFormat],
            depthStencilFormat: depthStencilFormat,
            sampleCount,
        }

        const bundleEncoder = device.createRenderBundleEncoder(bundleRenderDesc);

        if (backfaceCulling)
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
                        buffer: _meshUniBuffer,
                        offset: 0, // TODO(@darzu): different offsets per model
                        // TODO(@darzu): needed?
                        size: meshUniByteSize,
                    },
                },
            ],
        });
        bundleEncoder.setVertexBuffer(0, _vertBuffer);
        if (_indexBuffer)
            bundleEncoder.setIndexBuffer(_indexBuffer, 'uint16');
        const uniOffset = [0];
        for (let m of _meshes) {
            // TODO(@darzu): set bind group
            uniOffset[0] = m.modelUniByteOffset;
            bundleEncoder.setBindGroup(1, modelUniBindGroup, uniOffset);
            if (_indexBuffer)
                bundleEncoder.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
            else {
                bundleEncoder.draw(m.triCount * 3, undefined, m.vertNumOffset);
            }
        }
        renderBundle = bundleEncoder.finish()
    }

    let debugDiv = document.getElementById('debug-div') as HTMLDivElement;

    let previousFrameTime = 0;
    let avgJsTimeMs = 0
    let avgFrameTimeMs = 0

    function renderFrame(timeMs: number) {
        const start = performance.now();

        const frameTimeMs = previousFrameTime ? timeMs - previousFrameTime : 0;
        previousFrameTime = timeMs;

        // Sample is no longer the active page.
        if (!canvasRef) return;

        resize(device, canvasRef.width, canvasRef.height);

        playerPos = getPositionFromTransform(playerM.transform);

        controlPlayer(playerT);
        cameraFollow(cameraPos);

        playerM.transform = playerT.getTransform();
        applyMeshTransform(playerM);

        // reset accummulated mouse delta
        mouseDeltaX = 0;
        mouseDeltaY = 0;

        function getViewProj() {
            const viewProj = mat4.create();
            const cam = cameraPos.getTransform()
            const player = playerT.getTransform()

            const viewMatrix = mat4.create()
            mat4.multiply(viewMatrix, viewMatrix, player)
            mat4.multiply(viewMatrix, viewMatrix, cam)
            mat4.translate(viewMatrix, viewMatrix, [0, 0, 10])

            mat4.invert(viewMatrix, viewMatrix);

            mat4.multiply(viewProj, projectionMatrix, viewMatrix);
            return viewProj as Float32Array;
        }

        const transformationMatrix = getViewProj();
        device.queue.writeBuffer(
            sharedUniBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
        );

        const commandEncoder = device.createCommandEncoder();
        {
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

            const shadowPass = commandEncoder.beginRenderPass(shadowPassDescriptor);
            // shadowPassEncoder.executeBundles([shadowRenderBundle]);
            // TODO(@darzu): use bundle
            {
                shadowPass.setBindGroup(0, shadowSharedUniBindGroup);
                if (backfaceCulling)
                    shadowPass.setPipeline(shadowPipeline);
                else
                    shadowPass.setPipeline(shadowPipelineTwosided);

                const modelUniBindGroup = device.createBindGroup({
                    layout: modelUniBindGroupLayout,
                    entries: [
                        {
                            binding: 0,
                            resource: {
                                buffer: _meshUniBuffer,
                                offset: 0, // TODO(@darzu): different offsets per model
                                // TODO(@darzu): needed?
                                size: meshUniByteSize,
                            },
                        },
                    ],
                });
                shadowPass.setVertexBuffer(0, _vertBuffer);
                if (_indexBuffer)
                    shadowPass.setIndexBuffer(_indexBuffer, 'uint16');
                // TODO(@darzu): one draw call per mesh?
                const uniOffset = [0];
                for (let m of _meshes) {
                    if (!m.shadowCaster)
                        continue;
                    // TODO(@darzu): set bind group
                    uniOffset[0] = m.modelUniByteOffset;
                    shadowPass.setBindGroup(1, modelUniBindGroup, uniOffset);
                    if (_indexBuffer)
                        shadowPass.drawIndexed(m.triCount * 3, undefined, m.indicesNumOffset, m.vertNumOffset);
                    else {
                        // console.log(`m.vertNumOffset: ${m.vertNumOffset}`)
                        shadowPass.draw(m.triCount * 3, undefined, m.vertNumOffset);
                    }
                }
                // shadowRenderBundle = shadowPass.finish()
            }
            shadowPass.endPass();

            const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            renderPassEncoder.executeBundles([renderBundle]);
            renderPassEncoder.endPass();
        }
        device.queue.submit([commandEncoder.finish()]);

        const jsTime = performance.now() - start;

        // weighted average
        const avgWeight = 0.05
        avgJsTimeMs = avgJsTimeMs ? (1 - avgWeight) * avgJsTimeMs + avgWeight * jsTime : jsTime
        avgFrameTimeMs = avgFrameTimeMs ? (1 - avgWeight) * avgFrameTimeMs + avgWeight * frameTimeMs : frameTimeMs

        const avgFPS = 1000 / avgFrameTimeMs;

        // TODO(@darzu): triangle, vertex, pixel counts
        debugDiv.innerText = `js: ${avgJsTimeMs.toFixed(2)}ms, frame: ${avgFrameTimeMs.toFixed(2)}ms, fps: ${avgFPS.toFixed(1)}`
    }

    return renderFrame;
};

// Attach to html
let canvas = document.getElementById('sample-canvas') as HTMLCanvasElement;
const renderFrame = await init(canvas)

if (renderFrame) {
    const _renderFrame = (time: number) => {
        renderFrame(time);
        requestAnimationFrame(_renderFrame);
    }
    requestAnimationFrame(_renderFrame);
}