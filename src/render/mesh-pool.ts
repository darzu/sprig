import { align } from "../math.js";
import { assert } from "../test.js";
import { CyStructDesc, CyToTS } from "./gpu-struct.js";
import { Mesh, quadToTris } from "./mesh.js";
import { CyArray, CyIdxBuffer } from "./data-webgpu.js";

// Mesh: lossless, all the data of a model/asset from blender
// MeshPool: lossy, a reduced set of attributes for vertex, line, triangle, and model uniforms

const vertsPerTri = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * vertsPerTri;
const bytesPerLine = Uint16Array.BYTES_PER_ELEMENT * 2;
const MAX_INDICES = 65535; // Since we're using u16 index type, this is our max indices count

export interface MeshHandle {
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

  // state
  mask: number; // used for selecting which render pipelines to particpate in
  //shaderData: CyToTS<U>; // used as the uniform for this mesh
}

export function isMeshHandle(m: any): m is MeshHandle {
  return "mId" in m;
}

export interface MeshPoolOpts<V extends CyStructDesc, U extends CyStructDesc> {
  computeVertsData: (m: Mesh) => CyToTS<V>[];
  computeUniData: (m: Mesh) => CyToTS<U>;
  verts: CyArray<V>;
  unis: CyArray<U>;
  triInds: CyIdxBuffer;
  lineInds: CyIdxBuffer;
  // TODO(@darzu): needed?
  shiftMeshIndices: boolean;
}

export interface MeshPool<V extends CyStructDesc, U extends CyStructDesc> {
  // options
  opts: MeshPoolOpts<V, U>;
  // data
  allMeshes: MeshHandle[];
  numTris: number;
  numVerts: number;
  numLines: number;
  // methods
  addMesh: (m: Mesh) => MeshHandle;
  addMeshInstance: (m: MeshHandle) => MeshHandle;
  updateUniform: (m: MeshHandle, d: CyToTS<U>) => void;
  updateMeshVertices: (handle: MeshHandle, newMeshData: Mesh) => void;
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

// TODO(@darzu): HACK. should be scoped; removed as global
let nextMeshId = 1;

export function createMeshPool<V extends CyStructDesc, U extends CyStructDesc>(
  opts: MeshPoolOpts<V, U>
): MeshPool<V, U> {
  logMeshPoolStats(opts);

  const maxMeshes = opts.unis.length;
  const maxTris = Math.ceil(opts.triInds.length / 3);
  const maxVerts = opts.verts.length;
  const maxLines = opts.lineInds.length / 2;

  const allMeshes: MeshHandle[] = [];

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

    const vertsData = opts.computeVertsData(m);
    const triData = new Uint16Array(align(numTri * 3, 2));
    // add tris
    m.tri.forEach((triInd, i) => {
      // TODO(@darzu): support index shifting
      triData.set(triInd, i * 3);
    });
    m.quad.forEach((quadInd, i) => {
      // TODO(@darzu): support index shifting
      const [t1, t2] = quadToTris(quadInd);
      triData.set(t1, m.tri.length * 3 + i * 6);
      triData.set(t2, m.tri.length * 3 + i * 6 + 3);
    });
    // add lines
    let lineData: Uint16Array | undefined;
    if (m.lines?.length) {
      lineData = new Uint16Array(m.lines.length * 2);
      m.lines.forEach((inds, i) => {
        lineData?.set(inds, i * 2);
      });
    }

    // initial uniform data
    const uni = opts.computeUniData(m);

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

    assert(triData.length % 2 === 0, "triData");
    opts.triInds.queueUpdate(triData, handle.triIdx * 3);
    if (lineData) opts.lineInds.queueUpdate(lineData, handle.lineIdx * 2);
    opts.verts.queueUpdates(vertsData, handle.vertIdx);
    opts.unis.queueUpdate(uni, handle.uniIdx);

    pool.numTris += numTri;
    // NOTE: mesh's triangles need to be 4-byte aligned.
    // TODO(@darzu): is this still necessary? might be handled by the CyBuffer stuff
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

  function updateMeshVertices(handle: MeshHandle, newMesh: Mesh) {
    const data = opts.computeVertsData(newMesh);
    opts.verts.queueUpdates(data, handle.vertIdx);
  }

  function updateUniform(m: MeshHandle, d: CyToTS<U>): void {
    opts.unis.queueUpdate(d, m.uniIdx);
  }

  return pool;
}
