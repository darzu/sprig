

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need

import { mat4, vec3 } from "../ext/gl-matrix.js";
import { align, sum } from "../math.js";
import { computeTriangleNormal, Mesh } from "./sprig-main.js";

const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;
const bytesPerMat4 = (4 * 4)/*4x4 mat*/ * 4/*f32*/
const bytesPerVec3 = 3/*vec3*/ * 4/*f32*/
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerUint16 = Uint16Array.BYTES_PER_ELEMENT;
const bytesPerUint32 = Uint32Array.BYTES_PER_ELEMENT;

// Everything to do with our vertex format must be in this module (minus downstream 
//  places that should get type errors when this module changes.)
// TODO(@darzu): code gen some of this so code changes are less error prone.
export module Vertex {
    export enum Kind {
        normal = 0,
        water = 1,
    }

    // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
    export const WebGPUFormat: GPUVertexAttribute[] = [
        { shaderLocation: 0, offset: bytesPerVec3 * 0, format: 'float32x3' }, // position
        { shaderLocation: 1, offset: bytesPerVec3 * 1, format: 'float32x3' }, // color
        { shaderLocation: 2, offset: bytesPerVec3 * 2, format: 'float32x3' }, // normals
        { shaderLocation: 3, offset: bytesPerVec3 * 3, format: 'uint32' }, // kind
    ];

    const names = [
        'position',
        'color',
        'normal',
        'kind',
    ]

    const formatToWgslType: Partial<Record<GPUVertexFormat, string>> = {
        "float16x2": "vec2<f16>",
        "float16x4": "vec2<f16>",
        "float32": "f32",
        "float32x2": "vec2<f32>",
        "float32x3": "vec3<f32>",
        "float32x4": "vec4<f32>",
        "uint32": "u32",
        "sint32": "i32",
    }

    export function GenerateWGSLVertexInputStruct(terminator: ',' | ';'): string {
        // Example output:
        // `
        // [[location(0)]] position : vec3<f32>,
        // [[location(1)]] color : vec3<f32>,
        // [[location(2)]] normal : vec3<f32>,
        // [[location(3)]] kind : u32,
        // `

        let res = ``

        if (WebGPUFormat.length !== names.length)
            throw `mismatch between vertex format specifiers and names`

        for (let i = 0; i < WebGPUFormat.length; i++) {
            const f = WebGPUFormat[i]
            const t = formatToWgslType[f.format]
            const n = names[i]
            if (!t)
                throw `Unknown vertex type -> wgls type '${f.format}'`
            res += `[[location(${f.shaderLocation})]] ${n} : ${t}${terminator}\n`
        }

        return res;
    }

    // these help us pack and use vertices in that format
    export const ByteSize = bytesPerVec3/*pos*/ + bytesPerVec3/*color*/ + bytesPerVec3/*normal*/ + bytesPerUint32/*kind*/;

    // for performance reasons, we keep scratch buffers around
    const scratch_f32 = new Float32Array(3 + 3 + 3);
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    const scratch_u32 = new Uint32Array(1);
    const scratch_u32_as_u8 = new Uint8Array(scratch_u32.buffer);
    export function Serialize(buffer: Uint8Array, byteOffset: number, pos: vec3, color: vec3, normal: vec3, kind: number) {
        scratch_f32[0] = pos[0]
        scratch_f32[1] = pos[1]
        scratch_f32[2] = pos[2]
        scratch_f32[3] = color[0]
        scratch_f32[4] = color[1]
        scratch_f32[5] = color[2]
        scratch_f32[6] = normal[0]
        scratch_f32[7] = normal[1]
        scratch_f32[8] = normal[2]
        buffer.set(scratch_f32_as_u8, byteOffset)
        scratch_u32[0] = kind
        buffer.set(scratch_u32_as_u8, byteOffset + bytesPerVec3 * 3);
    }

}

export module MeshUniform {
    const _counts = [
        align(4 * 4, 4), // transform
        align(3, 4), // aabb min
        align(3, 4), // aabb max
    ]
    const _names = [
        'transform',
        'aabbMin',
        'aabbMax',
    ]
    const _types = [
        'mat4x4<f32>',
        'vec3<f32>',
        'vec3<f32>',
    ]

