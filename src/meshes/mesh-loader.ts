import { ComponentDef, EM } from "../ecs/entity-manager.js";
import { vec3, mat4, V } from "../matrix/sprig-matrix.js";
import { importObj, isParseError } from "./import-obj.js";
import {
  getAABBFromMesh,
  mergeMeshes,
  Mesh,
  normalizeMesh,
  RawMesh,
  validateMesh,
} from "./mesh.js";
import {
  AABB,
  getCenterFromAABB,
  getHalfsizeFromAABB,
} from "../physics/aabb.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { Renderer } from "../render/renderer-ecs.js";
import { Intersect, assert } from "../utils/util.js";
import { getBytes, getText } from "../fetch/webget.js";
import { AABBCollider } from "../physics/collider.js";
import { farthestPointInDir, SupportFn } from "../utils/utils-3d.js";
import { MeshHandle, MeshReserve } from "../render/mesh-pool.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { importGltf } from "./import-gltf.js";
import { AllMeshesDef, AllMeshes } from "./mesh-list.js";

// TODO: load these via streaming
// TODO(@darzu): it's really bad that all these assets are loaded for each game

// TODO(@darzu): perhaps the way to handle individualized asset loading is to
//   have a concept of "AssetSet"s that a game can define and await. So u can
//   either await each asset individually or u can declare an asset set custom
//   to ur game and then await that whole set (and probably stick it in a resource)
//   and once the whole thing is loaded u can then access the assets synchronously.
//   This is basically how it works now except that all assets are in one big set.
// TODO(@darzu): plan:
//    [ ] rename AssetsDef -> EverySingleAssetDef, implying shame
//    [ ] need a cache for all allMeshes. So individual loads or overlapping sets dont duplicate work
//    [ ] restructure it so each mesh has its path and transforms together

const DEFAULT_ASSET_PATH = "assets/";
const BACKUP_ASSET_PATH = "https://sprig.land/assets/";

export interface MeshDesc<N extends string> {
  name: N;
  data: string | (() => RawMesh);
  transform?: mat4;
  modify?: (m: RawMesh) => RawMesh;
}

export interface MeshReg<N extends string = string> {
  desc: MeshDesc<N>;
  gameMesh: () => Promise<GameMesh>;
  gameMeshNow: GameMesh | undefined;
}
export interface MeshGroupReg<N extends string = string> {
  desc: MeshDesc<N>;
  gameMeshes: () => Promise<GameMesh[]>;
  gameMeshesNow: GameMesh[] | undefined;
}

export function registerMesh<N extends string>(desc: MeshDesc<N>): MeshReg<N> {
  throw `TODO: impl`;
}
export function registerMeshGroup<N extends string>(
  desc: MeshDesc<N>
): MeshGroupReg<N> {
  throw `TODO: impl`;
}

// TODO(@darzu): is there a simpler way to type this?
export type MeshSet<MR extends (MeshReg | MeshGroupReg)[]> = Intersect<{
  [i in keyof MR]: MR[i] extends MeshReg<infer N>
    ? { readonly [_ in N]: GameMesh }
    : MR[i] extends MeshGroupReg<infer N>
    ? { readonly [_ in N]: GameMesh[] }
    : never;
}>;

export type MeshSetDef<
  N extends string,
  MR extends (MeshReg | MeshGroupReg)[]
> = ComponentDef<N, MeshSet<MR>, [MeshSet<MR>]>;

export function defineMeshSetResource<
  N extends string,
  MR extends (MeshReg | MeshGroupReg)[]
>(name: N, ...meshes: MR): MeshSetDef<N, MR> {
  throw `TODO: impl`;
}

// TODO(@darzu): PERF. "ocean" and "ship_fangs" are expensive to load and aren't needed in all games.

// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const blackoutColor: (m: RawMesh) => RawMesh = (m: RawMesh) => {
  m.colors.map((c) => vec3.zero(c));
  return m;
};

// TODO(@darzu): IMPL for WoodStateDef
// EM.addLazyInit([AssetsDef], [WoodStateDef], ({ allMeshes}) => {});

export type GameMesh = {
  mesh: Mesh;
  aabb: AABB;
  center: vec3;
  halfsize: vec3;
  // TODO(@darzu): remove dependency on MeshHandleStd
  proto: MeshHandle;
  uniqueVerts: vec3[];
  support: SupportFn;
  mkAabbCollider: (solid: boolean) => AABBCollider;
};

EM.addLazyInit([RendererDef], [AllMeshesDef], async ({ renderer }) => {
  const allMeshes = await loadAssets(renderer.renderer);
  EM.addResource(AllMeshesDef, allMeshes);
});

async function loadTxtInternal(relPath: string): Promise<string> {
  // download
  // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
  let txt;
  try {
    txt = await getText(DEFAULT_ASSET_PATH + relPath);
  } catch (_) {
    console.warn(
      `Asset path ${DEFAULT_ASSET_PATH + relPath} failed; trying ${
        BACKUP_ASSET_PATH + relPath
      }`
    );
    txt = await getText(BACKUP_ASSET_PATH + relPath);
  }

  return txt;
}

