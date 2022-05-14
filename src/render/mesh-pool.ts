import { centroid, computeTriangleNormal, vec3Mid } from "../utils-3d.js";
import { mat4, vec2, vec3 } from "../gl-matrix.js";
import { align, sum } from "../math.js";
import { AABB, getAABBFromPositions } from "../physics/broadphase.js";
import { EM } from "../entity-manager.js";
import { assert } from "../test.js";
import {
  createCyIdxBuf,
  createCyMany,
  createCyStruct,
  CyIdxBuffer,
  CyMany,
  CyStruct,
  CyStructDesc,
  CyToTS,
} from "./data.js";
import { Mesh, getAABBFromMesh } from "./mesh.js";
// TODO(@darzu): remove dependency on pipelines.js, they are render pipeline-specific

// TODO(@darzu): abstraction refinement:
//  [ ] how do we handle multiple shaders with different mesh
//    uniforms? e.g. water, noodles, cloth, regular objects, grass
// Mesh, MeshPool, and Cy* types
// Mesh: all the data of a model/asset from blender; lossless
// MeshPool: a reduced set of attributes for vertex, line, triangle, and model uniforms
//    what about instanced data?
//    Mesh can (probably) be loaded into a MeshPool, but it's lossy
//    has offset pointers into buffers
//    should it own the buffers?

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

export interface MeshHandle<U extends CyStructDesc> {
  // mesh id
  readonly mId: number;

  // this mesh
  readonly uniIdx: number;
  readonly vertIdx: number;
  readonly vertNum: number;
  readonly triIdx: number;
  readonly triNum: number;
  readonly lineIdx: number;
  readonly lineNum: number;

  readonly readonlyMesh?: Mesh;

  // used as the uniform for this mesh
  shaderData: CyToTS<U>;
}

export function isMeshHandle(m: any): m is MeshHandle<any> {
  return "mId" in m;
}

export interface MeshPoolOpts<V extends CyStructDesc, U extends CyStructDesc> {
  vertStruct: CyStruct<V>;
  computeVertsData: (m: Mesh) => CyToTS<V>[];
  computeUniData: (m: Mesh) => CyToTS<U>;
  uniStruct: CyStruct<U>;
  maxMeshes: number;
  maxTris: number;
  maxVerts: number;
  maxLines: number;
  shiftMeshIndices: boolean;
}
export interface MeshPoolQueues<
  V extends CyStructDesc,
  U extends CyStructDesc
> {
  // asynchronous updates to buffers
  updateVertices: (data: CyToTS<V>[], idx: number) => void;
  updateTriIndices: (data: Uint16Array, idx: number) => void;
  updateLineIndices: (data: Uint16Array, idx: number) => void;
  updateUniform: (data: CyToTS<U>, idx: number) => void;
}

export interface MeshPool<V extends CyStructDesc, U extends CyStructDesc> {
  // options
  opts: MeshPoolOpts<V, U>;
  // data
  allMeshes: MeshHandle<U>[];
  numTris: number;
  numVerts: number;
  numLines: number;
  // methods
  addMesh: (m: Mesh) => MeshHandle<U>;
  addMeshInstance: (m: MeshHandle<U>, d: CyToTS<U>) => MeshHandle<U>;
  updateUniform: (m: MeshHandle<U>) => void;
  updateMeshVertices: (handle: MeshHandle<U>, newMeshData: Mesh) => void;
}

// WebGPU stuff
// TODO(@darzu): use CyMany here
export interface MeshPoolBuffers_WebGPU<
  V extends CyStructDesc,
  U extends CyStructDesc
> {
  // buffers
  verticesBuffer: CyMany<V>;
  triIndicesBuffer: CyIdxBuffer;
  lineIndicesBuffer: CyIdxBuffer;
  uniformBuffer: CyMany<U>;
  // handles
  device: GPUDevice;
}
export type MeshPool_WebGPU<
  V extends CyStructDesc,
  U extends CyStructDesc
> = MeshPool<V, U> & MeshPoolBuffers_WebGPU<V, U>;

// WebGL stuff
// export interface MeshPoolBuffers_WebGL {
//   // vertex buffers
//   vertexBuffer: WebGLBuffer;
//   // other buffers
//   triIndicesBuffer: WebGLBuffer;
//   lineIndicesBuffer: WebGLBuffer;
//   // handles
//   gl: WebGLRenderingContext;
// }
// export type MeshPool_WebGL = MeshPool & MeshPoolBuffers_WebGL;

export function createMeshPool_WebGPU<
  V extends CyStructDesc,
  U extends CyStructDesc
