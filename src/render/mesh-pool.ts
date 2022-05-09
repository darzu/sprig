import { centroid, computeTriangleNormal, vec3Mid } from "../utils-3d.js";
import { mat4, vec2, vec3 } from "../gl-matrix.js";
import { align, sum } from "../math.js";
import { AABB, getAABBFromPositions } from "../physics/broadphase.js";
import { EM } from "../entity-manager.js";
import { assert } from "../test.js";
import { MeshUniformStruct, MeshUniformTS } from "./shader_obj.js";
import { createCyMany, createCyStruct } from "./data.js";

// TODO(@darzu): abstraction refinement:
//  [ ] how do we handle multiple shaders with different mesh
//    uniforms? e.g. water, noodles, cloth, regular objects, grass

// TODO(@darzu): alignment is needs to be handled right esp for structs
//    shared between vertex and uniform/storage
// https://www.w3.org/TR/WGSL/#structure-member-layout
// https://www.w3.org/TR/WGSL/#input-output-locations
// https://gpuweb.github.io/gpuweb/#vertex-formats
//    "descriptor.arrayStride is a multiple of 4."
//    "attrib.offset + sizeof(attrib.format) ≤ descriptor.arrayStride."
//    "attrib.offset is a multiple of the minimum of 4 and sizeof(attrib.format)."
// UNORM: float between [0,1],
// SNORM: float between [-1,1],

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

const DEFAULT_VERT_COLOR: vec3 = [0.0, 0.0, 0.0];

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

function generateWGSLStruct(
  vertAttributes: GPUVertexAttribute[],
  names: string[]
): string {
  // Example output:
  // `
  // @location(0) position : vec3<f32>,
  // @location(1) color : vec3<f32>,
  // @location(2) normal : vec3<f32>,
  // @location(3) uv : vec2<f32>,
  // `

  let res = ``;

  if (vertAttributes.length !== names.length)
    throw `mismatch between vertex format specifiers and names`;

  for (let i = 0; i < vertAttributes.length; i++) {
    const f = vertAttributes[i];
    const t = formatToWgslType[f.format];
    const n = names[i];
    if (!t) throw `Unknown vertex type -> wgls type '${f.format}'`;
    res += `@location(${f.shaderLocation}) ${n} : ${t},\n`;
  }

  return res;
}

// TODO(@darzu):
export const VertexStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    uv: "vec2<f32>",
  },
  {
    isCompact: true,
    serializer: ({ position, color, normal, uv }, offsets, views) => {
      views.f32[0] = position[0];
      views.f32[1] = position[1];
      views.f32[2] = position[2];
      views.f32[3] = color[0];
      views.f32[4] = color[1];
      views.f32[5] = color[2];
      views.f32[6] = normal[0];
      views.f32[7] = normal[1];
      views.f32[8] = normal[2];
      views.f32[9] = uv[0];
      views.f32[10] = uv[1];
    },
  }
);

// Everything to do with our vertex format must be in this module (minus downstream
//  places that should get type errors when this module changes.)
// TODO(@darzu): code gen some of this so code changes are less error prone.
export module Vertex {
  // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
  export const WebGPUFormat: GPUVertexAttribute[] = [
    { shaderLocation: 0, offset: bytesPerVec3 * 0, format: "float32x3" }, // position
    { shaderLocation: 1, offset: bytesPerVec3 * 1, format: "float32x3" }, // color
    { shaderLocation: 2, offset: bytesPerVec3 * 2, format: "float32x3" }, // normals
    // TODO(@darzu): DISP
    { shaderLocation: 3, offset: bytesPerVec3 * 3, format: "float32x2" }, // uv
  ];

  const names = ["position", "color", "normal", "uv"];

  export function GenerateWGSLVertexInputStruct(): string {
    // Example output:
    // `
    // @location(0) position : vec3<f32>,
    // @location(1) color : vec3<f32>,
    // @location(2) normal : vec3<f32>,
    // @location(3) uv : vec2<f32>,
    // `

    return generateWGSLStruct(WebGPUFormat, names);
  }

  // these help us pack and use vertices in that format
  export const ByteSize =
    bytesPerVec3 /*pos*/ +
    bytesPerVec3 /*color*/ +
    bytesPerVec3 /*normal*/ +
    bytesPerVec2; /*uv*/

