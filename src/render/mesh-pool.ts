import { align, alignDown } from "../utils/math.js";
import { assert, assertDbg, dbgLogOnce } from "../utils/util.js";
import { never } from "../utils/util-no-import.js";
import { CyStructDesc, CyToTS, createStruct } from "./gpu-struct.js";
import { Mesh, RawMesh } from "../meshes/mesh.js";
import {
  createCyArray,
  createCyIdxBuf,
  CyArray,
  CyIdxBuffer,
} from "./data-webgpu.js";
import { PERF_DBG_GPU, VERBOSE_MESH_POOL_STATS } from "../flags.js";
import {
  ComputeVertsDataFn,
  CY,
  CyArrayPtr,
  CyIdxBufferPtr,
  CyMeshPoolPtr,
  numIndsPerPrim,
  PrimKind,
} from "./gpu-registry.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { DEFAULT_MASK } from "./pipeline-masks.js";
import { ComponentDef } from "../ecs/entity-manager.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";
import { CyResources } from "./instantiator-webgpu.js";

// Mesh: lossless, all the data of a model/asset from blender
// MeshPool: lossy, a reduced set of attributes for vertex, line, triangle, and model uniforms

export const MAX_INDICES = 65535; // Since we're using u16 index type, this is our max indices count

// TODO(@darzu): rename?
export interface MeshReserve {
  readonly maxVertNum: number;
  readonly maxPrimNum: number;
}

export interface MeshHandle {
  // mesh id
  readonly pool: MeshPool<any, any>;
  readonly mId: number;

  // geo offsets
  readonly setIdx: number;
  readonly uniIdx: number;
  readonly vertIdx: number;
  readonly primIdx: number;

  // geo lengths
  // NOTE: only changable if ".reserved" is set.
  vertNum: number;
  // NOTE: triIdx must always be 4-byte aligned
  primNum: number;

  // optional extra reserved geo space
  readonly reserved?: MeshReserve;

  // NOTE: changes to this mesh must by manually synced to the
  //  MeshPool & GPU via updateMeshVertices and friends.
  readonly mesh: Mesh;

  // state
  mask: number; // used for selecting which render pipelines to particpate in
  //shaderData: CyToTS<U>; // used as the uniform for this mesh
}

export function isMeshHandle(m: any): m is MeshHandle {
  return "mId" in m;
}

function createMeshPoolDbgStats() {
  return {
    _accumPrimDataQueued: 0,
    _accumVertDataQueued: 0,
    _accumUniDataQueued: 0,
  };
}
export type MeshPoolDbgStats = ReturnType<typeof createMeshPoolDbgStats>;

// TODO(@darzu): Opaque interface type was more readable but this is easier to
//    update and goToDefinition. What's the right choice? Maybe code gen..
export type MeshPool<
  V extends CyStructDesc,
  U extends CyStructDesc
> = ReturnType<typeof createMeshPool<V, U>>;