>(device: GPUDevice, opts: MeshPoolOpts<V, U>): MeshPool_WebGPU<V, U> {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
  // console.log(`maxMeshes: ${maxMeshes}, maxTris: ${maxTris}, maxVerts: ${maxVerts}`)

  // create our mesh buffers (vertex, index, uniform)
  const verticesBuffer = createCyMany(
    device,
    opts.vertStruct,
    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    maxVerts
  );
  const triIndicesBuffer = createCyIdxBuf(device, maxTris * 3);
  // TODO(@darzu): make creating this buffer optional on whether we're using line indices or not
  const lineIndicesBuffer = createCyIdxBuf(device, maxLines * 2);
  const uniformBuffer = createCyMany(
    device,
    opts.uniStruct,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    maxMeshes
  );

  const queues: MeshPoolQueues<V, U> = {
    updateVertices: verticesBuffer.queueUpdates,
    updateTriIndices: triIndicesBuffer.queueUpdate,
    updateLineIndices: lineIndicesBuffer.queueUpdate,
    updateUniform: uniformBuffer.queueUpdate,
  };

  const buffers: MeshPoolBuffers_WebGPU<V, U> = {
    verticesBuffer,
    triIndicesBuffer,
    lineIndicesBuffer,
    uniformBuffer,
    device,
  };

  const pool = createMeshPool(opts, queues);

  const pool_webgpu: MeshPool_WebGPU<V, U> = { ...pool, ...buffers };

  return pool_webgpu;
}

// export function createMeshPool_WebGL(
//   gl: WebGLRenderingContext,
//   opts: MeshPoolOpts
// ): MeshPool_WebGL {
//   const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

//   // TODO(@darzu): we shouldn't need to preallocate all this
//   const scratchVerts = new Float32Array(maxVerts * (VertexStruct.size / 4));

//   const scratchTriIndices = new Uint16Array(maxTris * 3);
//   const scratchLineIndices = new Uint16Array(maxLines * 2);

//   // vertex buffers
//   const vertexBuffer = gl.createBuffer()!;
//   gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
//   gl.bufferData(gl.ARRAY_BUFFER, scratchVerts, gl.DYNAMIC_DRAW); // TODO(@darzu): sometimes we might want STATIC_DRAW

//   // index buffers
//   const triIndicesBuffer = gl.createBuffer()!;
//   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
//   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchTriIndices, gl.DYNAMIC_DRAW);

//   const lineIndicesBuffer = gl.createBuffer()!;
//   // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
//   // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
//   // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, scratchLineIndices, gl.DYNAMIC_DRAW);

//   // our in-memory reflections of the buffers used during the initial build phase
//   // TODO(@darzu): this is too much duplicate data
//   // let verticesMap = new Uint8Array(maxVerts * VertexStruct.size);
//   // let triIndicesMap = new Uint16Array(maxTris * 3);
//   // let lineIndicesMap = new Uint16Array(maxLines * 2);
//   let uniformMap = new Uint8Array(maxMeshes * opts.uniStruct.size);

//   function updateVertices(offset: number, data: Uint8Array) {
//     // TODO(@darzu): this is a strange way to compute this, but seems to work conservatively
//     // const numVerts = Math.min(data.length / VertexStruct.size, Math.max(builder.numVerts, builder.poolHandle.numVerts))
//     // const numVerts = data.length / VertexStruct.size;
//     // const positions = new Float32Array(numVerts * 3);
//     // const colors = new Float32Array(numVerts * 3);
//     // const normals = new Float32Array(numVerts * 3);
//     // // TODO(@darzu): DISP
//     // const uvs = new Float32Array(numVerts * 2);
//     // Vertex.Deserialize(data, numVerts, positions, colors, normals, uvs);

//     // const vNumOffset = offset / VertexStruct.size;

//     // TODO(@darzu): debug logging
//     // console.log(`positions: #${vNumOffset}: ${positions.slice(0, numVerts * 3).join(',')}`)
//     gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
//     gl.bufferSubData(gl.ARRAY_BUFFER, offset, data);
//   }
//   function updateTriIndices(offset: number, data: Uint8Array) {
//     // TODO(@darzu): again, strange but a useful optimization
//     // const numInd = Math.min(data.length / 2, Math.max(builder.numTris, builder.poolHandle.numTris) * 3)
//     // TODO(@darzu): debug logging
//     // console.log(`indices: #${offset / 2}: ${new Uint16Array(data.buffer).slice(0, numInd).join(',')}`)
//     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triIndicesBuffer);
//     gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
//   }
//   function updateLineIndices(offset: number, data: Uint8Array) {
//     // TODO(@darzu): line indices don't work right. they interfere with regular tri indices.
//     // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndicesBuffer);
//     // gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, data);
//   }
//   function updateUniform(offset: number, data: Uint8Array) {
//     uniformMap.set(data, offset);
//   }

//   const queues: MeshPoolQueues = {
//     updateTriIndices,
//     updateLineIndices,
//     updateVertices,
//     updateUniform,
//   };

