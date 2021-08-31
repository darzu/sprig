
import { mat4, vec3, quat } from '../ext/gl-matrix.js';
import { align } from '../math.js';

/*
Abstractions:
    MeshPool:
        // organizing principle: one vertex buffer, one index buffer
        vertex size
        vertex buffer
        triangle buffer
        pipeline constraints
        list of meshes
    MeshInstance:
        vertNumOffset: number,
        indicesNumOffset: number,
        modelUniByteOffset: number,
        transform: mat4;
        model: MeshModel,
        binding: GPUBindGroup,

    There's a model <-> MeshPool compatibility question
        Or maybe, a MeshPool chooses to implement a way to render a model
        The vertices and uniform buffer choices
        Or is a mesh pool dummer than that?
            Mesh pool only cares about sizes and memory management

Example code:

function OnStart() {
    let ground = CreateGround(100, 100);
    let player = CreateBox({ size: 5, color: "white", kind: "player" });
    MoveWithControls(player);
    function movePizza() {
        let pizza = CreateSphere({ size: 3, color: "red", kind: "pizza" });
        pizza.x = Random(-ground.width / 2, ground.width / 2);
        pizza.z = Random(-ground.height / 2, ground.height / 2);
        StartTimer(3)
    }
    movePizza()
    OnTimerElapsed(() => {
        GameOver("lose")
    })

    OnOverlap("player", "pizza", (player, pizza) => {
        Destory(pizza);
        ChangeScore(1);
        movePizza();
    })
}
*/

export const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
export const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
export const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
export const triElStride = 3/*ind per tri*/;
export const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * triElStride;

// face normals vs vertex normals
export interface MeshModel {
    // vertex positions (x,y,z)
    pos: vec3[];
    // triangles (vert indices, ccw)
    tri: vec3[];
    // colors per triangle in r,g,b float [0-1] format
    colors: vec3[];
}
export interface MeshMemoryPoolOptions {
    // TODO(@darzu): vertex structure for shaders?
    vertByteSize: number, // bytes
    maxVerts: number,
    maxTris: number,
    maxMeshes: number,
    meshUniByteSize: number,
    backfaceCulling: boolean,
    usesIndices: boolean,
}

export interface MeshMemoryPool {
    _opts: MeshMemoryPoolOptions,
    _vertBuffer: GPUBuffer,
    _indexBuffer: GPUBuffer | null,
    _meshUniBuffer: GPUBuffer,
    _meshes: Mesh[],
    _numVerts: number,
    _numTris: number,
    addMeshes: (meshesToAdd: MeshModel[], shadowCasters: boolean) => Mesh[],
    applyMeshTransform: (m: Mesh) => void,
    applyMeshMaxDraw: (m: Mesh) => void,

    // TODO: mapping, unmapping, and raw access is pretty odd
    _vertsMap: () => Float32Array,
    _indMap: () => Uint16Array,
    _unmap: () => void,
    _map: () => void,
}

const _scratchSingletonFloatBuffer = new Float32Array(1);

export function createMeshMemoryPool(opts: MeshMemoryPoolOptions, device: GPUDevice): MeshMemoryPool {
    const { vertByteSize, maxVerts, maxTris, maxMeshes, meshUniByteSize } = opts;

    if (meshUniByteSize % 256 !== 0) {
        console.error("invalid mesh uni byte size, not 256 byte aligned: " + meshUniByteSize)
    }

    // space stats
    console.log(`New mesh pool`);
    console.log(`   ${maxVerts * vertByteSize / 1024} KB for verts`);
    console.log(`   ${opts.usesIndices ? maxTris * bytesPerTri / 1024 : 0} KB for indices`);
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
    const _indexBuffer = opts.usesIndices ? device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    }) : null;

    const meshUniBufferSize = meshUniByteSize * maxMeshes;
    const _meshUniBuffer = device.createBuffer({
        size: align(meshUniBufferSize, 256),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const _meshes: Mesh[] = [];
    let _numVerts = 0;
    let _numTris = 0;

    const vertElStride = vertByteSize / bytesPerFloat;

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

    const res: MeshMemoryPool = {
        _opts: opts,
        _vertBuffer,
        _indexBuffer,
        _meshUniBuffer,
        _numVerts,
        _numTris,
        _meshes,
        _vertsMap: () => _vertsMap!,
        _indMap: () => _indMap!,
        _unmap: _unmap,
        _map: _map,
        addMeshes,
        applyMeshTransform,
        applyMeshMaxDraw,
    }
    return res;
}

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
// TODO(@darzu): needed?
interface ExpandedMesh extends MeshModel {
    // face normals, per triangle
    fnorm: vec3[];
}

export const CUBE: MeshModel = {
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
        [0.5, 0.0, 0.0],
        [0.5, 0.0, 0.0],
        // top
        [0.0, 0.5, 0.0],
        [0.0, 0.5, 0.0],
        // right
        [0.0, 0.0, 0.5],
        [0.0, 0.0, 0.5],
        // left
        [0.5, 0.5, 0.0],
        [0.5, 0.5, 0.0],
        // bottom
        [0.0, 0.5, 0.5],
        [0.0, 0.5, 0.5],
        // back
        [0.5, 0.0, 0.5],
        [0.5, 0.0, 0.5],
    ]
}

export const PLANE: MeshModel = {
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
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
        [0.2, 0.3, 0.2],
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

export function addTriToBuffers(
    triPos: [vec3, vec3, vec3],
    triInd: vec3,
    triNorm: vec3,
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
    const [nx, ny, nz] = triNorm
    verts[vOff + 0 * vertElStride + 6] = nx
    verts[vOff + 0 * vertElStride + 7] = ny
    verts[vOff + 0 * vertElStride + 8] = nz
    verts[vOff + 1 * vertElStride + 6] = nx
    verts[vOff + 1 * vertElStride + 7] = ny
    verts[vOff + 1 * vertElStride + 8] = nz
    verts[vOff + 2 * vertElStride + 6] = nx
    verts[vOff + 2 * vertElStride + 7] = ny
    verts[vOff + 2 * vertElStride + 8] = nz
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
            norms[i],
            [m.colors[i], m.colors[i], m.colors[i]],
            [0, 0, 0],
            verts, prevNumVerts + i * 3, vertElStride,
            indices, prevNumTri + i, shiftIndices);
    })
}

// TODO(@darzu): rename to MeshHandle ?
export interface Mesh {
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