  // for performance reasons, we keep scratch buffers around
  const scratch_f32 = new Float32Array(
    ByteSize / Float32Array.BYTES_PER_ELEMENT
  );
  const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
  const scratch_u32 = new Uint32Array(1);
  const scratch_u32_as_u8 = new Uint8Array(scratch_u32.buffer);
  export function serialize(
    buffer: Uint8Array,
    byteOffset: number,
    pos: vec3,
    color: vec3,
    normal: vec3,
    uv: vec2
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
    scratch_f32[9] = uv[0];
    scratch_f32[10] = uv[1];
    // TODO(@darzu):
    // if (uv[0] > 0 || uv[1] > 0) console.log(uv);
    buffer.set(scratch_f32_as_u8, byteOffset);
  }

  // for WebGL: deserialize whole array?
  export function Deserialize(
    buffer: Uint8Array,
    vertexCount: number,
    positions: Float32Array,
    colors: Float32Array,
    normals: Float32Array,
    uv: Float32Array
  ) {
    if (
      false ||
      buffer.length < vertexCount * ByteSize ||
      positions.length < vertexCount * 3 ||
      colors.length < vertexCount * 3 ||
      normals.length < vertexCount * 3 ||
      uv.length < vertexCount * 2
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
      // TODO(@darzu): DISP
      normals[i * 2 + 0] = f32View[f32_i + 9];
      normals[i * 2 + 1] = f32View[f32_i + 10];
    }
  }
}

export module RopeStick {
  export interface Data {
    aIdx: number;
    bIdx: number;
    length: number;
  }

  const _byteCounts = [1 * 4, 1 * 4, 1 * 4];

  const _byteOffsets = _byteCounts.reduce(
    (p, n) => [...p, p[p.length - 1] + n],
    [0]
  );

  // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
  // const prevOffset = bytesPerVec3 * 1 + 4;
  export const WebGPUFormat: GPUVertexAttribute[] = [
    {
      shaderLocation: 4,
      offset: 0,
      format: "uint32",
    },
    {
      shaderLocation: 5,
      offset: 4,
      format: "uint32",
    },
    {
      shaderLocation: 6,
      offset: 8,
      format: "float32",
    },
  ];

  export const names = ["aIdx", "bIdx", "length"];

  // TODO(@darzu): SCENE FORMAT
  // defines the format of our scene's uniform data
  const ByteSizeExact = sum(_byteCounts);
  // vertex objs should probably be 16 byte aligned
  // TODO(@darzu): alignment https://www.w3.org/TR/WGSL/#alignment-and-size
  // export const ByteSizeAligned = align(ByteSizeExact, 12);
  export const ByteSizeAligned = ByteSizeExact;

  export function generateWGSLUniformStruct() {
    // console.log(generateWGSLStruct(WebGPUFormat, names));
    return `
    @align(4) aIdx : u32,
    @align(4) bIdx : u32,
    @align(4) length : f32,
    `;
    // return generateWGSLStruct(WebGPUFormat, names);
  }

  const scratch_u8 = new Uint8Array(sum(_byteCounts));
  const scratch_as_f32 = new Float32Array(scratch_u8.buffer);
  const scratch_as_u32 = new Uint32Array(scratch_u8.buffer);
  export function serialize(
    buffer: Uint8Array,
    byteOffset: number,
    data: Data
  ) {
    scratch_as_u32[_byteOffsets[0] / 4] = data.aIdx;
    scratch_as_u32[_byteOffsets[1] / 4] = data.bIdx;
    scratch_as_f32[_byteOffsets[2] / 4] = data.length;
    // scratch_f32.set(data.lightViewProjMatrix, _offsets[1]);
    buffer.set(scratch_u8, byteOffset);
  }
}

// TODO(@darzu): WORK IN PROGRESS. Unclear this is how we want to do different shader uniforms
// TODO(@darzu): WIP interfaces for shaders
export interface GPUData<D> {
  byteSizeExact: number;
  byteSizeAligned: number;
  generateWGSLUniformStruct(): string;
  serialize(buffer: Uint8Array, byteOffset: number, data: D): void;
}

export interface ShaderDescription {
  // TODO(@darzu):
  uniformByteSizeAligned: number;
  uniformByteSizeExact: number;
}

