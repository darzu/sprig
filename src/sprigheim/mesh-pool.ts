

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need

import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align } from "../math.js";
import { computeTriangleNormal, Mesh, meshUniByteSizeAligned, meshUniByteSizeExact, setVertexData, vertByteSize, VertexKind } from "./sprig_main.js";

const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

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
    const _meshUniBuffer = device.createBuffer({
        size: meshUniByteSizeAligned * maxMeshes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });

    const allMeshes: MeshHandle[] = [];

    // to modify buffers, we need to map them into JS space; we'll need to unmap later
    let verticesMap = new Uint8Array(verticesBuffer.getMappedRange())
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
            throw `mesh must use provoking vertices`
        // m = unshareProvokingVertices(m);
        if (verticesMap === null)
            throw "Use preRender() and postRender() functions"
        if (builder.numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!"
        if (builder.numTris + m.tri.length > maxTris)
            throw "Too many triangles!"

        const vertNumOffset = builder.numVerts;
        const indicesNumOffset = builder.numTris * indicesPerTriangle;

        const modelMin = vec3.fromValues(99999.0, 99999.0, 99999.0) as Float32Array
        const modelMax = vec3.fromValues(-99999.0, -99999.0, -99999.0) as Float32Array
        m.pos.forEach((pos, i) => {
            // track the mesh's min and max vert positions (it's AABB)
            modelMin[0] = Math.min(pos[0], modelMin[0])
            modelMin[1] = Math.min(pos[1], modelMin[1])
            modelMin[2] = Math.min(pos[2], modelMin[2])
            modelMax[0] = Math.max(pos[0], modelMax[0])
            modelMax[1] = Math.max(pos[1], modelMax[1])
            modelMax[2] = Math.max(pos[2], modelMax[2])

            const vOff = (builder.numVerts + i) * vertByteSize
            setVertexData(verticesMap, [pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0], VertexKind.normal], vOff)
        })
        m.tri.forEach((triInd, i) => {
            const iOff = (builder.numTris + i) * indicesPerTriangle
            indicesMap[iOff + 0] = triInd[0]
            indicesMap[iOff + 1] = triInd[1]
            indicesMap[iOff + 2] = triInd[2]
            const vOff = (builder.numVerts + triInd[0]) * vertByteSize
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
            setVertexData(verticesMap, [m.pos[triInd[0]], m.colors[i], normal, VertexKind.normal], vOff)
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        })

        builder.numVerts += m.pos.length;
        builder.numTris += m.tri.length;

        const transform = mat4.create() as Float32Array;

        const uniOffset = allMeshes.length * meshUniByteSizeAligned;

        // TODO(@darzu): debugging
        // minPos[0] = 0.0;
        // minPos[1] = 0.0;
        // minPos[2] = 0.0;
        // maxPos[0] = 0.0;
        // maxPos[1] = 0.0;
        // maxPos[2] = 0.0;

        // TODO(@darzu): MESH FORMAT
        // TODO(@darzu): seems each element needs to be 4-byte aligned
        const f32Scratch = new Float32Array(4 * 4 + 4 + 4);
        f32Scratch.set(transform, 0)
        f32Scratch.set(modelMin, align(4 * 4, 4))
        f32Scratch.set(modelMax, align(4 * 4 + 3, 4))
        const u8Scratch = new Uint8Array(f32Scratch.buffer);

        console.dir({ floatBuff: f32Scratch })
        uniformMap.set(u8Scratch, uniOffset)

        // console.dir(uniformMap.slice(uniOffset, uniOffset + bytesPerMat4 + bytesPerVec3 * 2))

        const res: MeshHandle = {
            vertNumOffset,
            indicesNumOffset,
            modelUniByteOffset: uniOffset,
            transform,
            modelMin,
            modelMax,
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
// export function meshApplyTransform(m: MeshHandle) {
//     m.pool.device.queue.writeBuffer(m.pool._meshUniBuffer, m.modelUniByteOffset, (m.transform as Float32Array).buffer);
// }
export function meshApplyUniformData(m: MeshHandle) {
    // TODO(@darzu): for some reason doing this seperate for the transform and the AABB box didn't work...
    // TODO(@darzu): MESH FORMAT
    // TODO(@darzu): alignment requirements
    // const offset = m.modelUniByteOffset + bytesPerMat4 /*transform*/
    // m.pool.device.queue.writeBuffer(m.pool._meshUniBuffer, offset, (m.modelMin as Float32Array).buffer);
    // m.pool.device.queue.writeBuffer(m.pool._meshUniBuffer, offset + align(bytesPerVec3, 4), (m.modelMax as Float32Array).buffer);

    // const f32Scratch = new Float32Array(4 + 4);
    const f32Scratch = new Float32Array(4 * 4 + 4 + 4);
    f32Scratch.set(m.transform, 0)
    // f32Scratch.set(m.modelMin, 0)
    // f32Scratch.set(m.modelMax, 4)
    f32Scratch.set(m.modelMin, align(4 * 4, 4))
    f32Scratch.set(m.modelMax, align(4 * 4 + 3, 4))
    const u8Scratch = new Uint8Array(f32Scratch.buffer);
    m.pool.device.queue.writeBuffer(m.pool._meshUniBuffer, m.modelUniByteOffset, u8Scratch);
}