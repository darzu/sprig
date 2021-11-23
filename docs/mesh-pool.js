import { computeTriangleNormal } from "./utils-3d.js";
import { mat4, vec2, vec3 } from "./gl-matrix.js";
import { align, sum } from "./math.js";
import { getAABBFromPositions } from "./phys_broadphase.js";
// TODO(@darzu): BUGS:
// - in WebGL, around object 5566, we get some weird index stuff, even single player.
//       Adding object 5567
//       mesh-pool.ts:711 QUEUE builder.allMeshes.length: 5567, builder.numTris: 16, builder.numVerts: 16
//       mesh-pool.ts:712 QUEUE pool.allMeshes.length: 5567, pool.numTris: 66796, pool.numVerts: 66796
const vertsPerTri = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * vertsPerTri;
const linesPerTri = 6;
const bytesPerLine = Uint16Array.BYTES_PER_ELEMENT * 2;
const bytesPerMat4 = 4 * 4 /*4x4 mat*/ * 4; /*f32*/
const bytesPerVec3 = 3 /*vec3*/ * 4; /*f32*/
const bytesPerVec2 = 2 /*vec3*/ * 4; /*f32*/
const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerUint16 = Uint16Array.BYTES_PER_ELEMENT;
const bytesPerUint32 = Uint32Array.BYTES_PER_ELEMENT;
const MAX_INDICES = 65535; // Since we're using u16 index type, this is our max indices count
// Everything to do with our vertex format must be in this module (minus downstream
//  places that should get type errors when this module changes.)
// TODO(@darzu): code gen some of this so code changes are less error prone.
export var Vertex;
(function (Vertex) {
    let Kind;
    (function (Kind) {
        Kind[Kind["normal"] = 0] = "normal";
        Kind[Kind["water"] = 1] = "water";
    })(Kind = Vertex.Kind || (Vertex.Kind = {}));
    // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
    Vertex.WebGPUFormat = [
        { shaderLocation: 0, offset: bytesPerVec3 * 0, format: "float32x3" },
        { shaderLocation: 1, offset: bytesPerVec3 * 1, format: "float32x3" },
        { shaderLocation: 2, offset: bytesPerVec3 * 2, format: "float32x3" }, // normals
    ];
    const names = ["position", "color", "normal"];
    const formatToWgslType = {
        float16x2: "vec2<f16>",
        float16x4: "vec2<f16>",
        float32: "f32",
        float32x2: "vec2<f32>",
        float32x3: "vec3<f32>",
        float32x4: "vec4<f32>",
        uint32: "u32",
        sint32: "i32",
    };
    function GenerateWGSLVertexInputStruct(terminator) {
        // Example output:
        // `
        // [[location(0)]] position : vec3<f32>,
        // [[location(1)]] color : vec3<f32>,
        // [[location(2)]] normal : vec3<f32>,
        // [[location(3)]] kind : u32,
        // `
        let res = ``;
        if (Vertex.WebGPUFormat.length !== names.length)
            throw `mismatch between vertex format specifiers and names`;
        for (let i = 0; i < Vertex.WebGPUFormat.length; i++) {
            const f = Vertex.WebGPUFormat[i];
            const t = formatToWgslType[f.format];
            const n = names[i];
            if (!t)
                throw `Unknown vertex type -> wgls type '${f.format}'`;
            res += `[[location(${f.shaderLocation})]] ${n} : ${t}${terminator}\n`;
        }
        return res;
    }
    Vertex.GenerateWGSLVertexInputStruct = GenerateWGSLVertexInputStruct;
    // these help us pack and use vertices in that format
    Vertex.ByteSize = bytesPerVec3 /*pos*/ + bytesPerVec3 /*color*/ + bytesPerVec3; /*normal*/
    // for performance reasons, we keep scratch buffers around
    const scratch_f32 = new Float32Array(3 + 3 + 3);
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    const scratch_u32 = new Uint32Array(1);
    const scratch_u32_as_u8 = new Uint8Array(scratch_u32.buffer);
    function Serialize(buffer, byteOffset, pos, color, normal) {
        scratch_f32[0] = pos[0];
        scratch_f32[1] = pos[1];
        scratch_f32[2] = pos[2];
        scratch_f32[3] = color[0];
        scratch_f32[4] = color[1];
        scratch_f32[5] = color[2];
        scratch_f32[6] = normal[0];
        scratch_f32[7] = normal[1];
        scratch_f32[8] = normal[2];
        buffer.set(scratch_f32_as_u8, byteOffset);
    }
    Vertex.Serialize = Serialize;
    // for WebGL: deserialize whole array?
    function Deserialize(buffer, vertexCount, positions, colors, normals) {
        if (false ||
            buffer.length < vertexCount * Vertex.ByteSize ||
            positions.length < vertexCount * 3 ||
            colors.length < vertexCount * 3 ||
            normals.length < vertexCount * 3)
            throw "buffer too short!";
        // TODO(@darzu): This only works because they have the same element size. Not sure what to do if that changes.
        const f32View = new Float32Array(buffer.buffer);
        const u32View = new Uint32Array(buffer.buffer);
        for (let i = 0; i < vertexCount; i++) {
            const u8_i = i * Vertex.ByteSize;
            const f32_i = u8_i / Float32Array.BYTES_PER_ELEMENT;
            const u32_i = u8_i / Uint32Array.BYTES_PER_ELEMENT;
            positions[i * 3 + 0] = f32View[f32_i + 0];
            positions[i * 3 + 1] = f32View[f32_i + 1];
            positions[i * 3 + 2] = f32View[f32_i + 2];
            colors[i * 3 + 0] = f32View[f32_i + 3];
            colors[i * 3 + 1] = f32View[f32_i + 4];
            colors[i * 3 + 2] = f32View[f32_i + 5];
            normals[i * 3 + 0] = f32View[f32_i + 6];
            normals[i * 3 + 1] = f32View[f32_i + 7];
            normals[i * 3 + 2] = f32View[f32_i + 8];
        }
    }
    Vertex.Deserialize = Deserialize;
})(Vertex || (Vertex = {}));
export var MeshUniform;
(function (MeshUniform) {
    const _counts = [
        align(4 * 4, 4),
        align(3, 4),
        align(3, 4),
        align(3, 4), // tint
    ];
    const _names = ["transform", "aabbMin", "aabbMax", "tint"];
    const _types = ["mat4x4<f32>", "vec3<f32>", "vec3<f32>", "vec3<f32>"];
    const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);
    MeshUniform.ByteSizeExact = sum(_counts) * bytesPerFloat;
    MeshUniform.ByteSizeAligned = align(MeshUniform.ByteSizeExact, 256); // uniform objects must be 256 byte aligned
    const scratch_f32 = new Float32Array(sum(_counts));
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    function Serialize(buffer, byteOffset, transform, aabbMin, aabbMax, tint) {
        scratch_f32.set(transform, _offsets[0]);
        scratch_f32.set(aabbMin, _offsets[1]);
        scratch_f32.set(aabbMax, _offsets[2]);
        scratch_f32.set(tint, _offsets[3]);
        buffer.set(scratch_f32_as_u8, byteOffset);
    }
    MeshUniform.Serialize = Serialize;
    function GenerateWGSLUniformStruct() {
        // Example:
        //     transform: mat4x4<f32>;
        //     aabbMin: vec3<f32>;
        //     aabbMax: vec3<f32>;
        //     tint: vec3<f32>;
        if (_names.length !== _types.length)
            throw `mismatch between names and sizes for mesh uniform format`;
        let res = ``;
        for (let i = 0; i < _names.length; i++) {
            const n = _names[i];
            const t = _types[i];
            res += `${n}: ${t};\n`;
        }
        return res;
    }
    MeshUniform.GenerateWGSLUniformStruct = GenerateWGSLUniformStruct;
    function CloneData(d) {
        return {
            aabbMin: vec3.clone(d.aabbMin),
            aabbMax: vec3.clone(d.aabbMax),
            transform: mat4.clone(d.transform),
            tint: vec3.clone(d.tint),
        };
    }
    MeshUniform.CloneData = CloneData;
})(MeshUniform || (MeshUniform = {}));
export var SceneUniform;
(function (SceneUniform) {
    const _counts = [
        4 * 4,
        4 * 4,
        3,
        1,
        2,
        3, // camera pos
    ];
    const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);
    // TODO(@darzu): SCENE FORMAT
    // defines the format of our scene's uniform data
    SceneUniform.ByteSizeExact = sum(_counts) * bytesPerFloat;
    SceneUniform.ByteSizeAligned = align(SceneUniform.ByteSizeExact, 256); // uniform objects must be 256 byte aligned
    function GenerateWGSLUniformStruct() {
        // Example
        //     cameraViewProjMatrix : mat4x4<f32>;
        //     lightViewProjMatrix : mat4x4<f32>;
        //     lightDir : vec3<f32>;
        //     time : f32;
        //     playerPos: vec2<f32>;
        //     cameraPos : vec3<f32>;
        // TODO(@darzu): enforce agreement w/ Scene interface
        return `
            cameraViewProjMatrix : mat4x4<f32>;
            lightViewProjMatrix : mat4x4<f32>;
            lightDir : vec3<f32>;
            time : f32;
            playerPos: vec2<f32>;
            cameraPos : vec3<f32>;
        `;
    }
    SceneUniform.GenerateWGSLUniformStruct = GenerateWGSLUniformStruct;
    const scratch_f32 = new Float32Array(sum(_counts));
    const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
    function Serialize(buffer, byteOffset, data) {
        scratch_f32.set(data.cameraViewProjMatrix, _offsets[0]);
        scratch_f32.set(data.lightViewProjMatrix, _offsets[1]);
        scratch_f32.set(data.lightDir, _offsets[2]);
        scratch_f32[_offsets[3]] = data.time;
        scratch_f32.set(data.playerPos, _offsets[4]);
        scratch_f32.set(data.cameraPos, _offsets[5]);
        buffer.set(scratch_f32_as_u8, byteOffset);
    }
    SceneUniform.Serialize = Serialize;
})(SceneUniform || (SceneUniform = {}));
export function unshareVertices(input) {
    const pos = [];
    const tri = [];
    input.tri.forEach(([i0, i1, i2], i) => {
        pos.push(input.pos[i0]);
        pos.push(input.pos[i1]);
        pos.push(input.pos[i2]);
        tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
    });
    return { ...input, pos, tri, verticesUnshared: true };
}
export function unshareProvokingVertices(input) {
    const pos = [...input.pos];
    const tri = [];
    const provoking = {};
    input.tri.forEach(([i0, i1, i2], triI) => {
        if (!provoking[i0]) {
            // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
            provoking[i0] = true;
            tri.push([i0, i1, i2]);
        }
        else if (!provoking[i1]) {
            // First vertex was taken, so let's see if we can rotate the indices to get an unused
            // provoking vertex.
            provoking[i1] = true;
            tri.push([i1, i2, i0]);
        }
        else if (!provoking[i2]) {
            // ditto
            provoking[i2] = true;
            tri.push([i2, i0, i1]);
        }
        else {
            // All vertices are taken, so create a new one
            const i3 = pos.length;
            pos.push(input.pos[i0]);
            provoking[i3] = true;
            tri.push([i3, i1, i2]);
        }
    });
    return { ...input, pos, tri, usesProvoking: true };
}
export function createMeshPoolBuilder_WebGPU(device, opts) {
    const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
    // console.log(`maxMeshes: ${maxMeshes}, maxTris: ${maxTris}, maxVerts: ${maxVerts}`)
    // create our mesh buffers (vertex, index, uniform)
    const verticesBuffer = device.createBuffer({
        size: maxVerts * Vertex.ByteSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const triIndicesBuffer = device.createBuffer({
        size: maxTris * bytesPerTri,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    // TODO(@darzu): make creating this buffer optional on whether we're using line indices or not
    const lineIndicesBuffer = device.createBuffer({
        size: maxLines * bytesPerLine,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    const uniformBuffer = device.createBuffer({
        size: MeshUniform.ByteSizeAligned * maxMeshes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    // to modify buffers, we need to map them into JS space; we'll need to unmap later
    let verticesMap = new Uint8Array(verticesBuffer.getMappedRange());
    let triIndicesMap = new Uint16Array(triIndicesBuffer.getMappedRange());
    let lineIndicesMap = new Uint16Array(lineIndicesBuffer.getMappedRange());
    let uniformMap = new Uint8Array(uniformBuffer.getMappedRange());
    function queueUpdateBuffer(buffer, offset, data) {
        device.queue.writeBuffer(buffer, offset, data);
    }
    const maps = {
        verticesMap,
        triIndicesMap,
        lineIndicesMap,
        uniformMap,
    };
    const queues = {
        queueUpdateTriIndices: (offset, data) => queueUpdateBuffer(triIndicesBuffer, offset, data),
        queueUpdateLineIndices: (offset, data) => queueUpdateBuffer(lineIndicesBuffer, offset, data),
        queueUpdateVertices: (offset, data) => queueUpdateBuffer(verticesBuffer, offset, data),
        queueUpdateUniform: (offset, data) => queueUpdateBuffer(uniformBuffer, offset, data),
    };
    const buffers = {
        device,
        verticesBuffer,
        triIndicesBuffer,
        lineIndicesBuffer,
        uniformBuffer,
    };
    const builder = createMeshPoolBuilder(opts, maps, queues);
    const poolHandle = Object.assign(builder.poolHandle, buffers);
    const builder_webgpu = {
        ...builder,
        poolHandle,
        device,
        finish, // TODO(@darzu):
    };
    function finish() {
        // unmap the buffers so the GPU can use them
        verticesBuffer.unmap();
        triIndicesBuffer.unmap();
        lineIndicesBuffer.unmap();
        uniformBuffer.unmap();
        builder.finish();
        return poolHandle;
    }
    return builder_webgpu;
}
export function createMeshPoolBuilder_WebGL(gl, opts) {
    const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
    // TODO(@darzu): we shouldn't need to preallocate all this
    const scratchPositions = new Float32Array(maxVerts * 3);
    const scratchNormals = new Float32Array(maxVerts * 3);
    const scratchColors = new Float32Array(maxVerts * 3);
    const scratchTriIndices = new Uint16Array(maxTris * 3);
    const scratchLineIndices = new Uint16Array(maxLines * 2);
    // vertex buffers
    const positionsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, scratchPositions, gl.DYNAMIC_DRAW); // TODO(@darzu): sometimes we might want STATIC_DRAW
    const normalsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, scratchNormals, gl.DYNAMIC_DRAW);
    const colorsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, scratchColors, gl.DYNAMIC_DRAW);
    // index buffers
    const triIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchTriIndices, gl.DYNAMIC_DRAW);
    const lineIndicesBuffer = gl.createBuffer();
    // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchLineIndices, gl.DYNAMIC_DRAW);
    // our in-memory reflections of the buffers used during the initial build phase
    // TODO(@darzu): this is too much duplicate data
    let verticesMap = new Uint8Array(maxVerts * Vertex.ByteSize);
    let triIndicesMap = new Uint16Array(maxTris * 3);
    let lineIndicesMap = new Uint16Array(maxLines * 2);
    let uniformMap = new Uint8Array(maxMeshes * MeshUniform.ByteSizeAligned);
    function queueUpdateVertices(offset, data) {
        // TODO(@darzu): this is a strange way to compute this, but seems to work conservatively
        // const numVerts = Math.min(data.length / Vertex.ByteSize, Math.max(builder.numVerts, builder.poolHandle.numVerts))
        const numVerts = data.length / Vertex.ByteSize;
        const positions = new Float32Array(numVerts * 3);
        const colors = new Float32Array(numVerts * 3);
        const normals = new Float32Array(numVerts * 3);
        Vertex.Deserialize(data, numVerts, positions, colors, normals);
        const vNumOffset = offset / Vertex.ByteSize;
        // TODO(@darzu): debug logging
        // console.log(`positions: #${vNumOffset}: ${positions.slice(0, numVerts * 3).join(',')}`)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, vNumOffset * bytesPerVec3, positions);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, vNumOffset * bytesPerVec3, normals);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, vNumOffset * bytesPerVec3, colors);
    }
    function queueUpdateTriIndices(offset, data) {
        // TODO(@darzu): again, strange but a useful optimization
        // const numInd = Math.min(data.length / 2, Math.max(builder.numTris, builder.poolHandle.numTris) * 3)
        // TODO(@darzu): debug logging
        // console.log(`indices: #${offset / 2}: ${new Uint16Array(data.buffer).slice(0, numInd).join(',')}`)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
    }
    function queueUpdateLineIndices(offset, data) {
        // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
        // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
        // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
    }
    function queueUpdateUniform(offset, data) {
        uniformMap.set(data, offset);
    }
    const maps = {
        verticesMap,
        triIndicesMap,
        lineIndicesMap,
        uniformMap,
    };
    const queues = {
        queueUpdateTriIndices,
        queueUpdateLineIndices,
        queueUpdateVertices,
        queueUpdateUniform,
    };
    const buffers = {
        gl,
        positionsBuffer,
        normalsBuffer,
        colorsBuffer,
        // other buffers
        triIndicesBuffer,
        lineIndicesBuffer,
    };
    const builder = createMeshPoolBuilder(opts, maps, queues);
    const poolHandle = Object.assign(builder.poolHandle, buffers);
    const builder_webgl = {
        ...builder,
        poolHandle,
        gl,
        finish, // TODO(@darzu):
    };
    function finish() {
        queueUpdateVertices(0, maps.verticesMap);
        queueUpdateTriIndices(0, new Uint8Array(maps.triIndicesMap.buffer));
        queueUpdateLineIndices(0, new Uint8Array(maps.lineIndicesMap.buffer));
        builder.finish();
        return poolHandle;
    }
    return builder_webgl;
}
const scratch_uniform_u8 = new Uint8Array(MeshUniform.ByteSizeAligned);
function createMeshPoolBuilder(opts, maps, queues) {
    const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
    if (MAX_INDICES < maxVerts)
        throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;
    let isUnmapped = false;
    // log our estimated space usage stats
    console.log(`Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`);
    console.log(`   ${((maxVerts * Vertex.ByteSize) / 1024).toFixed(1)} KB for verts`);
    console.log(`   ${((maxTris * bytesPerTri) / 1024).toFixed(1)} KB for tri indices`);
    console.log(`   ${((maxLines * bytesPerLine) / 1024).toFixed(1)} KB for line indices`);
    console.log(`   ${((maxMeshes * MeshUniform.ByteSizeAligned) / 1024).toFixed(1)} KB for object uniform data`);
    const unusedBytesPerModel = MeshUniform.ByteSizeAligned - MeshUniform.ByteSizeExact;
    console.log(`   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${((unusedBytesPerModel * maxMeshes) /
        1024).toFixed(1)} KB total waste)`);
    const totalReservedBytes = maxVerts * Vertex.ByteSize +
        maxTris * bytesPerTri +
        maxLines * bytesPerLine +
        maxMeshes * MeshUniform.ByteSizeAligned;
    console.log(`Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(1)} KB`);
    const allMeshes = [];
    const pool = {
        opts,
        allMeshes,
        numTris: 0,
        numVerts: 0,
        numLines: 0,
        updateUniform: queueUpdateUniform,
        addMesh: queueAddMesh,
        addMeshInstance: queueInstanceMesh,
    };
    const { verticesMap, triIndicesMap, lineIndicesMap, uniformMap } = maps;
    const builder = {
        opts,
        verticesMap,
        triIndicesMap,
        lineIndicesMap,
        uniformMap,
        numTris: 0,
        numVerts: 0,
        numLines: 0,
        allMeshes,
        poolHandle: pool,
        addMesh: mappedAddMesh,
        addMeshInstance: mappedInstanceMesh,
        buildMesh: mappedMeshBuilder,
        updateUniform: mappedUpdateUniform,
        finish,
    };
    function mappedMeshBuilder() {
        const b = createMeshBuilder(maps, allMeshes.length * MeshUniform.ByteSizeAligned, builder.numVerts * Vertex.ByteSize, builder.numTris * bytesPerTri, builder.numLines * bytesPerLine, opts.shiftMeshIndices ? builder.numVerts : undefined);
        function finish() {
            const idx = {
                pool,
                vertNumOffset: builder.numVerts,
                triIndicesNumOffset: builder.numTris * 3,
                lineIndicesNumOffset: builder.numLines * 2,
                modelUniByteOffset: allMeshes.length * MeshUniform.ByteSizeAligned,
            };
            const m = b.finish(idx);
            builder.numVerts += m.numVerts;
            builder.numTris += m.numTris;
            builder.numLines += m.numLines;
            builder.allMeshes.push(m);
            return m;
        }
        return {
            ...b,
            finish,
        };
    }
    function mappedAddMesh(m) {
        var _a, _b;
        if (isUnmapped)
            throw `trying to use finished MeshPoolBuilder`;
        if (!m.usesProvoking)
            throw `mesh must use provoking vertices`;
        if (verticesMap === null)
            throw "Use preRender() and postRender() functions";
        if (builder.allMeshes.length + 1 > maxMeshes)
            throw "Too many meshes!";
        if (builder.numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!";
        if (builder.numTris + m.tri.length > maxTris)
            throw "Too many triangles!";
        if (builder.numLines + ((_b = (_a = m.lines) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > maxLines)
            throw "Too many lines!";
        // console.log(`QUEUE builder.allMeshes.length: ${builder.allMeshes.length}, builder.numTris: ${builder.numTris}, builder.numVerts: ${builder.numVerts}`)
        // console.log(`QUEUE pool.allMeshes.length: ${pool.allMeshes.length}, pool.numTris: ${pool.numTris}, pool.numVerts: ${pool.numVerts}`)
        const b = mappedMeshBuilder();
        const vertNumOffset = builder.numVerts;
        m.pos.forEach((pos, i) => {
            b.addVertex(pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0]);
        });
        m.tri.forEach((triInd, i) => {
            b.addTri(triInd);
            // set provoking vertex data
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
            // TODO(@darzu): mesh builder should set provoking vertex data
            const vOff = (vertNumOffset + triInd[0]) * Vertex.ByteSize;
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]]);
            Vertex.Serialize(verticesMap, vOff, m.pos[triInd[0]], m.colors[i], normal);
        });
        if (m.lines) {
            m.lines.forEach((inds, i) => {
                b.addLine(inds);
            });
        }
        const { min, max } = getAABBFromMesh(m);
        b.setUniform(mat4.create(), min, max, vec3.create());
        return b.finish();
    }
    function queueAddMesh(m) {
        var _a, _b, _c, _d;
        if (!isUnmapped)
            throw `trying to use unfinished MeshPool`;
        if (!m.usesProvoking)
            throw `mesh must use provoking vertices`;
        if (pool.allMeshes.length + 1 > maxMeshes)
            throw "Too many meshes!";
        if (pool.numVerts + m.pos.length > maxVerts)
            throw "Too many vertices!";
        if (pool.numTris + m.tri.length > maxTris)
            throw "Too many triangles!";
        if (pool.numLines + ((_b = (_a = m.lines) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > maxLines)
            throw "Too many lines!";
        // console.log(`QUEUE builder.allMeshes.length: ${builder.allMeshes.length}, builder.numTris: ${builder.numTris}, builder.numVerts: ${builder.numVerts}`)
        // console.log(`QUEUE pool.allMeshes.length: ${pool.allMeshes.length}, pool.numTris: ${pool.numTris}, pool.numVerts: ${pool.numVerts}`)
        const data = {
            // TODO(@darzu): use scratch arrays
            verticesMap: new Uint8Array(m.pos.length * Vertex.ByteSize),
            triIndicesMap: new Uint16Array(m.tri.length * 3),
            lineIndicesMap: new Uint16Array(((_d = (_c = m.lines) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 12) * 3),
            uniformMap: new Uint8Array(MeshUniform.ByteSizeAligned),
        };
        const b = createMeshBuilder(data, 0, 0, 0, 0, opts.shiftMeshIndices ? pool.numVerts : undefined);
        m.pos.forEach((pos, i) => {
            b.addVertex(pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0]);
        });
        m.tri.forEach((triInd, i) => {
            b.addTri(triInd);
            // set provoking vertex data
            // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
            // TODO(@darzu): de-duplicated with mappedAddMesh
            const vOff = triInd[0] * Vertex.ByteSize;
            const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]]);
            Vertex.Serialize(data.verticesMap, vOff, m.pos[triInd[0]], m.colors[i], normal);
        });
        if (m.lines) {
            m.lines.forEach((inds, i) => {
                b.addLine(inds);
            });
        }
        const { min, max } = getAABBFromMesh(m);
        b.setUniform(mat4.create(), min, max, vec3.create());
        const idx = {
            pool,
            vertNumOffset: pool.numVerts,
            triIndicesNumOffset: pool.numTris * 3,
            lineIndicesNumOffset: pool.numLines * 3,
            modelUniByteOffset: allMeshes.length * MeshUniform.ByteSizeAligned,
        };
        queues.queueUpdateTriIndices(idx.triIndicesNumOffset * 2, new Uint8Array(data.triIndicesMap.buffer)); // TODO(@darzu): this view shouldn't be necessary
        queues.queueUpdateLineIndices(idx.lineIndicesNumOffset * 2, new Uint8Array(data.lineIndicesMap.buffer)); // TODO(@darzu): this view shouldn't be necessary
        queues.queueUpdateUniform(idx.modelUniByteOffset, data.uniformMap);
        queues.queueUpdateVertices(idx.vertNumOffset * Vertex.ByteSize, data.verticesMap);
        const handle = b.finish(idx);
        pool.numTris += handle.numTris;
        pool.numLines += handle.numLines;
        pool.numVerts += handle.numVerts;
        pool.allMeshes.push(handle);
        return handle;
    }
    function mappedInstanceMesh(m, d) {
        // TODO(@darzu): implement
        if (builder.allMeshes.length + 1 > maxMeshes)
            throw "Too many meshes!";
        const uniOffset = allMeshes.length * MeshUniform.ByteSizeAligned;
        const newHandle = {
            ...m,
            ...d,
            modelUniByteOffset: uniOffset,
        };
        allMeshes.push(newHandle);
        mappedUpdateUniform(newHandle);
        return newHandle;
    }
    function queueInstanceMesh(m, d) {
        // TODO(@darzu): implement
        if (pool.allMeshes.length + 1 > maxMeshes)
            throw "Too many meshes!";
        const uniOffset = allMeshes.length * MeshUniform.ByteSizeAligned;
        const newHandle = {
            ...m,
            ...d,
            modelUniByteOffset: uniOffset,
        };
        allMeshes.push(newHandle);
        queueUpdateUniform(newHandle);
        return newHandle;
    }
    function finish() {
        if (isUnmapped)
            throw `trying to use finished MeshPoolBuilder`;
        isUnmapped = true;
        pool.numTris = builder.numTris;
        pool.numLines = builder.numLines;
        pool.numVerts = builder.numVerts;
        console.log(`Finishing pool with: ${builder.numTris} triangles, ${builder.numVerts} vertices, ${builder.numLines} lines`);
        return pool;
    }
    function queueUpdateUniform(m) {
        MeshUniform.Serialize(scratch_uniform_u8, 0, m.transform, m.aabbMin, m.aabbMax, m.tint);
        queues.queueUpdateUniform(m.modelUniByteOffset, scratch_uniform_u8);
    }
    function mappedUpdateUniform(m) {
        if (isUnmapped)
            throw "trying to use finished MeshBuilder";
        MeshUniform.Serialize(scratch_uniform_u8, 0, m.transform, m.aabbMin, m.aabbMax, m.tint);
        builder.uniformMap.set(scratch_uniform_u8, m.modelUniByteOffset);
    }
    return builder;
}
function createMeshBuilder(maps, uByteOff, vByteOff, iByteOff, lByteOff, indicesShift) {
    let meshFinished = false;
    let numVerts = 0;
    let numTris = 0;
    let numLines = 0;
    // TODO(@darzu): VERTEX FORMAT
    function addVertex(pos, color, normal) {
        if (meshFinished)
            throw "trying to use finished MeshBuilder";
        const vOff = vByteOff + numVerts * Vertex.ByteSize;
        Vertex.Serialize(maps.verticesMap, vOff, pos, color, normal);
        numVerts += 1;
    }
    let _scratchTri = vec3.create();
    function addTri(triInd) {
        if (meshFinished)
            throw "trying to use finished MeshBuilder";
        const currIByteOff = iByteOff + numTris * bytesPerTri;
        const currI = currIByteOff / 2;
        if (indicesShift) {
            _scratchTri[0] = triInd[0] + indicesShift;
            _scratchTri[1] = triInd[1] + indicesShift;
            _scratchTri[2] = triInd[2] + indicesShift;
        }
        maps.triIndicesMap.set(indicesShift ? _scratchTri : triInd, currI); // TODO(@darzu): it's kinda weird indices map uses uint16 vs the rest us u8
        numTris += 1;
    }
    let _scratchLine = vec2.create();
    function addLine(lineInd) {
        if (meshFinished)
            throw "trying to use finished MeshBuilder";
        const currLByteOff = lByteOff + numLines * bytesPerLine;
        const currL = currLByteOff / 2;
        if (indicesShift) {
            _scratchLine[0] = lineInd[0] + indicesShift;
            _scratchLine[1] = lineInd[1] + indicesShift;
        }
        maps.lineIndicesMap.set(indicesShift ? _scratchLine : lineInd, currL); // TODO(@darzu): it's kinda weird indices map uses uint16 vs the rest us u8
        numLines += 1;
    }
    let _transform = undefined;
    let _aabbMin = undefined;
    let _aabbMax = undefined;
    let _tint = undefined;
    function setUniform(transform, aabbMin, aabbMax, tint) {
        if (meshFinished)
            throw "trying to use finished MeshBuilder";
        _transform = transform;
        _aabbMin = aabbMin;
        _aabbMax = aabbMax;
        _tint = tint;
        MeshUniform.Serialize(maps.uniformMap, uByteOff, transform, aabbMin, aabbMax, tint);
    }
    function finish(idx) {
        if (meshFinished)
            throw "trying to use finished MeshBuilder";
        if (!_transform)
            throw "uniform never set for this mesh!";
        meshFinished = true;
        const res = {
            ...idx,
            transform: _transform,
            aabbMin: _aabbMin,
            aabbMax: _aabbMax,
            tint: _tint,
            numTris,
            numVerts,
            numLines,
            model: undefined,
        };
        return res;
    }
    return {
        addVertex,
        addTri,
        addLine,
        setUniform,
        finish,
    };
}
// utils
export function getAABBFromMesh(m) {
    return getAABBFromPositions(m.pos);
}
//# sourceMappingURL=mesh-pool.js.map