// export const OBJ_SHADER: ShaderDescription = {
//   // TODO(@darzu):
//   uniformByteSizeAligned: MeshUniform.ByteSizeAligned,
//   uniformByteSizeExact: MeshUniform.ByteSizeExact,
// };

// to track offsets into those buffers so we can make modifications and form draw calls.
export interface PoolIndex {
  // handle into the pool
  readonly pool: MeshPool;
  readonly vertNumOffset: number;
  readonly triIndicesNumOffset: number;
  readonly modelUniByteOffset: number;
  readonly lineIndicesNumOffset: number; // for wireframe
}
export interface MeshHandle extends PoolIndex {
  readonly mId: number; // mesh id
  // this mesh
  readonly numTris: number;
  readonly numVerts: number;
  readonly numLines: number; // for wireframe
  readonly readonlyMesh?: Mesh;

  // used as the uniform for this mesh
  shaderData: MeshUniformTS;
  // TODO(@darzu): specify which shader to use
}

export function isMeshHandle(m: any): m is MeshHandle {
  return "mId" in m;
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
  updateVertices: (offset: number, data: Uint8Array) => void;
  updateTriIndices: (offset: number, data: Uint8Array) => void;
  updateLineIndices: (offset: number, data: Uint8Array) => void;
  updateUniform: (offset: number, data: Uint8Array) => void;
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
  // TODO(@darzu): instead of addMesh, mesh pools need a way to add
  //    vertices and triangles with custom formats. The addMesh impl
  //    below has hard-coded assumptions about vertex size.
  addMesh: (m: Mesh) => MeshHandle;
  addMeshInstance: (m: MeshHandle, d: MeshUniformTS) => MeshHandle;
  updateUniform: (m: MeshHandle) => void;
  updateMeshVertices: (handle: MeshHandle, newMeshData: Mesh) => void;
}

// WebGPU stuff
// TODO(@darzu): use CyMany here
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
  addVertex: (pos: vec3, color: vec3, normal: vec3, uv: vec2) => void;
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
  addVertex: (pos: vec3, color: vec3, normal: vec3, uv: vec2) => void;
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
  uvs?: vec2[];
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
export function unshareProvokingVerticesWithMap(input: Mesh): {
  mesh: Mesh;
  posMap: Map<number, number>;
} {
  const pos: vec3[] = [...input.pos];
  const uvs: vec2[] | undefined = input.uvs ? [...input.uvs] : undefined;
  const tri: vec3[] = [];
  const provoking: { [key: number]: boolean } = {};
  const posMap: Map<number, number> = new Map();
  pos.forEach((_, i) => posMap.set(i, i));
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
      posMap.set(i3, i0);
      if (uvs) uvs.push(input.uvs![i0]);
      provoking[i3] = true;
      tri.push([i3, i1, i2]);
    }
  });
  const mesh: Mesh = { ...input, pos, uvs, tri, usesProvoking: true };

  return { mesh, posMap };
}
export function unshareProvokingVertices(input: Mesh): Mesh {
  const { mesh, posMap } = unshareProvokingVerticesWithMap(input);
  return mesh;
}

export function createMeshPool_WebGPU(
  device: GPUDevice,
  opts: MeshPoolOpts
): MeshPool_WebGPU {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
  // console.log(`maxMeshes: ${maxMeshes}, maxTris: ${maxTris}, maxVerts: ${maxVerts}`)

  // create our mesh buffers (vertex, index, uniform)
  const verticesBuffer = device.createBuffer({
    size: maxVerts * Vertex.ByteSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    // NOTE(@darzu): with WebGPU we have the option to modify the full buffers in memory before
    //  handing them over to the GPU. This could be good for large initial sets of data, instead of
    //  sending that over later via the queues. See commit 4862a7c and it's successors. Pre those
    //  commits, we had a way to add mesh data to either via initial memory maps or queues. The
    //  memory mapped way was removed to simplify the abstractions since we weren't noticing speed
    //  benefits at the time.
    mappedAtCreation: false,
  });
  const triIndicesBuffer = device.createBuffer({
    size: maxTris * bytesPerTri,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
  });
  // TODO(@darzu): make creating this buffer optional on whether we're using line indices or not
  const lineIndicesBuffer = device.createBuffer({
    size: maxLines * bytesPerLine,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
  });
  const uniformBuffer = createCyMany(
    device,
    MeshUniformStruct,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    maxMeshes
  );

  function updateBuf(buffer: GPUBuffer, offset: number, data: Uint8Array) {
    device.queue.writeBuffer(buffer, offset, data);
  }

  const queues: MeshPoolQueues = {
    updateTriIndices: (offset, data) =>
      updateBuf(triIndicesBuffer, offset, data),
    updateLineIndices: (offset, data) =>
      updateBuf(lineIndicesBuffer, offset, data),
    updateVertices: (offset, data) => updateBuf(verticesBuffer, offset, data),
    updateUniform: (offset, data) =>
      updateBuf(uniformBuffer.buffer, offset, data),
  };

  const buffers: MeshPoolBuffers_WebGPU = {
    device,
    verticesBuffer,
    triIndicesBuffer,
    lineIndicesBuffer,
    uniformBuffer: uniformBuffer.buffer,
  };

  const pool = createMeshPool(opts, queues);

  const pool_webgpu: MeshPool_WebGPU = { ...pool, ...buffers };

  return pool_webgpu;
}

