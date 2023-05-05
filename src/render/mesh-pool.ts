import { align, alignDown } from "../math.js";
import { assert, assertDbg, dbgLogOnce } from "../util.js";
import { CyStructDesc, CyToTS } from "./gpu-struct.js";
import { Mesh } from "../meshes/mesh.js";
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
} from "./gpu-registry.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { DEFAULT_MASK } from "./pipeline-masks.js";
import { ComponentDef } from "../ecs/entity-manager.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";
import { CyResources } from "./instantiator-webgpu.js";

// Mesh: lossless, all the data of a model/asset from blender
// MeshPool: lossy, a reduced set of attributes for vertex, line, triangle, and model uniforms

const vertsPerTri = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * vertsPerTri;
const bytesPerLine = Uint16Array.BYTES_PER_ELEMENT * 2;
export const MAX_INDICES = 65535; // Since we're using u16 index type, this is our max indices count

// TODO(@darzu): rename?
export interface MeshReserve {
  readonly maxVertNum: number;
  readonly maxTriNum: number;
  readonly maxLineNum: number;
}

export interface MeshHandle {
  // mesh id
  readonly mId: number;

  // geo offsets
  readonly setIdx: number;
  readonly uniIdx: number;
  readonly vertIdx: number;
  readonly triIdx: number;
  readonly lineIdx: number;

  // geo lengths
  // NOTE: only changable if ".reserved" is set.
  vertNum: number;
  // NOTE: triIdx must always be 4-byte aligned
  triNum: number;
  lineNum: number;

  // optional extra reserved geo space
  readonly reserved?: MeshReserve;

  // NOTE: changes to this mesh must by manually synced to the
  //  MeshPool & GPU via updateMeshVertices and friends.
  readonly mesh?: Mesh;

  // state
  mask: number; // used for selecting which render pipelines to particpate in
  //shaderData: CyToTS<U>; // used as the uniform for this mesh
}

export function isMeshHandle(m: any): m is MeshHandle {
  return "mId" in m;
}

