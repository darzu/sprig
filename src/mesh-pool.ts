import { computeTriangleNormal } from "./utils-3d.js";
import { mat4, vec2, vec3 } from "./gl-matrix.js";
import { align, sum } from "./math.js";
import { AABB, getAABBFromPositions } from "./phys_broadphase.js";

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
export module Vertex {
  export enum Kind {
    normal = 0,
    water = 1,
  }

  // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
  export const WebGPUFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: "float32x3" }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: "float32x3" }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: "float32x3" }, // normals
  ];

  const names = ["position", "color", "normal"];

  const formatToWgslType: Partial<Record<GPUVertexFormat, string>> = {
    float16x2: "vec2<f16>",
    float16x4: "vec2<f16>",
    float32: "f32",
    float32x2: "vec2<f32>",
    float32x3: "vec3<f32>",
    float32x4: "vec4<f32>",
    uint32: "u32",
    sint32: "i32",
  };

  export function GenerateWGSLVertexInputStruct(terminator: "," | ";"): string {
    // Example output:
    // `
    // [[location(0)]] position : vec3<f32>,
    // [[location(1)]] color : vec3<f32>,
    // [[location(2)]] normal : vec3<f32>,
    // [[location(3)]] kind : u32,
    // `

    let res = ``;

    if (WebGPUFormat.length !== names.length)
      throw `mismatch between vertex format specifiers and names`;

    for (let i = 0; i < WebGPUFormat.length; i++) {
      const f = WebGPUFormat[i];
      const t = formatToWgslType[f.format];
      const n = names[i];
      if (!t) throw `Unknown vertex type -> wgls type '${f.format}'`;
      res += `[[location(${f.shaderLocation})]] ${n} : ${t}${terminator}\n`;
    }

    return res;
  }

  // these help us pack and use vertices in that format
  export const ByteSize =
    bytesPerVec3 /*pos*/ + bytesPerVec3 /*color*/ + bytesPerVec3; /*normal*/

  // for performance reasons, we keep scratch buffers around
  const scratch_f32 = new Float32Array(3 + 3 + 3);
  const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
  const scratch_u32 = new Uint32Array(1);
  const scratch_u32_as_u8 = new Uint8Array(scratch_u32.buffer);
  export function Serialize(
    buffer: Uint8Array,
    byteOffset: number,
    pos: vec3,
    color: vec3,
    normal: vec3
  ) {
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

  // for WebGL: deserialize whole array?
  export function Deserialize(
    buffer: Uint8Array,
    vertexCount: number,
    positions: Float32Array,
    colors: Float32Array,
    normals: Float32Array
  ) {
    if (
      false ||
      buffer.length < vertexCount * ByteSize ||
      positions.length < vertexCount * 3 ||
      colors.length < vertexCount * 3 ||
      normals.length < vertexCount * 3
    )
      throw "buffer too short!";
    // TODO(@darzu): This only works because they have the same element size. Not sure what to do if that changes.
    const f32View = new Float32Array(buffer.buffer);
    const u32View = new Uint32Array(buffer.buffer);
    for (let i = 0; i < vertexCount; i++) {
      const u8_i = i * ByteSize;
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
}

export module MeshUniform {
  export interface Data {
    transform: mat4;
    aabbMin: vec3;
    aabbMax: vec3;
    tint: vec3;
  }

  const _counts = [
    align(4 * 4, 4), // transform
    align(3, 4), // aabb min
    align(3, 4), // aabb max
    align(3, 4), // tint
  ];
  const _names = ["transform", "aabbMin", "aabbMax", "tint"];
  const _types = ["mat4x4<f32>", "vec3<f32>", "vec3<f32>", "vec3<f32>"];

  const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);

  export const ByteSizeExact = sum(_counts) * bytesPerFloat;

  export const ByteSizeAligned = align(ByteSizeExact, 256); // uniform objects must be 256 byte aligned

  const scratch_f32 = new Float32Array(sum(_counts));
  const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
  export function Serialize(
    buffer: Uint8Array,
    byteOffset: number,
    transform: mat4,
    aabbMin: vec3,
    aabbMax: vec3,
    tint: vec3
  ): void {
    scratch_f32.set(transform, _offsets[0]);
    scratch_f32.set(aabbMin, _offsets[1]);
    scratch_f32.set(aabbMax, _offsets[2]);
    scratch_f32.set(tint, _offsets[3]);
    buffer.set(scratch_f32_as_u8, byteOffset);
  }

  export function GenerateWGSLUniformStruct() {
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

  export function CloneData(d: Data): Data {
    return {
      aabbMin: vec3.clone(d.aabbMin),
      aabbMax: vec3.clone(d.aabbMax),
      transform: mat4.clone(d.transform),
      tint: vec3.clone(d.tint),
    };
  }
}

export module SceneUniform {
  export interface Data {
    cameraViewProjMatrix: mat4;
    lightViewProjMatrix: mat4;
    lightDir: vec3;
    time: number /*f32*/;
    playerPos: [number, number];
    cameraPos: vec3;
  }

  const _counts = [
    4 * 4, // camera projection
    4 * 4, // light projection
    3, // light dir
    1, // time
    2, // playerPos
    3, // camera pos
  ];

  const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);

  // TODO(@darzu): SCENE FORMAT
  // defines the format of our scene's uniform data
  export const ByteSizeExact = sum(_counts) * bytesPerFloat;
  export const ByteSizeAligned = align(ByteSizeExact, 256); // uniform objects must be 256 byte aligned

  export function GenerateWGSLUniformStruct() {
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

  const scratch_f32 = new Float32Array(sum(_counts));
  const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
  export function Serialize(
    buffer: Uint8Array,
    byteOffset: number,
    data: Data
  ) {
    scratch_f32.set(data.cameraViewProjMatrix, _offsets[0]);
    scratch_f32.set(data.lightViewProjMatrix, _offsets[1]);
    scratch_f32.set(data.lightDir, _offsets[2]);
    scratch_f32[_offsets[3]] = data.time;
    scratch_f32.set(data.playerPos, _offsets[4]);
    scratch_f32.set(data.cameraPos, _offsets[5]);
    buffer.set(scratch_f32_as_u8, byteOffset);
  }
}

// to track offsets into those buffers so we can make modifications and form draw calls.
export interface PoolIndex {
  // handle into the pool
  pool: MeshPool;
  vertNumOffset: number;
  triIndicesNumOffset: number;
  modelUniByteOffset: number;
  lineIndicesNumOffset: number; // for wireframe
}
export interface MeshHandle extends PoolIndex, MeshUniform.Data {
  // this mesh
  numTris: number;
  numVerts: number;
  numLines: number; // for wireframe
  model?: Mesh;
}

export interface MeshPoolOpts {
  maxMeshes: number;
  maxTris: number;
  maxVerts: number;
  maxLines: number;
  shiftMeshIndices: boolean;
}
export interface MeshPoolMaps {
  // memory mapped buffers
  verticesMap: Uint8Array;
  triIndicesMap: Uint16Array;
  lineIndicesMap: Uint16Array;
  uniformMap: Uint8Array;
}
export interface MeshPoolQueues {
  // asynchronous updates to buffers
  queueUpdateVertices: (offset: number, data: Uint8Array) => void;
  queueUpdateTriIndices: (offset: number, data: Uint8Array) => void;
  queueUpdateLineIndices: (offset: number, data: Uint8Array) => void;
  queueUpdateUniform: (offset: number, data: Uint8Array) => void;
}
export interface MeshPoolBuilder {
  // options
  opts: MeshPoolOpts;
  // memory mapped buffers
  verticesMap: Uint8Array;
  triIndicesMap: Uint16Array;
  lineIndicesMap: Uint16Array;
  uniformMap: Uint8Array;
  numTris: number;
  numVerts: number;
  numLines: number;
  allMeshes: MeshHandle[];
  // handles
  poolHandle: MeshPool;
  // methods
  addMesh: (m: Mesh) => MeshHandle;
  addMeshInstance: (m: MeshHandle, d: MeshUniform.Data) => MeshHandle;
  buildMesh: () => MeshBuilder;
  updateUniform: (m: MeshHandle) => void;
  finish: () => MeshPool;
}
export interface MeshPool {
  // options
  opts: MeshPoolOpts;
  // data
  allMeshes: MeshHandle[];
  numTris: number;
  numVerts: number;
  numLines: number;
  // methods
  addMesh: (m: Mesh) => MeshHandle;
  addMeshInstance: (m: MeshHandle, d: MeshUniform.Data) => MeshHandle;
  updateUniform: (m: MeshHandle) => void;
}

// WebGPU stuff
export interface MeshPoolBuilder_WebGPU extends MeshPoolBuilder {
  device: GPUDevice;
  poolHandle: MeshPool_WebGPU;
  finish: () => MeshPool_WebGPU;
}
export interface MeshPoolBuffers_WebGPU {
  // buffers
  verticesBuffer: GPUBuffer;
  triIndicesBuffer: GPUBuffer;
  lineIndicesBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  // handles
  device: GPUDevice;
}
export type MeshPool_WebGPU = MeshPool & MeshPoolBuffers_WebGPU;

// WebGL stuff
export interface MeshPoolBuilder_WebGL extends MeshPoolBuilder {
  gl: WebGLRenderingContext;
  poolHandle: MeshPool_WebGL;
  finish: () => MeshPool_WebGL;
}
export interface MeshPoolBuffers_WebGL {
  // vertex buffers
  positionsBuffer: WebGLBuffer;
  normalsBuffer: WebGLBuffer;
  colorsBuffer: WebGLBuffer;
  // other buffers
  triIndicesBuffer: WebGLBuffer;
  lineIndicesBuffer: WebGLBuffer;
  // handles
  gl: WebGLRenderingContext;
}
export type MeshPool_WebGL = MeshPool & MeshPoolBuffers_WebGL;

export interface MeshBuilder {
  addVertex: (pos: vec3, color: vec3, normal: vec3) => void;
  addTri: (ind: vec3) => void;
  addLine: (ind: vec2) => void;
  setUniform: (
    transform: mat4,
    aabbMin: vec3,
    aabbMax: vec3,
    tint: vec3
  ) => void;
  finish: () => MeshHandle;
}
interface MeshBuilderInternal {
  addVertex: (pos: vec3, color: vec3, normal: vec3) => void;
  addTri: (ind: vec3) => void;
  addLine: (ind: vec2) => void;
  setUniform: (
    transform: mat4,
    aabbMin: vec3,
    aabbMax: vec3,
    tint: vec3
  ) => void;
  finish: (idx: PoolIndex) => MeshHandle;
}

// defines the geometry and coloring of a mesh
export interface Mesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
  lines?: vec2[];
  // format flags:
  usesProvoking?: boolean;
  verticesUnshared?: boolean; // TODO(@darzu): support
}

export function unshareVertices(input: Mesh): Mesh {
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  input.tri.forEach(([i0, i1, i2], i) => {
    pos.push(input.pos[i0]);
    pos.push(input.pos[i1]);
    pos.push(input.pos[i2]);
    tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
  });
  return { ...input, pos, tri, verticesUnshared: true };
}
export function unshareProvokingVertices(input: Mesh): Mesh {
  const pos: vec3[] = [...input.pos];
  const tri: vec3[] = [];
  const provoking: { [key: number]: boolean } = {};
  input.tri.forEach(([i0, i1, i2], triI) => {
    if (!provoking[i0]) {
      // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
      provoking[i0] = true;
      tri.push([i0, i1, i2]);
    } else if (!provoking[i1]) {
      // First vertex was taken, so let's see if we can rotate the indices to get an unused
      // provoking vertex.
      provoking[i1] = true;
      tri.push([i1, i2, i0]);
    } else if (!provoking[i2]) {
      // ditto
      provoking[i2] = true;
      tri.push([i2, i0, i1]);
    } else {
      // All vertices are taken, so create a new one
      const i3 = pos.length;
      pos.push(input.pos[i0]);
      provoking[i3] = true;
      tri.push([i3, i1, i2]);
    }
  });
  return { ...input, pos, tri, usesProvoking: true };
}

export function createMeshPoolBuilder_WebGPU(
  device: GPUDevice,
  opts: MeshPoolOpts
): MeshPoolBuilder_WebGPU {
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

  function queueUpdateBuffer(
    buffer: GPUBuffer,
    offset: number,
    data: Uint8Array
  ) {
    device.queue.writeBuffer(buffer, offset, data);
  }

  const maps: MeshPoolMaps = {
    verticesMap,
    triIndicesMap,
    lineIndicesMap,
    uniformMap,
  };
  const queues: MeshPoolQueues = {
    queueUpdateTriIndices: (offset: number, data: Uint8Array) =>
      queueUpdateBuffer(triIndicesBuffer, offset, data),
    queueUpdateLineIndices: (offset: number, data: Uint8Array) =>
      queueUpdateBuffer(lineIndicesBuffer, offset, data),
    queueUpdateVertices: (offset: number, data: Uint8Array) =>
      queueUpdateBuffer(verticesBuffer, offset, data),
    queueUpdateUniform: (offset: number, data: Uint8Array) =>
      queueUpdateBuffer(uniformBuffer, offset, data),
  };

  const buffers: MeshPoolBuffers_WebGPU = {
    device,
    verticesBuffer,
    triIndicesBuffer,
    lineIndicesBuffer,
    uniformBuffer,
  };

  const builder = createMeshPoolBuilder(opts, maps, queues);

  const poolHandle: MeshPool_WebGPU = Object.assign(
    builder.poolHandle,
    buffers
  );

  const builder_webgpu: MeshPoolBuilder_WebGPU = {
    ...builder,
    poolHandle,
    device,
    finish, // TODO(@darzu):
  };

  function finish(): MeshPool_WebGPU {
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

export function createMeshPoolBuilder_WebGL(
  gl: WebGLRenderingContext,
  opts: MeshPoolOpts
): MeshPoolBuilder_WebGL {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

  // TODO(@darzu): we shouldn't need to preallocate all this
  const scratchPositions = new Float32Array(maxVerts * 3);
  const scratchNormals = new Float32Array(maxVerts * 3);
  const scratchColors = new Float32Array(maxVerts * 3);

  const scratchTriIndices = new Uint16Array(maxTris * 3);
  const scratchLineIndices = new Uint16Array(maxLines * 2);

  // vertex buffers
  const positionsBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, scratchPositions, gl.DYNAMIC_DRAW); // TODO(@darzu): sometimes we might want STATIC_DRAW
  const normalsBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, scratchNormals, gl.DYNAMIC_DRAW);
  const colorsBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, scratchColors, gl.DYNAMIC_DRAW);

  // index buffers
  const triIndicesBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchTriIndices, gl.DYNAMIC_DRAW);
  const lineIndicesBuffer = gl.createBuffer()!;
  // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
  // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
  // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchLineIndices, gl.DYNAMIC_DRAW);

  // our in-memory reflections of the buffers used during the initial build phase
  // TODO(@darzu): this is too much duplicate data
  let verticesMap = new Uint8Array(maxVerts * Vertex.ByteSize);
  let triIndicesMap = new Uint16Array(maxTris * 3);
  let lineIndicesMap = new Uint16Array(maxLines * 2);
  let uniformMap = new Uint8Array(maxMeshes * MeshUniform.ByteSizeAligned);

  function queueUpdateVertices(offset: number, data: Uint8Array) {
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
  function queueUpdateTriIndices(offset: number, data: Uint8Array) {
    // TODO(@darzu): again, strange but a useful optimization
    // const numInd = Math.min(data.length / 2, Math.max(builder.numTris, builder.poolHandle.numTris) * 3)
    // TODO(@darzu): debug logging
    // console.log(`indices: #${offset / 2}: ${new Uint16Array(data.buffer).slice(0, numInd).join(',')}`)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
  }
  function queueUpdateLineIndices(offset: number, data: Uint8Array) {
    // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
    // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
  }
  function queueUpdateUniform(offset: number, data: Uint8Array) {
    uniformMap.set(data, offset);
  }

  const maps: MeshPoolMaps = {
    verticesMap,
    triIndicesMap,
    lineIndicesMap,
    uniformMap,
  };
  const queues: MeshPoolQueues = {
    queueUpdateTriIndices,
    queueUpdateLineIndices,
    queueUpdateVertices,
    queueUpdateUniform,
  };

  const buffers: MeshPoolBuffers_WebGL = {
    gl,
    positionsBuffer,
    normalsBuffer,
    colorsBuffer,
    // other buffers
    triIndicesBuffer,
    lineIndicesBuffer,
  };

  const builder = createMeshPoolBuilder(opts, maps, queues);

  const poolHandle: MeshPool_WebGL = Object.assign(builder.poolHandle, buffers);

  const builder_webgl: MeshPoolBuilder_WebGL = {
    ...builder,
    poolHandle,
    gl,
    finish, // TODO(@darzu):
  };

  function finish(): MeshPool_WebGL {
    queueUpdateVertices(0, maps.verticesMap);
    queueUpdateTriIndices(0, new Uint8Array(maps.triIndicesMap.buffer));
    queueUpdateLineIndices(0, new Uint8Array(maps.lineIndicesMap.buffer));

    builder.finish();

    return poolHandle;
  }

  return builder_webgl;
}