export function createMeshPool_WebGL(
  gl: WebGLRenderingContext,
  opts: MeshPoolOpts
): MeshPool_WebGL {
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
  // let verticesMap = new Uint8Array(maxVerts * Vertex.ByteSize);
  // let triIndicesMap = new Uint16Array(maxTris * 3);
  // let lineIndicesMap = new Uint16Array(maxLines * 2);
  let uniformMap = new Uint8Array(maxMeshes * MeshUniformStruct.size);

  function updateVertices(offset: number, data: Uint8Array) {
    // TODO(@darzu): this is a strange way to compute this, but seems to work conservatively
    // const numVerts = Math.min(data.length / Vertex.ByteSize, Math.max(builder.numVerts, builder.poolHandle.numVerts))
    const numVerts = data.length / Vertex.ByteSize;
    const positions = new Float32Array(numVerts * 3);
    const colors = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);
    // TODO(@darzu): DISP
    const uvs = new Float32Array(numVerts * 2);
    Vertex.Deserialize(data, numVerts, positions, colors, normals, uvs);

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
  function updateTriIndices(offset: number, data: Uint8Array) {
    // TODO(@darzu): again, strange but a useful optimization
    // const numInd = Math.min(data.length / 2, Math.max(builder.numTris, builder.poolHandle.numTris) * 3)
    // TODO(@darzu): debug logging
    // console.log(`indices: #${offset / 2}: ${new Uint16Array(data.buffer).slice(0, numInd).join(',')}`)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
  }
  function updateLineIndices(offset: number, data: Uint8Array) {
    // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
    // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
    // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
  }
  function updateUniform(offset: number, data: Uint8Array) {
    uniformMap.set(data, offset);
  }

  const queues: MeshPoolQueues = {
    updateTriIndices,
    updateLineIndices,
    updateVertices,
    updateUniform,
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

  const pool = createMeshPool(opts, queues);

  const pool_webgl: MeshPool_WebGL = { ...pool, ...buffers };

  return pool_webgl;
}

const scratch_uniform_u8 = new Uint8Array(MeshUniformStruct.size);

function createMeshPool(opts: MeshPoolOpts, queues: MeshPoolQueues): MeshPool {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

  if (MAX_INDICES < maxVerts)
    throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

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
    `   ${((maxMeshes * MeshUniformStruct.size) / 1024).toFixed(
      1
    )} KB for object uniform data`
  );
  const unusedBytesPerModel =
    MeshUniformStruct.size - MeshUniformStruct.compactSize;
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
    maxMeshes * MeshUniformStruct.size;
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
    updateUniform,
    addMesh,
    addMeshInstance,
    updateMeshVertices,
  };

  function addMesh(m: Mesh): MeshHandle {
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
      // pad triangles array to make sure it's a multiple of 4 *bytes*
      triIndicesMap: new Uint16Array(align(m.tri.length * 3, 2)),
      lineIndicesMap: new Uint16Array((m.lines?.length ?? 2) * 2), // TODO(@darzu): make optional?
      uniformMap: new Uint8Array(MeshUniformStruct.size),
    };

    const b = createMeshBuilder(
      data,
      opts.shiftMeshIndices ? pool.numVerts : 0,
      m
    );
    m.pos.forEach((pos, i) => {
      // this is placeholder vert data which will be updated later by serializeMeshVertices
      // TODO(@darzu): DISP calculation
      b.addVertex(pos, DEFAULT_VERT_COLOR, [1.0, 0.0, 0.0], [0.0, 0.0]);
    });
    m.tri.forEach((triInd, i) => {
      b.addTri(triInd);
    });
    if (m.lines) {
      m.lines.forEach((inds, i) => {
        b.addLine(inds);
      });
    }

    // initial uniform data
    const { min, max } = getAABBFromMesh(m);
    b.setUniform(mat4.create(), min, max, vec3.create());

    const idx: PoolIndex = {
      pool,
      vertNumOffset: pool.numVerts,
      triIndicesNumOffset: pool.numTris * 3,
      lineIndicesNumOffset: pool.numLines * 2,
      modelUniByteOffset: allMeshes.length * MeshUniformStruct.size,
    };

    const handle = b.finish(idx);

    // update vertex data
    serializeMeshVertices(m, data.verticesMap);

    queues.updateTriIndices(
      idx.triIndicesNumOffset * 2,
      new Uint8Array(data.triIndicesMap.buffer)
    ); // TODO(@darzu): this view shouldn't be necessary
    queues.updateLineIndices(
      idx.lineIndicesNumOffset * 2,
      new Uint8Array(data.lineIndicesMap.buffer)
    ); // TODO(@darzu): this view shouldn't be necessary
    queues.updateVertices(
      idx.vertNumOffset * Vertex.ByteSize,
      data.verticesMap
    );

    queues.updateUniform(idx.modelUniByteOffset, data.uniformMap);

    pool.numTris += handle.numTris;
    // See the comment over the similar lign in mappedAddMesh--a
    // mesh's triangles need to be 4-byte aligned.
    pool.numTris = align(pool.numTris, 2);
    pool.numLines += handle.numLines;
    pool.numVerts += handle.numVerts;
    pool.allMeshes.push(handle);

    return handle;
  }
  function addMeshInstance(m: MeshHandle, d: MeshUniformTS): MeshHandle {
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

    const uniOffset = allMeshes.length * MeshUniformStruct.size;
    const newHandle = {
      ...m,
      mId: nextMeshId++,
      shaderData: d,
      modelUniByteOffset: uniOffset,
    };
    allMeshes.push(newHandle);
    updateUniform(newHandle);
    return newHandle;
  }

  function updateMeshVertices(handle: MeshHandle, newMesh: Mesh) {
    // TODO(@darzu): use scratch array
    const verticesMap = new Uint8Array(newMesh.pos.length * Vertex.ByteSize);
    serializeMeshVertices(newMesh, verticesMap);
    queues.updateVertices(handle.vertNumOffset * Vertex.ByteSize, verticesMap);
  }

  function updateUniform(m: MeshHandle): void {
    scratch_uniform_u8.set(MeshUniformStruct.serialize(m.shaderData));
    queues.updateUniform(m.modelUniByteOffset, scratch_uniform_u8);
  }

  return pool;
}