function createMeshPoolDbgStats() {
  return {
    _accumTriDataQueued: 0,
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
  const maxTris = pool.sets.length * pool.ptr.setMaxTris;
  const maxVerts = pool.sets.length * pool.ptr.setMaxVerts;
  // const maxLines = opts.lineInds.length / 2;
  const maxLines = pool.sets.length * pool.ptr.setMaxLines;
  const vertStruct = pool.ptr.vertsStruct;
  const uniStruct = pool.ptr.unisStruct;

  // if (MAX_INDICES < maxVerts)
  //   throw `Too many vertices (${maxVerts})! W/ Uint16, we can only support '${maxVerts}' verts`;

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
    numTris: number;
    numVerts: number;
    numLines: number;
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
    const indsPtr = CY.createIdxBuf(indsName(idx), {
      init: ptr.setMaxTris * 3, // TODO(@darzu): alignment?
    });
    const inds = createCyIdxBuf(device, indsPtr.name, ptr.setMaxTris * 3);
    resources.kindToNameToRes.idxBuffer[indsPtr.name] = inds;
    return {
      vertsPtr,
      verts,
      indsPtr,
      inds,
      numTris: 0,
      numVerts: 0,
      numLines: 0,
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
    updateMeshTriangles,
    updateMeshQuads,
    updateMeshSize,
    updateMeshInstance,
  };

  function addMesh(m: Mesh, reserved?: MeshReserve): MeshHandle {
    // TODO(@darzu): handle fragmentation! Right now we always try to add
    //    to latest set

    // check mesh count
    const uniIdx = getTotalMeshCount();
    assert(uniIdx + 1 <= ptr.maxMeshes, "Too many meshes!!");

    // determine this size
    const _vertNum = m.pos.length;
    const vertNum = reserved?.maxVertNum ?? _vertNum;
    const _triNum = m.tri.length + m.quad.length * 2;
    const triNum = reserved?.maxTriNum ?? _triNum;
    const _lineNum = m.lines?.length ?? 0;
    const lineNum = reserved?.maxLineNum ?? _lineNum;
    assert(_vertNum <= vertNum, "Inconsistent num of vertices!");
    assert(_triNum <= triNum, "Inconsistent num of triangles!");
    assert(_lineNum <= lineNum, "Inconsistent num of lines!");

    // check integrity
    assert(m.usesProvoking, `mesh must use provoking vertices`);
    // TODO(@darzu): what to do about this requirement...
    assert(
      !m.quad.length || m.tri.length % 2 === 0,
      `tri.length not even for ${m.dbgName}`
    );
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
    assertDbg(pool.sets[currSetIdx].numTris % 2 === 0, "alignment");

    // check if theoretically fit in any set
    assert(vertNum <= ptr.setMaxVerts, `Too many vertices!! ${vertNum}`);
    assert(triNum <= ptr.setMaxTris, `Too many triangles!! ${triNum}`);
    assert(lineNum <= ptr.setMaxLines, `Too many lines!! ${lineNum}`);

    // check if we fit in the current set
    const doesFit =
      pool.sets[currSetIdx].numVerts + vertNum <= ptr.setMaxVerts &&
      pool.sets[currSetIdx].numTris + triNum <= ptr.setMaxTris &&
      pool.sets[currSetIdx].numLines + lineNum <= ptr.setMaxLines;

    // create a new set if needed
    if (!doesFit) pushNewBuffSet();
    const currSet = pool.sets[currSetIdx];

    const handle: MeshHandle = {
      mId: nextMeshId++,
      // enabled: true,
      triNum: _triNum,
      lineNum: _lineNum,
      vertNum: _vertNum,
      vertIdx: currSet.numVerts,
      triIdx: currSet.numTris,
      lineIdx: currSet.numLines,
      setIdx: currSetIdx,
      uniIdx,
      mesh: m,
      mask: DEFAULT_MASK,
      reserved,
      //shaderData: uni,
    };

    currSet.numTris += triNum;
    // NOTE: mesh's triangle start idx needs to be 4-byte aligned, and we start the
    currSet.numTris = align(currSet.numTris, 2);
    currSet.numLines += lineNum;
    currSet.numVerts += vertNum;
    currSet.meshes.push(handle);

    // submit data to GPU
    if (m.quad.length) updateMeshQuads(handle, m);
    if (m.tri.length) updateMeshTriangles(handle, m);
    if (m.pos.length) updateMeshVertices(handle, m);
    const uni = ptr.computeUniData(m);
    updateUniform(handle, uni);

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
  function updateMeshTriangles(
    handle: MeshHandle,
    newMesh: Mesh,
    triIdx?: number,
    triCount?: number
  ) {
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
    assertDbg(handle.triIdx % 2 === 0);
    const triData = computeTriData(newMesh, alignedTriIdx, alignedTriCount);
    assertDbg(triData.byteLength % 4 === 0, "alignment");
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(triData, (handle.triIdx + alignedTriIdx) * 3);
    if (PERF_DBG_GPU) _stats._accumTriDataQueued += triData.length * 2.0;
  }
  function updateMeshQuads(
    handle: MeshHandle,
    newMesh: Mesh,
    quadIdx?: number,
    quadCount?: number
  ) {
    quadIdx = quadIdx ?? 0;
    quadCount = quadCount ?? newMesh.quad.length;

    assertDbg(0 <= quadIdx && quadIdx + quadCount <= newMesh.quad.length);
    const quadData = computeQuadData(newMesh, quadIdx, quadCount);
    assertDbg(quadData.length % 2 === 0);

    const bufQuadIndsStart = align((handle.triIdx + newMesh.tri.length) * 3, 2); // NOTE: tris come first
    let bufQuadIdx = bufQuadIndsStart + quadIdx * 2 * 3;
    assertDbg(bufQuadIdx % 2 === 0);
    assertDbg(quadData.length % 2 === 0);
    const set = pool.sets[handle.setIdx];
    set.inds.queueUpdate(quadData, bufQuadIdx);
    if (PERF_DBG_GPU) _stats._accumTriDataQueued += quadData.byteLength;
  }

  function updateMeshSize(handle: MeshHandle, newMesh: Mesh) {
    const m = newMesh;

    assert(handle.reserved, "Must have .reserved to update MeshHandle's size");

    const newNumVert = m.pos.length;
    const newNumTri = m.tri.length + m.quad.length * 2;

    assert(newNumVert <= handle.reserved.maxVertNum, "Too many vertices!");
    assert(newNumTri <= handle.reserved.maxTriNum, "Too many triangles!");
    assert(
      (m.lines?.length ?? 0) <= handle.reserved.maxLineNum,
      `Too many lines! ${m.lines?.length} vs ${handle.reserved.maxLineNum}`
    );
    // TODO(@darzu): what to do about this requirement...
    assert(
      !m.quad.length || m.tri.length % 2 === 0,
      `tri.length not even for ${m.dbgName}`
    );

    handle.triNum = newNumTri;
    handle.lineNum = m.lines?.length ?? 0;
    handle.vertNum = newNumVert;
  }

  function updateUniform(m: MeshHandle, d: CyToTS<U>): void {
    pool.unis.queueUpdate(d, m.uniIdx);
    if (PERF_DBG_GPU) _stats._accumUniDataQueued += pool.unis.struct.size;
  }

  logMeshPoolStats(pool);

  return pool;
}
