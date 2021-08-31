

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need

import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align } from "../math.js";
import { computeTriangleNormal, Mesh } from "./sprig-main.js";

const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerUint16 = Uint16Array.BYTES_PER_ELEMENT;
const bytesPerUint32 = Uint32Array.BYTES_PER_ELEMENT;

export enum VertexKind {
    normal = 0,
    water = 1,
}

// TODO(@darzu): VERTEX FORMAT
// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
export const vertexDataFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' }, // normals
    { shaderLocation: 3, offset: bytesPerVec3 * 3, format: 'uint32' }, // kind
];
// these help us pack and use vertices in that format
export const vertByteSize = bytesPerVec3/*pos*/ + bytesPerVec3/*color*/ + bytesPerVec3/*normal*/ + bytesPerUint32/*kind*/;

// for performance reasons, we keep scratch buffers around
const _scratch_serializeVertex_f32 = new Float32Array(3 + 3 + 3);
const _scratch_serializeVertex_f32_as_u8 = new Uint8Array(_scratch_serializeVertex_f32.buffer);
const _scratch_serializeVertex_u32 = new Uint32Array(1);
const _scratch_serializeVertex_u32_as_u8 = new Uint8Array(_scratch_serializeVertex_u32.buffer);
export function serializeVertex(buffer: Uint8Array, byteOffset: number, pos: vec3, color: vec3, normal: vec3, kind: number) {
    _scratch_serializeVertex_f32[0] = pos[0]
    _scratch_serializeVertex_f32[1] = pos[1]
    _scratch_serializeVertex_f32[2] = pos[2]
    _scratch_serializeVertex_f32[3] = color[0]
    _scratch_serializeVertex_f32[4] = color[1]
    _scratch_serializeVertex_f32[5] = color[2]
    _scratch_serializeVertex_f32[6] = normal[0]
    _scratch_serializeVertex_f32[7] = normal[1]
    _scratch_serializeVertex_f32[8] = normal[2]
    buffer.set(_scratch_serializeVertex_f32_as_u8, byteOffset)
    _scratch_serializeVertex_u32[0] = kind
    buffer.set(_scratch_serializeVertex_u32_as_u8, byteOffset + bytesPerVec3 * 3);
}

// TODO(@darzu): MODEL FORMAT
// define the format of our models' uniform buffer
// TODO(@darzu): move "kind" into uniform buffer (instead of per-vertex)
// TODO(@darzu): handle alignment issues
export const meshUniByteSizeExact =
    bytesPerMat4 // transform
    + align(bytesPerVec3, 4) // mesh min
    + align(bytesPerVec3, 4) // mesh max
export const meshUniByteSizeAligned = align(meshUniByteSizeExact, 256); // uniform objects must be 256 byte aligned


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
    modelMin: vec3,
    modelMax: vec3,
    model?: Mesh,
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
    verticesMap: Uint8Array,
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
    buildMesh: () => MeshBuilder,
    updateUniform: (m: MeshHandle) => void,
    finish: () => MeshPool,
}
export interface MeshPool {
    // options
    opts: MeshPoolOpts,
    // buffers
    verticesBuffer: GPUBuffer,
    indicesBuffer: GPUBuffer,
    uniformBuffer: GPUBuffer,
    // data
    allMeshes: MeshHandle[],
    numTris: number,
    numVerts: number,
    // handles
    device: GPUDevice,
    // methods
    updateUniform: (m: MeshHandle) => void,
}


export interface MeshBuilder {
    poolBuilder: MeshPoolBuilder;
    addVertex: (pos: vec3, color: vec3, normal: vec3, kind: number) => void,
    addTri: (ind: vec3) => void,
    setUniform: (transform: mat4, aabbMin: vec3, aabbMax: vec3) => void,
    finish: () => MeshHandle;
}

