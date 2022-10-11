import { align, alignDown } from "../math.js";
import { assert, assertDbg } from "../util.js";
import { CyStructDesc, CyToTS } from "./gpu-struct.js";
import { Mesh } from "./mesh.js";
import { CyArray, CyIdxBuffer } from "./data-webgpu.js";
import { PERF_DBG_GPU, VERBOSE_MESH_POOL_STATS } from "../flags.js";
import { ComputeVertsDataFn } from "./gpu-registry.js";
import { vec3, vec4 } from "../gl-matrix.js";

// Mesh: lossless, all the data of a model/asset from blender
// MeshPool: lossy, a reduced set of attributes for vertex, line, triangle, and model uniforms

const vertsPerTri = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * vertsPerTri;
const bytesPerLine = Uint16Array.BYTES_PER_ELEMENT * 2;
export const MAX_INDICES = 65535; // Since we're using u16 index type, this is our max indices count

export interface MeshHandle {
  // mesh id
  readonly mId: number;

  // this mesh
  readonly uniIdx: number;
  readonly vertIdx: number;
  readonly vertNum: number;
  // NOTE: triIdx must always be 4-byte aligned
  readonly triIdx: number;
  readonly triNum: number;
  readonly lineIdx: number;
  readonly lineNum: number;

  readonly readonlyMesh?: Mesh;

  // state
  mask: number; // used for selecting which render pipelines to particpate in
  //shaderData: CyToTS<U>; // used as the uniform for this mesh
}

export function isMeshHandle(m: any): m is MeshHandle {
  return "mId" in m;
}

// TODO(@darzu): de-duplicate between here and CyMeshPoolPtr
export interface MeshPoolOpts<V extends CyStructDesc, U extends CyStructDesc> {
  computeVertsData: ComputeVertsDataFn<V>;
  computeUniData: (m: Mesh) => CyToTS<U>;
  verts: CyArray<V>;
  unis: CyArray<U>;
  triInds: CyIdxBuffer;
  lineInds: CyIdxBuffer;
  // TODO(@darzu): needed?
  shiftMeshIndices: boolean;
}

function createMeshPoolDbgStats() {
  return {
    _accumTriDataQueued: 0,
    _accumVertDataQueued: 0,
    _accumUniDataQueued: 0,
  };
}
export type MeshPoolDbgStats = ReturnType<typeof createMeshPoolDbgStats>;

export interface MeshPool<V extends CyStructDesc, U extends CyStructDesc> {
  // options
  opts: MeshPoolOpts<V, U>;
  // data
  allMeshes: MeshHandle[];
  numTris: number;
  numVerts: number;
  numLines: number;
  // dbg data (requires GPU_DBG_PERF)
  _stats: MeshPoolDbgStats;
  // methods
  addMesh: (m: Mesh) => MeshHandle;
  addMeshInstance: (m: MeshHandle) => MeshHandle;
  updateUniform: (m: MeshHandle, d: CyToTS<U>) => void;
  updateMeshVertices: (
    handle: MeshHandle,
    newMeshData: Mesh,
    // TODO(@darzu): make optional again?
    startIdx?: number,
    count?: number
  ) => void;
  updateMeshTriangles: (
    handle: MeshHandle,
    newMeshData: Mesh,
    // TODO(@darzu): make optional again?
    triIdx: number,
    triCount: number
  ) => void;
  updateMeshQuads: (
    handle: MeshHandle,
    newMeshData: Mesh,
    // TODO(@darzu): make optional again?
    quadIdx: number,
    quadCount: number
  ) => void;
}