//   const buffers: MeshPoolBuffers_WebGL = {
//     gl,
//     vertexBuffer,
//     // other buffers
//     triIndicesBuffer,
//     lineIndicesBuffer,
//   };

//   const pool = createMeshPool(opts, queues);

//   const pool_webgl: MeshPool_WebGL = { ...pool, ...buffers };

//   return pool_webgl;
// }

// TODO(@darzu): scope?
let nextMeshId = 1;

function createMeshPool<V extends CyStructDesc, U extends CyStructDesc>(
  opts: MeshPoolOpts<V, U>,
  queues: MeshPoolQueues<V, U>
): MeshPool<V, U> {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

  if (MAX_INDICES < maxVerts)
    throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

  // log our estimated space usage stats
  console.log(
    `Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`
  );
  console.log(
    `   ${((maxVerts * opts.vertStruct.size) / 1024).toFixed(1)} KB for verts`
  );
  console.log(
    `   ${((maxTris * bytesPerTri) / 1024).toFixed(1)} KB for tri indices`
  );
  console.log(
    `   ${((maxLines * bytesPerLine) / 1024).toFixed(1)} KB for line indices`
  );
  console.log(
    `   ${((maxMeshes * opts.uniStruct.size) / 1024).toFixed(
      1
    )} KB for object uniform data`
  );
  const unusedBytesPerModel = opts.uniStruct.size - opts.uniStruct.compactSize;
  console.log(
    `   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(
      (unusedBytesPerModel * maxMeshes) /
      1024
    ).toFixed(1)} KB total waste)`
  );
  const totalReservedBytes =
    maxVerts * opts.vertStruct.size +
    maxTris * bytesPerTri +
    maxLines * bytesPerLine +
    maxMeshes * opts.uniStruct.size;
  console.log(
    `Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(
      1
    )} KB`
  );

  const allMeshes: MeshHandle<U>[] = [];

  const pool: MeshPool<V, U> = {
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

  function addMesh(m: Mesh): MeshHandle<U> {
    assert(pool.allMeshes.length + 1 <= maxMeshes, "Too many meshes!");
    assert(pool.numVerts + m.pos.length <= maxVerts, "Too many vertices!");
    assert(pool.numTris + m.tri.length <= maxTris, "Too many triangles!");
    assert(
      pool.numLines + (m.lines?.length ?? 0) <= maxLines,
      "Too many lines!"
    );
    assert(m.usesProvoking, `mesh must use provoking vertices`);

    const vertsData = opts.computeVertsData(m);
    const triData = new Uint16Array(align(m.tri.length * 3, 2));
    m.tri.forEach((triInd, i) => {
      // TODO(@darzu): support index shifting
      triData.set(triInd, i * 3);
    });
    let lineData: Uint16Array | undefined;
    if (m.lines) {
      lineData = new Uint16Array(m.lines.length * 2);
      m.lines.forEach((inds, i) => {
        lineData?.set(inds, i * 2);
      });
    }

    // initial uniform data
    const uni = opts.computeUniData(m);

    const handle: MeshHandle<U> = {
      mId: nextMeshId++,
      triNum: m.tri.length,
      lineNum: m.lines?.length ?? 0,
      vertNum: m.pos.length,
      vertIdx: pool.numVerts,
      triIdx: pool.numTris,
      lineIdx: pool.numLines,
      uniIdx: allMeshes.length,
      readonlyMesh: m,
      shaderData: uni,
    };

    assert(triData.length % 2 === 0, "triData");
    queues.updateTriIndices(triData, handle.triIdx * 3);
    if (lineData) queues.updateLineIndices(lineData, handle.lineIdx * 2);
    queues.updateVertices(vertsData, handle.vertIdx);
    queues.updateUniform(uni, handle.uniIdx);

    pool.numTris += m.tri.length;
    // NOTE: mesh's triangles need to be 4-byte aligned.
    // TODO(@darzu): is this still necessary? might be handled by the CyBuffer stuff
    pool.numTris = align(pool.numTris, 2);
    pool.numLines += m.lines?.length ?? 0;
    pool.numVerts += m.pos.length;
    pool.allMeshes.push(handle);

    return handle;
  }
  function addMeshInstance(m: MeshHandle<U>, d: CyToTS<U>): MeshHandle<U> {
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

    const uniOffset = allMeshes.length;
    const newHandle: MeshHandle<U> = {
      ...m,
      uniIdx: uniOffset,
      mId: nextMeshId++,
      shaderData: d,
    };
    allMeshes.push(newHandle);
    updateUniform(newHandle);
    return newHandle;
  }

  function updateMeshVertices(handle: MeshHandle<U>, newMesh: Mesh) {
    const data = opts.computeVertsData(newMesh);
    queues.updateVertices(data, handle.vertIdx);
  }

  function updateUniform(m: MeshHandle<U>): void {
    queues.updateUniform(m.shaderData, m.uniIdx);
  }

  return pool;
}