async function loadBytesInternal(relPath: string): Promise<ArrayBuffer> {
  // download
  // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
  let bytes;
  try {
    bytes = await getBytes(DEFAULT_ASSET_PATH + relPath);
  } catch (_) {
    console.warn(
      `Asset path ${DEFAULT_ASSET_PATH + relPath} failed; trying ${
        BACKUP_ASSET_PATH + relPath
      }`
    );
    bytes = await getBytes(BACKUP_ASSET_PATH + relPath);
  }

  return bytes;
}

async function loadMeshInternal(relPath: string): Promise<RawMesh> {
  const res = await loadMeshSetInternal(relPath);
  return mergeMeshes(...res);
}
async function loadMeshSetInternal(relPath: string): Promise<RawMesh[]> {
  // download
  if (relPath.endsWith(".glb")) {
    let bytes = await loadBytesInternal(relPath);
    const res = importGltf(bytes);
    // console.dir(res);
    assert(
      !!res && !isParseError(res),
      `unable to parse asset set (${relPath}):\n${res}`
    );
    return [res];
  }
  let txt = await loadTxtInternal(relPath);

  // parse
  // console.log(txt);
  const opt = importObj(txt);
  // console.log("importMultiObj");
  // console.dir(opt);
  assert(
    !!opt && !isParseError(opt),
    `unable to parse asset set (${relPath}):\n${opt}`
  );

  return opt;
}

async function loadAssets(renderer: Renderer): Promise<AllMeshes> {
  throw "TODO";

  // const start = performance.now();

  // const singlePromises = objMap(RemoteMeshes, (p) => loadMeshInternal(p));
  // const setPromises = objMap(RemoteMesheSets, (p) => loadMeshSetInternal(p));
  // const singlesList = Object.entries(singlePromises);
  // const singlesMeshList = await Promise.all(singlesList.map(([_, p]) => p));

  // // TODO(@darzu): We need clearer asset processing stages. "processMesh", "meshModify", "gameMeshFromMesh", "normalizeMesh"
  // const singleMeshes = objMap(singlePromises, (_, n) => {
  //   const idx = singlesList.findIndex(([n2, _]) => n === n2);
  //   let m = singlesMeshList[idx];
  //   return processMesh(n, m);
  // });

  // const localMeshes = objMap(LocalMeshes, (m, n) => {
  //   return processMesh(n, m());
  // });

  // const setsList = Object.entries(setPromises);
  // const setsMeshList = await Promise.all(setsList.map(([_, p]) => p));
  // const setMeshes = objMap(setPromises, (_, n) => {
  //   const idx = setsList.findIndex(([n2, _]) => n === n2);
  //   let ms = setsMeshList[idx];
  //   return ms.map((m) => processMesh(n, m));
  // });

  // function processMesh(n: AllMeshSymbols, m: RawMesh): RawMesh {
  //   const t1 = MeshTransforms[n];
  //   if (t1) transformMesh(m, t1);
  //   const t2 = MeshModify[n];
  //   if (t2) m = t2(m);
  //   if (!m.dbgName) m.dbgName = n;
  //   return m;
  // }

  // const allSingleMeshes = { ...singleMeshes, ...localMeshes };

  // // TODO(@darzu): this shouldn't directly add to a mesh pool, we don't know which pool it should
  // //  go to
  // const allSingleAssets = objMap(allSingleMeshes, (m) =>
  //   gameMeshFromMesh(m, renderer)
  // );
  // const allSetAssets = objMap(setMeshes, (ms, n) =>
  //   ms.map((m) => gameMeshFromMesh(m, renderer))
  // );

  // // console.log("allSingleAssets.ocean.mesh");
  // // console.dir(allSingleAssets.ocean.mesh);

  // const result = { ...allSingleAssets, ...allSetAssets };

  // // perf tracking
  // const elapsed = performance.now() - start;
  // if (VERBOSE_LOG)
  //   console.log(`took ${elapsed.toFixed(1)}ms to load allMeshes.`);

  // return result;
}

export function gameMeshFromMesh(
  rawMesh: RawMesh,
  renderer: Renderer,
  reserve?: MeshReserve
): GameMesh {
  validateMesh(rawMesh);
  const mesh = normalizeMesh(rawMesh);
  const aabb = getAABBFromMesh(mesh);
  const center = getCenterFromAABB(aabb);
  const halfsize = getHalfsizeFromAABB(aabb, vec3.create());
  const proto = renderer.stdPool.addMesh(mesh, reserve);
  const uniqueVerts = getUniqueVerts(mesh);
  const support = (d: vec3) => farthestPointInDir(uniqueVerts, d);
  const aabbCollider = (solid: boolean) =>
    ({
      shape: "AABB",
      solid,
      aabb,
    } as AABBCollider);
  return {
    mesh,
    aabb,
    center,
    halfsize,
    proto,
    uniqueVerts,
    support,
    mkAabbCollider: aabbCollider,
  };
}

function getUniqueVerts(mesh: RawMesh): vec3[] {
  const res: vec3[] = [];
  const seen: Set<string> = new Set();
  // TODO(@darzu): might we want to do approx equals?
  for (let v1 of mesh.pos) {
    const key = `${v1[0]}${v1[1]}${v1[2]}`;
    if (!seen.has(key)) {
      res.push(v1);
      seen.add(key);
    }
  }
  return res;
}