function logMeshPoolStats(opts: MeshPoolOpts<any, any>) {
  const maxMeshes = opts.unis.length;
  const maxTris = opts.triInds.length / 3;
  const maxVerts = opts.verts.length;
  const maxLines = opts.lineInds.length / 2;
  const vertStruct = opts.verts.struct;
  const uniStruct = opts.unis.struct;

  if (MAX_INDICES < maxVerts)
    throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

  if (VERBOSE_MESH_POOL_STATS) {
    // log our estimated space usage stats
    console.log(
      `Mesh space usage for up to ${maxMeshes} meshes, ${maxTris} tris, ${maxVerts} verts:`
    );
    console.log(
      `   ${((maxVerts * vertStruct.size) / 1024).toFixed(1)} KB for verts`
    );
    console.log(
      `   ${((maxTris * bytesPerTri) / 1024).toFixed(1)} KB for tri indices`
    );
    console.log(
      `   ${((maxLines * bytesPerLine) / 1024).toFixed(1)} KB for line indices`
    );
    console.log(
      `   ${((maxMeshes * uniStruct.size) / 1024).toFixed(
        1
      )} KB for object uniform data`
    );
    const unusedBytesPerModel = uniStruct.size - uniStruct.compactSize;
    console.log(
      `   Unused ${unusedBytesPerModel} bytes in uniform buffer per object (${(
        (unusedBytesPerModel * maxMeshes) /
        1024
      ).toFixed(1)} KB total waste)`
    );
    const totalReservedBytes =
      maxVerts * vertStruct.size +
      maxTris * bytesPerTri +
      maxLines * bytesPerLine +
      maxMeshes * uniStruct.size;
    console.log(
      `Total space reserved for objects: ${(totalReservedBytes / 1024).toFixed(
        1
      )} KB`
    );
  }
}

// TODO(@darzu): HACK. should be scoped; removed as global
let nextMeshId = 1;

// function OLD_computeTriData(m: Mesh): Uint16Array {
//   const numTri = m.tri.length + m.quad.length * 2;
//   const triData = new Uint16Array(align(numTri * 3, 2));
//   // add tris
//   m.tri.forEach((triInd, i) => {
//     // TODO(@darzu): support index shifting
//     triData.set(triInd, i * 3);
//   });
//   m.quad.forEach((quadInd, i) => {
//     // TODO(@darzu): support index shifting
//     const [t1, t2] = quadToTris(quadInd);
//     triData.set(t1, m.tri.length * 3 + i * 6);
//     triData.set(t2, m.tri.length * 3 + i * 6 + 3);
//   });
//   return triData;

//   function quadToTris(q: vec4): [vec3, vec3] {
//     return [
//       [q[0], q[1], q[2]],
//       [q[0], q[2], q[3]],
//     ];
//   }
// }

let tempTriData = new Uint16Array(256);
function computeTriData(m: Mesh, startIdx: number, count: number): Uint16Array {
  // NOTE: callee responsible for aligning-up the output length
  // NOTE: caller responsible for aligning-down start-idx
  assertDbg(startIdx % 2 === 0);
  // assert(count % 2 === 0);
  assertDbg(startIdx < m.tri.length);
  assertDbg(startIdx + count <= m.tri.length);

  // try to align-up by enumerating more data
  if (startIdx + count < m.tri.length && count % 2 === 1) count += 1;

  // but our data output must always be aligned
  const dataLen = align(count * 3, 2);

  // expand our temp array if needed
  if (tempTriData.length < dataLen) tempTriData = new Uint16Array(dataLen);

  // add tris
  for (let ti = startIdx; ti < startIdx + count; ti++) {
    const dIdx = (ti - startIdx) * 3;
    assertDbg(0 <= ti && ti < m.tri.length);
    const triInd = m.tri[ti];
    tempTriData[dIdx + 0] = triInd[0];
    tempTriData[dIdx + 1] = triInd[1];
    tempTriData[dIdx + 2] = triInd[2];
  }
  return new Uint16Array(tempTriData.buffer, 0, dataLen);
}

let tempQuadData = new Uint16Array(256);
function computeQuadData(
  m: Mesh,
  startIdx: number,
  count: number
): Uint16Array {
  const dataLen = count * 2 * 3;
  if (tempQuadData.length < dataLen) tempQuadData = new Uint16Array(dataLen);
  for (let qi = startIdx; qi < startIdx + count; qi++) {
    // TODO(@darzu): support index shifting
    const idx = (qi - startIdx) * 6;
    const quadInd = m.quad[qi];
    tempQuadData[idx + 0] = quadInd[0];
    tempQuadData[idx + 1] = quadInd[1];
    tempQuadData[idx + 2] = quadInd[2];
    tempQuadData[idx + 3] = quadInd[0];
    tempQuadData[idx + 4] = quadInd[2];
    tempQuadData[idx + 5] = quadInd[3];
  }
  return new Uint16Array(tempQuadData.buffer, 0, dataLen);
}