function serializeMeshVertices(m: Mesh, verticesMap: Uint8Array) {
  if (!m.usesProvoking) throw `mesh must use provoking vertices`;

  m.pos.forEach((pos, i) => {
    const vOff = i * Vertex.ByteSize;
    const uv: vec2 = m.uvs ? m.uvs[i] : [0.0, 0.0];
    Vertex.serialize(
      verticesMap,
      vOff,
      pos,
      DEFAULT_VERT_COLOR,
      [1.0, 0.0, 0.0],
      uv
    );
  });
  m.tri.forEach((triInd, i) => {
    // set provoking vertex data
    // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
    const vi = triInd[0];
    const vOff = vi * Vertex.ByteSize;
    const normal = computeTriangleNormal(
      m.pos[triInd[0]],
      m.pos[triInd[1]],
      m.pos[triInd[2]]
    );
    // TODO(@darzu): DISP
    // TODO(@darzu): set UVs
    const uv: vec2 = m.uvs ? m.uvs[vi] : [0.0, 0.0];
    Vertex.serialize(
      verticesMap,
      vOff,
      m.pos[triInd[0]],
      m.colors[i],
      normal,
      uv
    );
  });
}

// TODO(@darzu): not totally sure we want this state
let nextMeshId = 0;

function createMeshBuilder(
  maps: MeshPoolMaps,
  indicesShift: number,
  mesh: Mesh | undefined
): MeshBuilderInternal {
  // TODO(@darzu): these used to be parameters and can be again if we want to
  //  work inside some bigger array
  const uByteOff: number = 0;
  const vByteOff: number = 0;
  const iByteOff: number = 0;
  const lByteOff: number = 0;

  let meshFinished = false;
  let numVerts = 0;
  let numTris = 0;
  let numLines = 0;

  // TODO(@darzu): VERTEX FORMAT
  function addVertex(pos: vec3, color: vec3, normal: vec3, uv: vec2): void {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    const vOff = vByteOff + numVerts * Vertex.ByteSize;
    Vertex.serialize(maps.verticesMap, vOff, pos, color, normal, uv);
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

    maps.uniformMap.set(
      MeshUniformStruct.serialize({
        transform,
        aabbMin,
        aabbMax,
        tint,
      }),
      uByteOff
    );
  }

  function finish(idx: PoolIndex): MeshHandle {
    if (meshFinished) throw "trying to use finished MeshBuilder";
    if (!_transform) throw "uniform never set for this mesh!";
    meshFinished = true;
    const res: MeshHandle = {
      ...idx,
      mId: nextMeshId++,
      shaderData: {
        transform: _transform!,
        aabbMin: _aabbMin!,
        aabbMax: _aabbMax!,
        tint: _tint!,
      },
      numTris,
      numVerts,
      numLines,
      readonlyMesh: mesh,
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
export function getCenterFromAABB(aabb: AABB): vec3 {
  return vec3Mid(vec3.create(), aabb.min, aabb.max);
}
export function getHalfsizeFromAABB(aabb: AABB): vec3 {
  const out = vec3.create();
  const a = aabb.max;
  const b = aabb.min;
  out[0] = (a[0] - b[0]) * 0.5;
  out[1] = (a[1] - b[1]) * 0.5;
  out[2] = (a[2] - b[2]) * 0.5;
  return out;
}

export function mapMeshPositions(
  m: Mesh,
  map: (p: vec3, i: number) => vec3
): Mesh {
  let pos = m.pos.map(map);
  return { ...m, pos };
}
export function scaleMesh(m: Mesh, by: number): Mesh {
  return mapMeshPositions(m, (p) => vec3.scale(vec3.create(), p, by));
}
export function scaleMesh3(m: Mesh, by: vec3): Mesh {
  return mapMeshPositions(m, (p) => vec3.multiply(vec3.create(), p, by));
}
export function transformMesh(m: Mesh, t: mat4): Mesh {
  return mapMeshPositions(m, (p) => vec3.transformMat4(vec3.create(), p, t));
}
export function cloneMesh(m: Mesh): Mesh {
  return {
    ...m,
    pos: m.pos.map((p) => vec3.clone(p)),
    tri: m.tri.map((p) => vec3.clone(p)),
    colors: m.colors.map((p) => vec3.clone(p)),
    lines: m.lines ? m.lines.map((p) => vec2.clone(p)) : undefined,
  };
}
// split mesh by connectivity
// TODO(@darzu): actually, we probably don't need this function
export function splitMesh(m: Mesh): Mesh[] {
  // each vertex is a seperate island
  let vertIslands: Set<number>[] = [];
  for (let i = 0; i < m.pos.length; i++) vertIslands[i] = new Set<number>([i]);

  // tris and lines define connectivity, so
  //    merge together islands
  for (let tri of m.tri) {
    mergeIslands(tri[0], tri[1]);
    mergeIslands(tri[0], tri[2]);
  }
  if (m.lines)
    for (let line of m.lines) {
      mergeIslands(line[0], line[1]);
    }

  const uniqueIslands = uniqueRefs(vertIslands);
  console.dir(uniqueIslands);

  // TODO(@darzu): FINISH IMPL
  return [m];

  function mergeIslands(idx0: number, idx1: number) {
    const s0 = vertIslands[idx0];
    const s1 = vertIslands[idx1];
    if (s0 !== s1) {
      // merge s0 and s1
      for (let i of s1) s0.add(i);
      vertIslands[idx1] = s0;
    }
  }
}
function uniqueRefs<T>(ts: T[]): T[] {
  const res: T[] = [];
  for (let t1 of ts) {
    if (res.every((t2) => t2 !== t1)) res.push(t1);
  }
  return res;
}