const scratch_uniform_u8 = new Uint8Array(MeshUniform.ByteSizeAligned);

function createMeshPoolBuilder(
  opts: MeshPoolOpts,
  maps: MeshPoolMaps,
  queues: MeshPoolQueues
): MeshPoolBuilder {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

  if (MAX_INDICES < maxVerts)
    throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

  let isUnmapped = false;

  // log our estimated space usage stats
  console.log(
    `Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`
  );
  console.log(
    `   ${((maxVerts * Vertex.ByteSize) / 1024).toFixed(1)} KB for verts`
  );
  console.log(
    `   ${((maxTris * bytesPerTri) / 1024).toFixed(1)} KB for tri indices`
  );
  console.log(
    `   ${((maxLines * bytesPerLine) / 1024).toFixed(1)} KB for line indices`
  );
  console.log(
    `   ${((maxMeshes * MeshUniform.ByteSizeAligned) / 1024).toFixed(
      1
    )} KB for object uniform data`
  );
  const unusedBytesPerModel =
    MeshUniform.ByteSizeAligned - MeshUniform.ByteSizeExact;
  console.log(
    `   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(
      (unusedBytesPerModel * maxMeshes) /
      1024
    ).toFixed(1)} KB total waste)`
  );
  const totalReservedBytes =
    maxVerts * Vertex.ByteSize +
    maxTris * bytesPerTri +
    maxLines * bytesPerLine +
    maxMeshes * MeshUniform.ByteSizeAligned;
  console.log(
    `Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(
      1
    )} KB`
  );

  const allMeshes: MeshHandle[] = [];

  const pool: MeshPool = {
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

  const builder: MeshPoolBuilder = {
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

  function mappedMeshBuilder(): MeshBuilder {
    const b = createMeshBuilder(
      maps,
      allMeshes.length * MeshUniform.ByteSizeAligned,
      builder.numVerts * Vertex.ByteSize,
      builder.numTris * bytesPerTri,
      builder.numLines * bytesPerLine,
      opts.shiftMeshIndices ? builder.numVerts : undefined
    );

    function finish() {
      const idx: PoolIndex = {
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

  function mappedAddMesh(m: Mesh): MeshHandle {
    if (isUnmapped) throw `trying to use finished MeshPoolBuilder`;
    if (!m.usesProvoking) throw `mesh must use provoking vertices`;
    if (verticesMap === null)
      throw "Use preRender() and postRender() functions";
    if (builder.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";
    if (builder.numVerts + m.pos.length > maxVerts) throw "Too many vertices!";
    if (builder.numTris + m.tri.length > maxTris) throw "Too many triangles!";
    if (builder.numLines + (m.lines?.length ?? 0) > maxLines)
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
      const normal = computeTriangleNormal(
        m.pos[triInd[0]],
        m.pos[triInd[1]],
        m.pos[triInd[2]]
      );
      Vertex.Serialize(
        verticesMap,
        vOff,
        m.pos[triInd[0]],
        m.colors[i],
        normal
      );
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
  function queueAddMesh(m: Mesh): MeshHandle {
    if (!isUnmapped) throw `trying to use unfinished MeshPool`;
    if (!m.usesProvoking) throw `mesh must use provoking vertices`;
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";
    if (pool.numVerts + m.pos.length > maxVerts) throw "Too many vertices!";
    if (pool.numTris + m.tri.length > maxTris) throw "Too many triangles!";
    if (pool.numLines + (m.lines?.length ?? 0) > maxLines)
      throw "Too many lines!";

    // console.log(`QUEUE builder.allMeshes.length: ${builder.allMeshes.length}, builder.numTris: ${builder.numTris}, builder.numVerts: ${builder.numVerts}`)
    // console.log(`QUEUE pool.allMeshes.length: ${pool.allMeshes.length}, pool.numTris: ${pool.numTris}, pool.numVerts: ${pool.numVerts}`)

    const data: MeshPoolMaps = {
      // TODO(@darzu): use scratch arrays
      verticesMap: new Uint8Array(m.pos.length * Vertex.ByteSize),
      triIndicesMap: new Uint16Array(m.tri.length * 3),
      lineIndicesMap: new Uint16Array((m.lines?.length ?? 12) * 3), // TODO(@darzu): make optional?
      uniformMap: new Uint8Array(MeshUniform.ByteSizeAligned),
    };

    const b = createMeshBuilder(
      data,
      0,
      0,
      0,
      0,
      opts.shiftMeshIndices ? pool.numVerts : undefined
    );

    m.pos.forEach((pos, i) => {
      b.addVertex(pos, [0.5, 0.5, 0.5], [1.0, 0.0, 0.0]);
    });
    m.tri.forEach((triInd, i) => {
      b.addTri(triInd);

      // set provoking vertex data
      // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
      // TODO(@darzu): de-duplicated with mappedAddMesh
      const vOff = triInd[0] * Vertex.ByteSize;
      const normal = computeTriangleNormal(
        m.pos[triInd[0]],
        m.pos[triInd[1]],
        m.pos[triInd[2]]
      );
      Vertex.Serialize(
        data.verticesMap,
        vOff,
        m.pos[triInd[0]],
        m.colors[i],
        normal
      );
    });
    if (m.lines) {
      m.lines.forEach((inds, i) => {
        b.addLine(inds);
      });
    }

    const { min, max } = getAABBFromMesh(m);

    b.setUniform(mat4.create(), min, max, vec3.create());

    const idx: PoolIndex = {
      pool,
      vertNumOffset: pool.numVerts,
      triIndicesNumOffset: pool.numTris * 3,
      lineIndicesNumOffset: pool.numLines * 3,
      modelUniByteOffset: allMeshes.length * MeshUniform.ByteSizeAligned,
    };

    queues.queueUpdateTriIndices(
      idx.triIndicesNumOffset * 2,
      new Uint8Array(data.triIndicesMap.buffer)
    ); // TODO(@darzu): this view shouldn't be necessary
    queues.queueUpdateLineIndices(
      idx.lineIndicesNumOffset * 2,
      new Uint8Array(data.lineIndicesMap.buffer)
    ); // TODO(@darzu): this view shouldn't be necessary
    queues.queueUpdateUniform(idx.modelUniByteOffset, data.uniformMap);
    queues.queueUpdateVertices(
      idx.vertNumOffset * Vertex.ByteSize,
      data.verticesMap
    );

    const handle = b.finish(idx);

    pool.numTris += handle.numTris;
    pool.numLines += handle.numLines;
    pool.numVerts += handle.numVerts;
    pool.allMeshes.push(handle);

    return handle;
  }
  function mappedInstanceMesh(m: MeshHandle, d: MeshUniform.Data): MeshHandle {
    // TODO(@darzu): implement
    if (builder.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

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
  function queueInstanceMesh(m: MeshHandle, d: MeshUniform.Data): MeshHandle {
    // TODO(@darzu): implement
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

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

  function finish(): MeshPool {
    if (isUnmapped) throw `trying to use finished MeshPoolBuilder`;
    isUnmapped = true;

    pool.numTris = builder.numTris;
    pool.numLines = builder.numLines;
    pool.numVerts = builder.numVerts;

    console.log(
      `Finishing pool with: ${builder.numTris} triangles, ${builder.numVerts} vertices, ${builder.numLines} lines`
    );

    return pool;
  }

  function queueUpdateUniform(m: MeshHandle): void {
    MeshUniform.Serialize(
      scratch_uniform_u8,
      0,
      m.transform,
      m.aabbMin,
      m.aabbMax,
      m.tint
    );
    queues.queueUpdateUniform(m.modelUniByteOffset, scratch_uniform_u8);
  }
  function mappedUpdateUniform(m: MeshHandle): void {
    if (isUnmapped) throw "trying to use finished MeshBuilder";
    MeshUniform.Serialize(
      scratch_uniform_u8,
      0,
      m.transform,
      m.aabbMin,
      m.aabbMax,
      m.tint
    );
    builder.uniformMap.set(scratch_uniform_u8, m.modelUniByteOffset);
  }

  return builder;
}

function createMeshBuilder(
  maps: MeshPoolMaps,
  uByteOff: number,
  vByteOff: number,
  iByteOff: number,
  lByteOff: number,
  indicesShift: number | undefined
): MeshBuilderInternal {
  let meshFinished = false;
  let numVerts = 0;
  let numTris = 0;
  let numLines = 0;

  // TODO(@darzu): VERTEX FORMAT
  function addVertex(pos: vec3, color: vec3, normal: vec3): void {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    const vOff = vByteOff + numVerts * Vertex.ByteSize;
    Vertex.Serialize(maps.verticesMap, vOff, pos, color, normal);
    numVerts += 1;
  }
  let _scratchTri = vec3.create();
  function addTri(triInd: vec3): void {
    if (meshFinished) throw "trying to use finished MeshBuilder";
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
  function addLine(lineInd: vec2): void {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    const currLByteOff = lByteOff + numLines * bytesPerLine;
    const currL = currLByteOff / 2;
    if (indicesShift) {
      _scratchLine[0] = lineInd[0] + indicesShift;
      _scratchLine[1] = lineInd[1] + indicesShift;
    }
    maps.lineIndicesMap.set(indicesShift ? _scratchLine : lineInd, currL); // TODO(@darzu): it's kinda weird indices map uses uint16 vs the rest us u8
    numLines += 1;
  }

  let _transform: mat4 | undefined = undefined;
  let _aabbMin: vec3 | undefined = undefined;
  let _aabbMax: vec3 | undefined = undefined;
  let _tint: vec3 | undefined = undefined;
  function setUniform(
    transform: mat4,
    aabbMin: vec3,
    aabbMax: vec3,
    tint: vec3
  ): void {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    _transform = transform;
    _aabbMin = aabbMin;
    _aabbMax = aabbMax;
    _tint = tint;
    MeshUniform.Serialize(
      maps.uniformMap,
      uByteOff,
      transform,
      aabbMin,
      aabbMax,
      tint
    );
  }

  function finish(idx: PoolIndex): MeshHandle {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    if (!_transform) throw "uniform never set for this mesh!";
    meshFinished = true;
    const res: MeshHandle = {
      ...idx,
      transform: _transform!,
      aabbMin: _aabbMin!,
      aabbMax: _aabbMax!,
      tint: _tint!,
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

export function getAABBFromMesh(m: Mesh): AABB {
  return getAABBFromPositions(m.pos);
}