function logMeshPoolStats(pool: MeshPool<any, any>) {
  // TODO(@darzu): re-do this with consideration of multi-buffer stuff
  const maxMeshes = pool.ptr.maxMeshes;
  const maxPrims = pool.sets.length * pool.ptr.setMaxPrims;
  const maxVerts = pool.sets.length * pool.ptr.setMaxVerts;
  // const maxLines = opts.lineInds.length / 2;
  const vertStruct = pool.ptr.vertsStruct;
  const uniStruct = pool.ptr.unisStruct;

  // if (MAX_INDICES < maxVerts)
  //   throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

  if (VERBOSE_MESH_POOL_STATS) {
    // log our estimated space usage stats
    console.log(
      `Mesh space usage for up to ${maxMeshes} meshes, ${maxPrims} tris/prims, ${maxVerts} verts:`
    );
    console.log(
      `   ${((maxVerts * vertStruct.size) / 1024).toFixed(1)} KB for verts`
    );
    const bytesPerPrim =
      Uint16Array.BYTES_PER_ELEMENT * numIndsPerPrim(pool.ptr.prim);
    console.log(
      `   ${((maxPrims * bytesPerPrim) / 1024).toFixed(1)} KB for prim indices`
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
      maxPrims * bytesPerPrim +
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

//   function quadToTris(q: vec4): [V3, V3] {
//     return [
//       [q[0], q[1], q[2]],
//       [q[0], q[2], q[3]],
//     ];
//   }
// }

let tempPointData = new Uint16Array(256);
function getPointInds(m: Mesh, startIdx: number, count: number): Uint16Array {
  // NOTE: callee responsible for aligning-up the output length
  // NOTE: caller responsible for aligning-down start-idx
  assertDbg(startIdx % 2 === 0);
  assertDbg(startIdx < m.pos.length);
  assertDbg(startIdx + count <= m.pos.length);
  assertDbg(count % 2 === 0, "maybe important alignment?");
  const dataLen = count;
  // expand our temp array if needed
  if (tempPointData.length < dataLen) tempPointData = new Uint16Array(dataLen);
  // add points
  for (let i = startIdx; i < startIdx + count; i++) {
    const dIdx = i - startIdx;
    tempPointData[dIdx] = i;
  }
  return new Uint16Array(tempPointData.buffer, 0, dataLen);
}

let tempLineData = new Uint16Array(256);
function getLineInds(m: Mesh, startIdx: number, count: number): Uint16Array {
  // NOTE: callee responsible for aligning-up the output length
  // NOTE: caller responsible for aligning-down start-idx
  assertDbg(startIdx % 2 === 0);
  assert(m.lines, "mesh must have lines to update lines data");
  assertDbg(startIdx < m.lines.length);
  assertDbg(startIdx + count <= m.lines.length);

  const dataLen = count * 2;

  // expand our temp array if needed
  if (tempLineData.length < dataLen) tempLineData = new Uint16Array(dataLen);
  // add lines
  for (let li = startIdx; li < startIdx + count; li++) {
    const dIdx = (li - startIdx) * 2;
    assertDbg(0 <= li && li < m.lines.length);
    const lineInd = m.lines[li];
    tempLineData[dIdx + 0] = lineInd[0];
    tempLineData[dIdx + 1] = lineInd[1];
  }
  return new Uint16Array(tempLineData.buffer, 0, dataLen);
}

let tempTriData = new Uint16Array(256);
function getTriInds(m: Mesh, startIdx: number, count: number): Uint16Array {
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
function getQuadInds(m: Mesh, startIdx: number, count: number): Uint16Array {
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

const UNI_USAGE = GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM;
const VERT_USAGE = GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;

export function createMeshPool<V extends CyStructDesc, U extends CyStructDesc>(
  // TODO(@darzu): having both otps and ptr is strange
  // opts: MeshPoolOpts<V, U>,
  device: GPUDevice,
  resources: CyResources,
  ptr: CyMeshPoolPtr<V, U>
) {
  const unisName = `${ptr.name}Unis`;
  const vertsName = (i: number) => `${ptr.name}Verts${i}`;
  const indsName = (i: number) => `${ptr.name}Inds${i}`;

  const primKind = ptr.prim;

  // TODO(@darzu): move resource creation to the instantiator?
  const unisPtr = CY.createArray(unisName, {
    struct: ptr.unisStruct,
    init: ptr.maxMeshes,
  });
  const unis = createCyArray(
    device,
    unisPtr.name,
    unisPtr.struct,
    UNI_USAGE,
    ptr.maxMeshes
  );
  resources.kindToNameToRes.array[unisPtr.name] = unis;

  type BuffSet = {
    vertsPtr: CyArrayPtr<V>;
    verts: CyArray<V>;
    indsPtr: CyIdxBufferPtr;
    inds: CyIdxBuffer;
    numPrims: number;
    numVerts: number;
    meshes: MeshHandle[];
  };

  function createBuffSet(idx: number): BuffSet {
    // TODO(@darzu): support multi
    const vertsPtr = CY.createArray(vertsName(idx), {
      struct: ptr.vertsStruct,
      init: ptr.setMaxVerts,
    });
    const verts = createCyArray(
      device,
      vertsPtr.name,
      vertsPtr.struct,
      VERT_USAGE,
      ptr.setMaxVerts
    );
    resources.kindToNameToRes.array[vertsPtr.name] = verts;
    const primCount = ptr.setMaxPrims * numIndsPerPrim(primKind);
    const indsPtr = CY.createIdxBuf(indsName(idx), {
      init: primCount, // TODO(@darzu): alignment?
    });
    const inds = createCyIdxBuf(device, indsPtr.name, primCount);
    resources.kindToNameToRes.idxBuffer[indsPtr.name] = inds;
    return {
      vertsPtr,
      verts,
      indsPtr,
      inds,
      numPrims: 0,
      numVerts: 0,
      meshes: [],
    };
  }

  const sets: BuffSet[] = [];

  const getTotalMeshCount = () => sets.reduce((p, n) => p + n.meshes.length, 0);

  let currSetIdx = 0;

  const pushNewBuffSet = () => {
    assert(
      sets.length + 1 <= ptr.maxSets,
      `Too many mesh-pool BuffSet! max: ${ptr.maxSets}`
    );
    currSetIdx = sets.length;
    if (PERF_DBG_GPU)
      console.log(`Creating new set @${currSetIdx} for: ${ptr.name}`);
    sets.push(createBuffSet(currSetIdx));
  };

  pushNewBuffSet();

  const _stats = createMeshPoolDbgStats();

  const pool = {
    ptr,
    unisPtr,
    unis,
    sets,
    _stats,
    updateUniform,
    addMesh,
    addMeshInstance,
    updateMeshVertices,
    updateMeshPointInds,
    updateMeshLineInds,
    updateMeshTriInds,
    updateMeshQuadInds,
    updateMeshSize,
    updateMeshInstance,
  };

  function getNumPrimsOfKind(m: RawMesh, k: PrimKind): number {
    if (primKind === "tri") return m.tri.length + m.quad.length * 2;
    else if (primKind === "line") return m.lines?.length ?? 0;
    else if (primKind === "point") return m.pos.length;
    else never(primKind);
  }

  function addMesh(m: Mesh, reserved?: MeshReserve): MeshHandle {
    // TODO(@darzu): handle fragmentation! Right now we always try to add
    //    to latest set

    // check mesh count
    const uniIdx = getTotalMeshCount();
    assert(uniIdx + 1 <= ptr.maxMeshes, "Too many meshes!!");

    // determine this size
    const _vertNum = m.pos.length;
    const vertNum = reserved?.maxVertNum ?? _vertNum;
    let _primNum = getNumPrimsOfKind(m, primKind);
    const primNum = reserved?.maxPrimNum ?? _primNum;
    assert(_vertNum <= vertNum, "Inconsistent num of vertices!");
    assert(_primNum <= primNum, "Inconsistent num of triangles!");

    // check integrity
    assert(m.usesProvoking, `mesh must use provoking vertices`);
    // TODO(@darzu): what to do about this requirement...
    assert(
      !m.quad.length || m.tri.length % 2 === 0,
      `tri.length not even for ${m.dbgName}`
    );
    // TODO(@darzu): LINES. How to handle face data?
    const faceNum = m.tri.length + m.quad.length;
    // console.dir(m);
    assert(
      m.colors.length === faceNum,
      `${m.dbgName}: Inconsistent face num ${faceNum} vs color num ${m.colors.length}`
    );
    assert(
      m.surfaceIds.length === faceNum,
      `${m.dbgName}: Inconsistent face num ${faceNum} vs surface IDs num ${m.surfaceIds.length}`
    );
    assertDbg(pool.sets[currSetIdx].numPrims % 2 === 0, "alignment");

    // check if theoretically fit in any set
    assert(vertNum <= ptr.setMaxVerts, `Too many vertices!! ${vertNum}`);
    assert(primNum <= ptr.setMaxPrims, `Too many prims/tris!! ${primNum}`);

    // check if we fit in the current set
    const doesFit =
      pool.sets[currSetIdx].numVerts + vertNum <= ptr.setMaxVerts &&
      pool.sets[currSetIdx].numPrims + primNum <= ptr.setMaxPrims;

    // create a new set if needed
    if (!doesFit) pushNewBuffSet();
    const currSet = pool.sets[currSetIdx];

    const handle: MeshHandle = {
      pool,
      mId: nextMeshId++,
      // enabled: true,
      primNum: _primNum,
      vertNum: _vertNum,
      vertIdx: currSet.numVerts,
      primIdx: currSet.numPrims,
      setIdx: currSetIdx,
      uniIdx,
      mesh: m,
      mask: DEFAULT_MASK,
      reserved,
      //shaderData: uni,
    };

    currSet.numPrims += primNum;
    // NOTE: mesh's triangle start idx needs to be 4-byte aligned, and we start the
    currSet.numPrims = align(currSet.numPrims, 2);
    currSet.numVerts += vertNum;
    currSet.meshes.push(handle);

    // submit verts to GPU
    if (m.pos.length) updateMeshVertices(handle, m);
    // submit indices to GPU
    if (primKind === "tri") {
      if (m.quad.length) updateMeshQuadInds(handle, m);
      if (m.tri.length) updateMeshTriInds(handle, m);
    } else if (primKind === "line") {
      if (m.lines?.length) updateMeshLineInds(handle, m);
    } else if (primKind === "point") {
      updateMeshPointInds(handle, m);
    }
    // submit empty uniform to GPU
    queueEmptyUniform(handle);

    return handle;
  }
  function addMeshInstance(m: MeshHandle): MeshHandle {
    const uniOffset = getTotalMeshCount();
    if (uniOffset + 1 > ptr.maxMeshes) throw "Too many meshes!";

    const newHandle: MeshHandle = {
      ...m,
      uniIdx: uniOffset,
      mId: nextMeshId++,
    };
    pool.sets[m.setIdx].meshes.push(newHandle);

    return newHandle;
  }
  function updateMeshInstance(m: MeshHandle, proto: MeshHandle): void {
    // TODO(@darzu): not totally sure this method is a good idea..
    const uniIdx = m.uniIdx;
    const mId = m.mId;

    Object.assign(m, proto, {
      uniIdx,
      mId,
    });
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
    const data = ptr.computeVertsData(newMesh, vertIdx, vertCount);
    const set = pool.sets[handle.setIdx];
    set.verts.queueUpdates(data, handle.vertIdx + vertIdx, 0, vertCount);
    if (PERF_DBG_GPU)
      _stats._accumVertDataQueued += vertCount * set.verts.struct.size;
  }

  function updateMeshPointInds(
    handle: MeshHandle,
    newMesh: Mesh,
    pointIdx?: number,
    pointCount?: number
  ) {
    assert(primKind === "point");
    pointIdx = pointIdx ?? 0;
    const meshPointCount = newMesh.pos.length;
    assert(meshPointCount > 0);
    pointCount = pointCount ?? meshPointCount;
    assertDbg(0 <= pointIdx && pointIdx + pointCount <= meshPointCount);

    const pointData = getPointInds(newMesh, pointIdx, pointCount);
    assertDbg(pointData.byteLength % 4 === 0, "alignment");
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(pointData, (handle.primIdx + pointIdx) * 1);
    if (PERF_DBG_GPU) _stats._accumPrimDataQueued += pointData.byteLength;
  }
  function updateMeshLineInds(
    handle: MeshHandle,
    newMesh: Mesh,
    lineIdx?: number,
    lineCount?: number
  ) {
    assert(primKind === "line");
    lineIdx = lineIdx ?? 0;
    const meshLineCount = newMesh.lines?.length ?? 0;
    assert(meshLineCount > 0);
    lineCount = lineCount ?? meshLineCount;
    assertDbg(0 <= lineIdx && lineIdx + lineCount <= meshLineCount);

    const lineData = getLineInds(newMesh, lineIdx, lineCount);
    assertDbg(lineData.byteLength % 4 === 0, "alignment");
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(lineData, (handle.primIdx + lineIdx) * 2);
    if (PERF_DBG_GPU) _stats._accumPrimDataQueued += lineData.byteLength;
  }
  function updateMeshTriInds(
    handle: MeshHandle,
    newMesh: Mesh,
    triIdx?: number,
    triCount?: number
  ) {
    assert(primKind === "tri");
    triIdx = triIdx ?? 0;
    triCount = triCount ?? newMesh.tri.length;

    // TODO(@darzu): this align up and down thing seems a little hacky?
    // NOTE: we need both the start and length to be 4-byte aligned!
    const triEndIdx = triIdx + triCount - 1;
    const alignedTriIdx = alignDown(triIdx, 2);
    const alignedTriCount = triEndIdx - alignedTriIdx + 1;
    // let alignTriCount = align(triCount, 2);

    assertDbg(alignedTriCount > 0, `no triangles?`);
    // TODO(@darzu): THIS ASSERT IS FAILING! \/
    // {min: 3184, max: 3200}
    // {min: 0, max: 32}
    assertDbg(
      alignedTriIdx + alignedTriCount <= newMesh.tri.length,
      `triIdx: ${triIdx}, triCount: ${triCount}, triEndIdx: ${triEndIdx}
      alignedTriIdx: ${alignedTriIdx}, alignedTriCount: ${alignedTriCount}, 
      newMesh.tri.length: ${newMesh.tri.length}`
    );
    assertDbg(handle.primIdx % 2 === 0);
    const triData = getTriInds(newMesh, alignedTriIdx, alignedTriCount);
    assertDbg(triData.byteLength % 4 === 0, "alignment");
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(triData, (handle.primIdx + alignedTriIdx) * 3);
    if (PERF_DBG_GPU) _stats._accumPrimDataQueued += triData.length * 2.0;
  }
  function updateMeshQuadInds(
    handle: MeshHandle,
    newMesh: Mesh,
    quadIdx?: number,
    quadCount?: number
  ) {
    assert(primKind === "tri");
    quadIdx = quadIdx ?? 0;
    quadCount = quadCount ?? newMesh.quad.length;

    assertDbg(0 <= quadIdx && quadIdx + quadCount <= newMesh.quad.length);
    const quadData = getQuadInds(newMesh, quadIdx, quadCount);
    assertDbg(quadData.length % 2 === 0);

    const bufQuadIndsStart = align(
      (handle.primIdx + newMesh.tri.length) * 3,
      2
    ); // NOTE: tris come first
    let bufQuadIdx = bufQuadIndsStart + quadIdx * 2 * 3;
    assertDbg(bufQuadIdx % 2 === 0);
    assertDbg(quadData.length % 2 === 0);
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(quadData, bufQuadIdx);
    if (PERF_DBG_GPU) _stats._accumPrimDataQueued += quadData.byteLength;
  }

  function updateMeshSize(handle: MeshHandle, newMesh: Mesh) {
    const m = newMesh;

    assert(handle.reserved, "Must have .reserved to update MeshHandle's size");

    const newNumVert = m.pos.length;
    const newNumPrim = getNumPrimsOfKind(m, primKind);

    assert(newNumVert <= handle.reserved.maxVertNum, "Too many vertices!");
    assert(
      newNumPrim <= handle.reserved.maxPrimNum,
      "Too many triangles/primatives!"
    );
    // TODO(@darzu): what to do about this requirement...
    assert(
      !m.quad.length || m.tri.length % 2 === 0,
      `tri.length not even for ${m.dbgName}`
    );

    handle.primNum = newNumPrim;
    handle.vertNum = newNumVert;
  }

  function updateUniform(m: MeshHandle, d: CyToTS<U>): void {
    pool.unis.queueUpdate(d, m.uniIdx);
    if (PERF_DBG_GPU) _stats._accumUniDataQueued += pool.unis.struct.size;
  }
  function queueEmptyUniform(m: MeshHandle): void {
    pool.unis.queueZeros(m.uniIdx, 1);
    if (PERF_DBG_GPU) _stats._accumUniDataQueued += pool.unis.struct.size;
  }

  logMeshPoolStats(pool);

  return pool;
}
