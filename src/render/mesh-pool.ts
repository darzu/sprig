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
  CyToTS,
} from "./data.js";
import { Mesh, getAABBFromMesh } from "./mesh.js";
// TODO(@darzu): remove dependency on pipelines.js, they are render pipeline-specific
import {
  MeshUniformStruct,
  MeshUniformTS,
  VertexStruct,
  VertexTS,
} from "./pipelines.js";

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

const DEFAULT_VERT_COLOR: vec3 = [0.0, 0.0, 0.0];

// to track offsets into those buffers so we can make modifications and form draw calls.
export interface PoolIndex {
  // handle into the pool
  readonly pool: MeshPool;
  readonly vertNumOffset: number;
  readonly triIndicesNumOffset: number;
  readonly modelUniNumOffset: number;
  readonly lineIndicesNumOffset: number; // for wireframe
}
export interface MeshHandle {
  readonly poolIdx: PoolIndex;
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
export interface MeshPoolQueues {
  // asynchronous updates to buffers
  updateVertices: (data: VertexTS[], idx: number) => void;
  updateTriIndices: (data: Uint16Array, idx: number) => void;
  updateLineIndices: (data: Uint16Array, idx: number) => void;
  updateUniform: (data: MeshUniformTS, idx: number) => void;
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
  addMeshInstance: (m: MeshHandle, d: MeshUniformTS) => MeshHandle;
  updateUniform: (m: MeshHandle) => void;
  updateMeshVertices: (handle: MeshHandle, newMeshData: Mesh) => void;
}

// WebGPU stuff
// TODO(@darzu): use CyMany here
export interface MeshPoolBuffers_WebGPU {
  // buffers
  verticesBuffer: CyMany<typeof VertexStruct.desc>;
  triIndicesBuffer: CyIdxBuffer;
  lineIndicesBuffer: CyIdxBuffer;
  uniformBuffer: CyMany<typeof MeshUniformStruct.desc>;
  // handles
  device: GPUDevice;
}
export type MeshPool_WebGPU = MeshPool & MeshPoolBuffers_WebGPU;

// WebGL stuff
export interface MeshPoolBuffers_WebGL {
  // vertex buffers
  vertexBuffer: WebGLBuffer;
  // other buffers
  triIndicesBuffer: WebGLBuffer;
  lineIndicesBuffer: WebGLBuffer;
  // handles
  gl: WebGLRenderingContext;
}
export type MeshPool_WebGL = MeshPool & MeshPoolBuffers_WebGL;

export function createMeshPool_WebGPU(
  device: GPUDevice,
  opts: MeshPoolOpts
): MeshPool_WebGPU {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;
  // console.log(`maxMeshes: ${maxMeshes}, maxTris: ${maxTris}, maxVerts: ${maxVerts}`)

  // create our mesh buffers (vertex, index, uniform)
  const verticesBuffer = createCyMany(
    device,
    VertexStruct,
    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    maxVerts
  );
  const triIndicesBuffer = createCyIdxBuf(device, maxTris * 3);
  // TODO(@darzu): make creating this buffer optional on whether we're using line indices or not
  const lineIndicesBuffer = createCyIdxBuf(device, maxLines * 2);
  const uniformBuffer = createCyMany(
    device,
    MeshUniformStruct,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    maxMeshes
  );

  const queues: MeshPoolQueues = {
    updateVertices: verticesBuffer.queueUpdates,
    updateTriIndices: triIndicesBuffer.queueUpdate,
    updateLineIndices: lineIndicesBuffer.queueUpdate,
    updateUniform: uniformBuffer.queueUpdate,
  };

  const buffers: MeshPoolBuffers_WebGPU = {
    verticesBuffer,
    triIndicesBuffer,
    lineIndicesBuffer,
    uniformBuffer,
    device,
  };

  const pool = createMeshPool(opts, queues);

  const pool_webgpu: MeshPool_WebGPU = { ...pool, ...buffers };

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
//   let uniformMap = new Uint8Array(maxMeshes * MeshUniformStruct.size);

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

function createMeshPool(opts: MeshPoolOpts, queues: MeshPoolQueues): MeshPool {
  const { maxMeshes, maxTris, maxVerts, maxLines } = opts;

  if (MAX_INDICES < maxVerts)
    throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

  // log our estimated space usage stats
  console.log(
    `Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`
  );
  console.log(
    `   ${((maxVerts * VertexStruct.size) / 1024).toFixed(1)} KB for verts`
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
    maxVerts * VertexStruct.size +
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

  function computeVertsData(m: Mesh): VertexTS[] {
    const vertsData: VertexTS[] = m.pos.map((pos, i) => ({
      position: pos,
      color: DEFAULT_VERT_COLOR,
      normal: [1.0, 0.0, 0.0],
      uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
    }));
    m.tri.forEach((triInd, i) => {
      // set provoking vertex data
      // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
      const normal = computeTriangleNormal(
        m.pos[triInd[0]],
        m.pos[triInd[1]],
        m.pos[triInd[2]]
      );
      vertsData[triInd[0]].normal = normal;
      vertsData[triInd[0]].color = m.colors[i];
    });
    return vertsData;
  }

  function addMesh(m: Mesh): MeshHandle {
    assert(pool.allMeshes.length + 1 <= maxMeshes, "Too many meshes!");
    assert(pool.numVerts + m.pos.length <= maxVerts, "Too many vertices!");
    assert(pool.numTris + m.tri.length <= maxTris, "Too many triangles!");
    assert(
      pool.numLines + (m.lines?.length ?? 0) <= maxLines,
      "Too many lines!"
    );
    assert(m.usesProvoking, `mesh must use provoking vertices`);

    const vertsData: VertexTS[] = computeVertsData(m);
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
    const { min, max } = getAABBFromMesh(m);
    const uni: MeshUniformTS = {
      transform: mat4.create(),
      aabbMin: min,
      aabbMax: max,
      tint: vec3.create(),
    };

    const idx: PoolIndex = {
      pool,
      vertNumOffset: pool.numVerts,
      triIndicesNumOffset: pool.numTris * 3,
      lineIndicesNumOffset: pool.numLines * 2,
      modelUniNumOffset: allMeshes.length,
    };

    assert(triData.length % 2 === 0, "triData");
    queues.updateTriIndices(triData, idx.triIndicesNumOffset);
    if (lineData) queues.updateLineIndices(lineData, idx.lineIndicesNumOffset);
    queues.updateVertices(vertsData, idx.vertNumOffset);
    queues.updateUniform(uni, idx.modelUniNumOffset);

    const handle: MeshHandle = {
      poolIdx: idx,
      mId: nextMeshId++,
      numTris: m.tri.length,
      numLines: m.lines?.length ?? 0,
      numVerts: m.pos.length,
      readonlyMesh: m,
      shaderData: uni,
    };

    pool.numTris += m.tri.length;
    // NOTE: mesh's triangles need to be 4-byte aligned.
    // TODO(@darzu): is this still necessary? might be handled by the CyBuffer stuff
    pool.numTris = align(pool.numTris, 2);
    pool.numLines += m.lines?.length ?? 0;
    pool.numVerts += m.pos.length;
    pool.allMeshes.push(handle);

    return handle;
  }
  function addMeshInstance(m: MeshHandle, d: MeshUniformTS): MeshHandle {
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

    const uniOffset = allMeshes.length;
    const newHandle: MeshHandle = {
      ...m,
      poolIdx: {
        ...m.poolIdx,
        modelUniNumOffset: uniOffset,
      },
      mId: nextMeshId++,
      shaderData: d,
    };
    allMeshes.push(newHandle);
    updateUniform(newHandle);
    return newHandle;
  }

  function updateMeshVertices(handle: MeshHandle, newMesh: Mesh) {
    const data = computeVertsData(newMesh);
    queues.updateVertices(data, handle.poolIdx.vertNumOffset);
  }

  function updateUniform(m: MeshHandle): void {
    queues.updateUniform(m.shaderData, m.poolIdx.modelUniNumOffset);
  }

  return pool;
}
