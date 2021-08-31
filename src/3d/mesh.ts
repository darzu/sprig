
import { mat4, vec3, quat } from '../ext/gl-matrix.js';

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

export const mat4ByteSize = (4 * 4)/*4x4 mat*/ * 4/*f32*/
export const vec3ByteSize = 3/*vec3*/ * 4/*f32*/
export const triElStride = 3/*ind per tri*/;
export const triByteSize = Uint16Array.BYTES_PER_ELEMENT * triElStride;

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
}

export interface MeshMemoryPool {
    _opts: MeshMemoryPoolOptions,
    _vertBuffer: GPUBuffer,
    _indexBuffer: GPUBuffer,
    _meshUniBuffer: GPUBuffer,
    _meshes: Mesh[],
    _numVerts: number,
    _numTris: number,
    addMeshes: (meshesToAdd: MeshModel[]) => void,
    applyMeshTransform: (m: Mesh) => void,

    // TODO: mapping, unmapping, and raw access is pretty odd
    _vertsMap: () => Float32Array,
    _indMap: () => Uint16Array,
    _unmap: () => void,
    _map: () => void,
}

export function createMeshMemoryPool(opts: MeshMemoryPoolOptions, device: GPUDevice): MeshMemoryPool {
    const { vertByteSize, maxVerts, maxTris, maxMeshes, meshUniByteSize } = opts;

    // space stats
    console.log(`New mesh pool`);
    console.log(`   ${maxVerts * vertByteSize / 1024} KB for verts`);
    console.log(`   ${maxTris * triByteSize / 1024} KB for indices`);
    console.log(`   ${maxMeshes * meshUniByteSize / 1024} KB for models`);
    const unusedBytesPerModel = 256 - mat4ByteSize % 256
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per model (${unusedBytesPerModel * maxMeshes / 1024} KB total waste)`);

    const _vertBuffer = device.createBuffer({
        size: maxVerts * vertByteSize,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    const _indexBuffer = device.createBuffer({
        size: maxTris * triByteSize,
        usage: GPUBufferUsage.INDEX,
        mappedAtCreation: true,
    });

    const meshUniBufferSize = mat4ByteSize * maxMeshes;
    const _meshUniBuffer = device.createBuffer({
        size: meshUniBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const _meshes: Mesh[] = [];
    let _numVerts = 0;
    let _numTris = 0;

    const vertElStride = vertByteSize / Float32Array.BYTES_PER_ELEMENT;

    let _vertsMap: Float32Array | null = null;
    let _indMap: Uint16Array | null = null;

    function _unmap() {
        console.log("unmapping") // TODO(@darzu): 
        if (_vertsMap)
            _vertBuffer.unmap()
        if (_indMap)
            _indexBuffer.unmap()
        _vertsMap = null;
        _indMap = null;
    }

    function _map() {
        console.log("mapping") // TODO(@darzu): 
        if (!_vertsMap)
            _vertsMap = new Float32Array(_vertBuffer.getMappedRange())
        if (!_indMap)
            _indMap = new Uint16Array(_indexBuffer.getMappedRange());
        console.log(!!_vertsMap)
        console.log(!!_indMap)
    }

    function addMeshes(meshesToAdd: MeshModel[]) {
        function addMesh(m: MeshModel): Mesh {
            if (_vertsMap === null || _indMap === null) {
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
                model: m,
            }
            _numVerts += m.pos.length;
            _numTris += m.tri.length;
            return res;
        }

        meshesToAdd.forEach(m => _meshes.push(addMesh(m)))

        // _indexBuffer.unmap();
        // _vertBuffer.unmap();
    }

    function applyMeshTransform(m: Mesh) {
        // save the transform matrix to the buffer
        device.queue.writeBuffer(
            _meshUniBuffer,
            m.modelUniByteOffset,
            (m.transform as Float32Array).buffer,
            (m.transform as Float32Array).byteOffset,
            (m.transform as Float32Array).byteLength
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
    triColor: vec3,
    verts: Float32Array, prevNumVerts: number, vertElStride: number,
    indices: Uint16Array, prevNumTri: number, shiftIndices = false): void {
    const vOff = prevNumVerts * vertElStride
    const iOff = prevNumTri * triElStride
    const indShift = shiftIndices ? prevNumVerts : 0;
    const vi0 = triInd[0] + indShift
    const vi1 = triInd[1] + indShift
    const vi2 = triInd[2] + indShift
    indices[iOff + 0] = vi0
    indices[iOff + 1] = vi1
    indices[iOff + 2] = vi2
    // set per-face vertex data
    // position
    verts[vOff + vi0 * vertElStride + 0] = triPos[0][0]
    verts[vOff + vi0 * vertElStride + 1] = triPos[0][1]
    verts[vOff + vi0 * vertElStride + 2] = triPos[0][2]
    verts[vOff + vi1 * vertElStride + 0] = triPos[1][0]
    verts[vOff + vi1 * vertElStride + 1] = triPos[1][1]
    verts[vOff + vi1 * vertElStride + 2] = triPos[1][2]
    verts[vOff + vi2 * vertElStride + 0] = triPos[2][0]
    verts[vOff + vi2 * vertElStride + 1] = triPos[2][1]
    verts[vOff + vi2 * vertElStride + 2] = triPos[2][2]
    // color
    const [r, g, b] = triColor
    verts[vOff + vi0 * vertElStride + 3] = r
    verts[vOff + vi0 * vertElStride + 4] = g
    verts[vOff + vi0 * vertElStride + 5] = b
    verts[vOff + vi1 * vertElStride + 3] = r
    verts[vOff + vi1 * vertElStride + 4] = g
    verts[vOff + vi1 * vertElStride + 5] = b
    verts[vOff + vi2 * vertElStride + 3] = r
    verts[vOff + vi2 * vertElStride + 4] = g
    verts[vOff + vi2 * vertElStride + 5] = b
    // normals
    const [nx, ny, nz] = triNorm
    verts[vOff + vi0 * vertElStride + 6] = nx
    verts[vOff + vi0 * vertElStride + 7] = ny
    verts[vOff + vi0 * vertElStride + 8] = nz
    verts[vOff + vi1 * vertElStride + 6] = nx
    verts[vOff + vi1 * vertElStride + 7] = ny
    verts[vOff + vi1 * vertElStride + 8] = nz
    verts[vOff + vi2 * vertElStride + 6] = nx
    verts[vOff + vi2 * vertElStride + 7] = ny
    verts[vOff + vi2 * vertElStride + 8] = nz
}
/*
Adds mesh vertices and indices into buffers. Optionally shifts triangle indicies.
*/
function addMeshToBuffers(
    m: MeshModel,
    verts: Float32Array, prevNumVerts: number, vertElStride: number,
    indices: Uint16Array, prevNumTri: number, shiftIndices = false): void {
    // IMPORTANT: assumes unshared vertices
    const norms = computeNormals(m);
    const vOff = prevNumVerts * vertElStride
    m.tri.forEach((t, i) => {
        addTriToBuffers(
            [m.pos[t[0]], m.pos[t[1]], m.pos[t[2]]],
            t,
            norms[i],
            m.colors[i],
            verts, prevNumVerts, vertElStride,
            indices, prevNumTri + i, shiftIndices);
    })
}

// TODO(@darzu): rename to MeshHandle ?
export interface Mesh {
    // handles into the buffers
    vertNumOffset: number,
    indicesNumOffset: number,
    modelUniByteOffset: number,
    // data
    transform: mat4;
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