export function createMeshPoolBuilder(device: GPUDevice, opts: MeshPoolOpts): MeshPoolBuilder {
    const { maxMeshes, maxTris, maxVerts } = opts;

    let finished = false;

    // log our estimated space usage stats
    console.log(`Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`);
    console.log(`   ${(maxVerts * vertByteSize / 1024).toFixed(1)} KB for verts`);
    console.log(`   ${(maxTris * bytesPerTri / 1024).toFixed(1)} KB for indices`);
    console.log(`   ${(maxMeshes * meshUniByteSizeAligned / 1024).toFixed(1)} KB for other object data`);
    const unusedBytesPerModel = meshUniByteSizeAligned - meshUniByteSizeExact;
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
    const uniformBuffer = device.createBuffer({
        size: meshUniByteSizeAligned * maxMeshes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });

    const allMeshes: MeshHandle[] = [];

    // to modify buffers, we need to map them into JS space; we'll need to unmap later
    let verticesMap = new Uint8Array(verticesBuffer.getMappedRange())
    let indicesMap = new Uint16Array(indicesBuffer.getMappedRange());
    let uniformMap = new Uint8Array(uniformBuffer.getMappedRange());

    const pool: MeshPool = {
        opts,
        device,
        verticesBuffer,
        indicesBuffer,
        uniformBuffer,
        allMeshes,
        numTris: 0,
        numVerts: 0,
        updateUniform: _queueSetUniform,
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
        buildMesh,
        updateUniform,
        finish,
    };

    // add our meshes to the vertex and index buffers
    function addMesh(m: Mesh): MeshHandle {
        if (finished)
            throw `trying to use finished MeshPoolBuilder`
        // m = unshareVertices(m); // work-around; see TODO inside function
        if (!m.usesProvoking)
            throw `mesh must use provoking vertices`
        // m = unshareProvokingVertices(m);
        if (verticesMap === null)
            throw "Use preRender() and postRender() functions"
        if (builder.numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!"
        if (builder.numTris + m.tri.length > maxTris)
            throw "Too many triangles!"

        const b = buildMesh();

        const vertNumOffset = builder.numVerts;
        const indicesNumOffset = builder.numTris * indicesPerTriangle;

        m.pos.forEach((pos, i) => {
            b.addVertex(pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0], VertexKind.normal)
        })
        m.tri.forEach((triInd, i) => {
            b.addTri(triInd)

            // set provoking vertex data
            const vOff = (vertNumOffset + triInd[0]) * vertByteSize
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
            serializeVertex(verticesMap, vOff, m.pos[triInd[0]], m.colors[i], normal, VertexKind.normal)
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        })

        const { min, max } = getAABBFromMesh(m)

        b.setUniform(mat4.create(), min, max);

        return b.finish();
    }

    function _queueSetUniform(m: MeshHandle) {
        // TODO(@darzu): for some reason doing this seperate for the transform and the AABB box didn't work...
        // TODO(@darzu): MESH FORMAT
        // TODO(@darzu): alignment requirements
        // const offset = m.modelUniByteOffset + bytesPerMat4 /*transform*/
        // m.pool.device.queue.writeBuffer(m.pool.uniformBuffer, offset, (m.modelMin as Float32Array).buffer);
        // m.pool.device.queue.writeBuffer(m.pool.uniformBuffer, offset + align(bytesPerVec3, 4), (m.modelMax as Float32Array).buffer);

        // const f32Scratch = new Float32Array(4 + 4);
        const f32Scratch = new Float32Array(4 * 4 + 4 + 4);
        f32Scratch.set(m.transform, 0)
        f32Scratch.set(m.modelMin, align(4 * 4, 4))
        f32Scratch.set(m.modelMax, align(4 * 4 + 3, 4))
        const u8Scratch = new Uint8Array(f32Scratch.buffer);
        m.pool.device.queue.writeBuffer(m.pool.uniformBuffer, m.modelUniByteOffset, u8Scratch);
    }
    function _mappedSetUniform(uniOffset: number, transform: mat4, aabbMin: vec3, aabbMax: vec3): void {
        // TODO(@darzu): MESH FORMAT
        // TODO(@darzu): seems each element needs to be 4-byte aligned
        const f32Scratch = new Float32Array(4 * 4 + 4 + 4);
        f32Scratch.set(transform, 0)
        f32Scratch.set(aabbMin, align(4 * 4, 4))
        f32Scratch.set(aabbMax, align(4 * 4 + 3, 4))
        const u8Scratch = new Uint8Array(f32Scratch.buffer);
        // console.dir({ floatBuff: f32Scratch })
        builder.uniformMap.set(u8Scratch, uniOffset)
    }

    function finish(): MeshPool {
        if (finished)
            throw `trying to use finished MeshPoolBuilder`
        finished = true;
        // unmap the buffers so the GPU can use them
        verticesBuffer.unmap()
        indicesBuffer.unmap()
        uniformBuffer.unmap()

        pool.numTris = builder.numTris;
        pool.numVerts = builder.numVerts;

        console.log(`Finishing pool with: ${builder.numTris} triangles, ${builder.numVerts} vertices`);

        return pool;
    }

    function updateUniform(m: MeshHandle): void {
        if (finished)
            throw 'trying to use finished MeshBuilder'
        _mappedSetUniform(m.modelUniByteOffset, m.transform, m.modelMin, m.modelMax)
    }


    function buildMesh(): MeshBuilder {
        if (finished)
            throw `trying to use finished MeshPoolBuilder`
        let meshFinished = false;
        const uniOffset = builder.allMeshes.length * meshUniByteSizeAligned;
        const vertNumOffset = builder.numVerts;
        const triNumOffset = builder.numTris;
        const indicesNumOffset = builder.numTris * 3;

        const aabbMin = vec3.fromValues(Infinity, Infinity, Infinity) as Float32Array;
        const aabbMax = vec3.fromValues(-Infinity, -Infinity, -Infinity) as Float32Array;

        // TODO(@darzu): VERTEX FORMAT
        function addVertex(pos: vec3, color: vec3, normal: vec3, kind: number): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            const vOff = builder.numVerts * vertByteSize
            serializeVertex(builder.verticesMap, vOff, pos, color, normal, kind)
            builder.numVerts += 1;

            // update our aabb min/max
            aabbMin[0] = Math.min(pos[0], aabbMin[0])
            aabbMin[1] = Math.min(pos[1], aabbMin[1])
            aabbMin[2] = Math.min(pos[2], aabbMin[2])
            aabbMax[0] = Math.max(pos[0], aabbMax[0])
            aabbMax[1] = Math.max(pos[1], aabbMax[1])
            aabbMax[2] = Math.max(pos[2], aabbMax[2])
        }
        function addTri(triInd: vec3): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            const iOff = builder.numTris * 3
            builder.indicesMap.set(triInd, iOff)
            builder.numTris += 1;
        }

        let _transform: mat4 | undefined = undefined;
        function setUniform(transform: mat4, aabbMin: vec3, aabbMax: vec3): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            _transform = transform;
            _mappedSetUniform(uniOffset, transform, aabbMin, aabbMax)
        }

        function finish(): MeshHandle {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            if (!_transform)
                throw 'uniform never set for mesh'
            meshFinished = true;
            const res: MeshHandle = {
                vertNumOffset,
                indicesNumOffset,
                modelUniByteOffset: uniOffset,
                transform: _transform!,
                modelMin: aabbMin,
                modelMax: aabbMax,
                numTris: builder.numTris - triNumOffset,
                model: undefined,
                pool: builder.poolHandle,
            }
            builder.allMeshes.push(res)
            return res;
        }

        return {
            poolBuilder: builder,
            addVertex,
            addTri,
            setUniform,
            finish
        }
    }

    return builder;
}

// utils
export interface AABB {
    min: vec3,
    max: vec3,
}

export function getAABBFromMesh(m: Mesh): AABB {
    const min = vec3.fromValues(Infinity, Infinity, Infinity) as Float32Array
    const max = vec3.fromValues(-Infinity, -Infinity, -Infinity) as Float32Array

    for (let pos of m.pos) {
        min[0] = Math.min(pos[0], min[0])
        min[1] = Math.min(pos[1], min[1])
        min[2] = Math.min(pos[2], min[2])
        max[0] = Math.max(pos[0], max[0])
        max[1] = Math.max(pos[1], max[1])
        max[2] = Math.max(pos[2], max[2])
    }

    return { min, max }
}