export function createMeshPool<V extends CyStructDesc, U extends CyStructDesc>(
  opts: MeshPoolOpts<V, U>
): MeshPool<V, U> {
  logMeshPoolStats(opts);

  const maxMeshes = opts.unis.length;
  const maxTris = Math.ceil(opts.triInds.length / 3);
  const maxVerts = opts.verts.length;
  const maxLines = opts.lineInds.length / 2;

  const allMeshes: MeshHandle[] = [];

  const _stats = createMeshPoolDbgStats();

  const pool: MeshPool<V, U> = {
    opts,
    allMeshes,
    numTris: 0,
    numVerts: 0,
    numLines: 0,
    _stats,
    updateUniform,
    addMesh,
    addMeshInstance,
    updateMeshVertices,
    updateMeshTriangles,
    updateMeshQuads,
  };

  // TODO(@darzu): default to all 1s?
  function addMesh(m: Mesh): MeshHandle {
    assert(pool.allMeshes.length + 1 <= maxMeshes, "Too many meshes!");
    assert(pool.numVerts + m.pos.length <= maxVerts, "Too many vertices!");
    const numTri = m.tri.length + m.quad.length * 2;
    assert(pool.numTris + numTri <= maxTris, "Too many triangles!");
    assert(
      pool.numLines + (m.lines?.length ?? 0) <= maxLines,
      "Too many lines!"
    );
    assert(m.usesProvoking, `mesh must use provoking vertices`);
    // TODO(@darzu): what to do about this requirement...
    assert(
      !m.quad.length || m.tri.length % 2 === 0,
      `tri.length not even for ${m.dbgName}`
    );

    assertDbg(pool.numTris % 2 === 0, "alignment");
    const handle: MeshHandle = {
      mId: nextMeshId++,
      // enabled: true,
      triNum: numTri,
      lineNum: m.lines?.length ?? 0,
      vertNum: m.pos.length,
      vertIdx: pool.numVerts,
      triIdx: pool.numTris,
      lineIdx: pool.numLines,
      uniIdx: allMeshes.length,
      readonlyMesh: m,
      mask: 0,
      //shaderData: uni,
    };

    // add tris (and quads)
    if (m.tri.length) {
      const triData = computeTriData(m, 0, m.tri.length);
      // const dataLen = align(m.tri.length, 2);
      assertDbg(triData.byteLength % 4 === 0, "alignment");
      // NOTE: CALLERS to queueUpdate must be 4-byte aligned
      opts.triInds.queueUpdate(triData, handle.triIdx * 3);
      if (PERF_DBG_GPU) _stats._accumTriDataQueued += triData.length * 2.0;
    }
    if (m.quad.length) {
      const quadData = computeQuadData(m, 0, m.quad.length);
      const quadStartIdx = align((handle.triIdx + m.tri.length) * 3, 2);
      opts.triInds.queueUpdate(quadData, quadStartIdx);
      if (PERF_DBG_GPU) _stats._accumTriDataQueued += quadData.length * 2.0;
    }

    // add lines
    // TODO(@darzu): untested for a while
    let lineData: Uint16Array | undefined;
    if (m.lines?.length) {
      lineData = new Uint16Array(m.lines.length * 2);
      m.lines.forEach((inds, i) => {
        lineData?.set(inds, i * 2);
      });
    }
    if (lineData) opts.lineInds.queueUpdate(lineData, handle.lineIdx * 2);

    // add verts data
    const vertsData = opts.computeVertsData(m, 0, m.pos.length);
    opts.verts.queueUpdates(vertsData, handle.vertIdx, 0, m.pos.length);

    // initial uniform data
    const uni = opts.computeUniData(m);
    opts.unis.queueUpdate(uni, handle.uniIdx);

    if (PERF_DBG_GPU) {
      _stats._accumVertDataQueued += m.pos.length * opts.verts.struct.size;
      _stats._accumUniDataQueued += opts.unis.struct.size;
    }

    pool.numTris += numTri;
    // NOTE: mesh's triangle start idx needs to be 4-byte aligned, and we start the
    pool.numTris = align(pool.numTris, 2);
    pool.numLines += m.lines?.length ?? 0;
    pool.numVerts += m.pos.length;
    pool.allMeshes.push(handle);

    return handle;
  }
  function addMeshInstance(m: MeshHandle): MeshHandle {
    if (pool.allMeshes.length + 1 > maxMeshes) throw "Too many meshes!";

    const uniOffset = allMeshes.length;
    const newHandle: MeshHandle = {
      ...m,
      uniIdx: uniOffset,
      mId: nextMeshId++,
      //shaderData: d,
    };
    allMeshes.push(newHandle);
    //updateUniform(newHandle);
    return newHandle;
  }

  function updateMeshVertices(
    handle: MeshHandle,
    newMesh: Mesh,
    // TODO(@darzu): make optional again?
    vertIdx?: number,
    vertCount?: number
  ) {
    vertIdx = vertIdx ?? 0;
    vertCount = vertCount ?? newMesh.pos.length;
    const data = opts.computeVertsData(newMesh, vertIdx, vertCount);
    opts.verts.queueUpdates(data, handle.vertIdx + vertIdx, 0, vertCount);
    if (PERF_DBG_GPU)
      _stats._accumVertDataQueued += vertCount * opts.verts.struct.size;
  }
  function updateMeshTriangles(
    handle: MeshHandle,
    newMesh: Mesh,
    triIdx: number,
    triCount: number
  ) {
    // TODO(@darzu): this align up and down thing seems a little hacky?
    // NOTE: we need both the start and length to be 4-byte aligned!
    const triEndIdx = triIdx + triCount - 1;
    const alignedTriIdx = alignDown(triIdx, 2);
    const alignedTriCount = triEndIdx - alignedTriIdx + 1;
    // let alignTriCount = align(triCount, 2);

    assertDbg(alignedTriCount > 0);
    // TODO(@darzu): THIS ASSERT IS FAILING! \/
    // {min: 3184, max: 3200}
    // {min: 0, max: 32}
    assertDbg(
      alignedTriIdx + alignedTriCount <= newMesh.tri.length,
      `triIdx: ${triIdx}, triCount: ${triCount}, triEndIdx: ${triEndIdx}
      alignedTriIdx: ${alignedTriIdx}, alignedTriCount: ${alignedTriCount}, 
      newMesh.tri.length: ${newMesh.tri.length}`
    );
    assertDbg(handle.triIdx % 2 === 0);
    const triData = computeTriData(newMesh, alignedTriIdx, alignedTriCount);
    assertDbg(triData.byteLength % 4 === 0, "alignment");
    opts.triInds.queueUpdate(triData, (handle.triIdx + alignedTriIdx) * 3);
    if (PERF_DBG_GPU) _stats._accumTriDataQueued += triData.length * 2.0;
  }
  function updateMeshQuads(
    handle: MeshHandle,
    newMesh: Mesh,
    quadIdx: number,
    quadCount: number
  ) {
    assertDbg(0 <= quadIdx && quadIdx + quadCount <= newMesh.quad.length);
    const quadData = computeQuadData(newMesh, quadIdx, quadCount);
    assertDbg(quadData.length % 2 === 0);

    const bufQuadIndsStart = align((handle.triIdx + newMesh.tri.length) * 3, 2); // NOTE: tris come first
    let bufQuadIdx = bufQuadIndsStart + quadIdx * 2 * 3;
    assertDbg(bufQuadIdx % 2 === 0);
    assertDbg(quadData.length % 2 === 0);
    opts.triInds.queueUpdate(quadData, bufQuadIdx);
    if (PERF_DBG_GPU) _stats._accumTriDataQueued += quadData.byteLength;
  }

  function updateUniform(m: MeshHandle, d: CyToTS<U>): void {
    opts.unis.queueUpdate(d, m.uniIdx);
    if (PERF_DBG_GPU) _stats._accumUniDataQueued += opts.unis.struct.size;
  }

  return pool;
}