    const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0])

    export const ByteSizeExact = sum(_counts) * bytesPerFloat

    export const ByteSizeAligned = align(ByteSizeExact, 256); // uniform objects must be 256 byte aligned

    const scratch_f32 = new Float32Array(sum(_counts));
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    export function Serialize(buffer: Uint8Array, byteOffset: number, transform: mat4, aabbMin: vec3, aabbMax: vec3): void {
        scratch_f32.set(transform, _offsets[0])
        scratch_f32.set(aabbMin, _offsets[1])
        scratch_f32.set(aabbMax, _offsets[2])
        buffer.set(scratch_f32_as_u8, byteOffset)
    }

    export function GenerateWGSLUniformStruct() {
        // Example:
        //     transform: mat4x4<f32>;
        //     aabbMin: vec3<f32>;
        //     aabbMax: vec3<f32>;
        if (_names.length !== _types.length)
            throw `mismatch between names and sizes for mesh uniform format`
        let res = ``

        for (let i = 0; i < _names.length; i++) {
            const n = _names[i]
            const t = _types[i]
            res += `${n}: ${t};\n`
        }

        return res;
    }
}

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
    aabbMin: vec3,
    aabbMax: vec3,
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
    console.log(`   ${(maxVerts * Vertex.ByteSize / 1024).toFixed(1)} KB for verts`);
    console.log(`   ${(maxTris * bytesPerTri / 1024).toFixed(1)} KB for indices`);
    console.log(`   ${(maxMeshes * MeshUniform.ByteSizeAligned / 1024).toFixed(1)} KB for object uniform data`);
    const unusedBytesPerModel = MeshUniform.ByteSizeAligned - MeshUniform.ByteSizeExact;
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(unusedBytesPerModel * maxMeshes / 1024).toFixed(1)} KB total waste)`);
    const totalReservedBytes = maxVerts * Vertex.ByteSize + maxTris * bytesPerTri + maxMeshes * MeshUniform.ByteSizeAligned;
    console.log(`Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(1)} KB`);

    // create our mesh buffers (vertex, index, uniform)
    const verticesBuffer = device.createBuffer({
        size: maxVerts * Vertex.ByteSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const indicesBuffer = device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const uniformBuffer = device.createBuffer({
        size: MeshUniform.ByteSizeAligned * maxMeshes,
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

        m.pos.forEach((pos, i) => {
            b.addVertex(pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0], Vertex.Kind.normal)
        })
        m.tri.forEach((triInd, i) => {
            b.addTri(triInd)

            // set provoking vertex data
            const vOff = (vertNumOffset + triInd[0]) * Vertex.ByteSize
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]])
            Vertex.Serialize(verticesMap, vOff, m.pos[triInd[0]], m.colors[i], normal, Vertex.Kind.normal)
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        })

        const { min, max } = getAABBFromMesh(m)

        b.setUniform(mat4.create(), min, max);

        return b.finish();
    }

    const scratch_uniform_u8 = new Uint8Array(MeshUniform.ByteSizeAligned);
    function _queueSetUniform(m: MeshHandle) {
        MeshUniform.Serialize(scratch_uniform_u8, 0, m.transform, m.aabbMin, m.aabbMax)
        m.pool.device.queue.writeBuffer(m.pool.uniformBuffer, m.modelUniByteOffset, scratch_uniform_u8);
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
        MeshUniform.Serialize(scratch_uniform_u8, 0, m.transform, m.aabbMin, m.aabbMax)
        builder.uniformMap.set(scratch_uniform_u8, m.modelUniByteOffset);
    }


    function buildMesh(): MeshBuilder {
        if (finished)
            throw `trying to use finished MeshPoolBuilder`
        let meshFinished = false;
        const uniOffset = builder.allMeshes.length * MeshUniform.ByteSizeAligned;
        const vertNumOffset = builder.numVerts;
        const triNumOffset = builder.numTris;
        const indicesNumOffset = builder.numTris * 3;

        // TODO(@darzu): VERTEX FORMAT
        function addVertex(pos: vec3, color: vec3, normal: vec3, kind: number): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            const vOff = builder.numVerts * Vertex.ByteSize
            Vertex.Serialize(builder.verticesMap, vOff, pos, color, normal, kind)
            builder.numVerts += 1;
        }
        function addTri(triInd: vec3): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            const iOff = builder.numTris * 3
            builder.indicesMap.set(triInd, iOff)
            builder.numTris += 1;
        }

        let _transform: mat4 | undefined = undefined;
        let _aabbMin: vec3 | undefined = undefined;
        let _aabbMax: vec3 | undefined = undefined;
        function setUniform(transform: mat4, aabbMin: vec3, aabbMax: vec3): void {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            _transform = transform;
            _aabbMin = aabbMin;
            _aabbMax = aabbMax;
            MeshUniform.Serialize(scratch_uniform_u8, 0, transform, aabbMin, aabbMax)
            builder.uniformMap.set(scratch_uniform_u8, uniOffset);
        }

        function finish(): MeshHandle {
            if (finished || meshFinished)
                throw 'trying to use finished MeshBuilder'
            if (!_transform)
                throw 'uniform never set for this mesh!'
            meshFinished = true;
            const res: MeshHandle = {
                vertNumOffset,
                indicesNumOffset,
                modelUniByteOffset: uniOffset,
                transform: _transform!,
                aabbMin: _aabbMin!,
                aabbMax: _aabbMax!,
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