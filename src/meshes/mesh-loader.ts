import { EM } from "../ecs/ecs.js";
import { ComponentDef } from "../ecs/em-components.js";
import { ResourceDef } from "../ecs/em-resources.js";
import { V3, mat4, V, findAnyTmpVec } from "../matrix/sprig-matrix.js";
import { importObj, isParseError } from "./import-obj.js";
import {
  getAABBFromMesh,
  mergeMeshes,
  Mesh,
  normalizeMesh,
  RawMesh,
  transformMesh,
  transformRigging,
  validateMesh,
} from "./mesh.js";
import {
  AABB,
  getCenterFromAABB,
  getHalfsizeFromAABB,
} from "../physics/aabb.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { Renderer } from "../render/renderer-ecs.js";
import { Intersect, assert, isString, toRecord } from "../utils/util.js";
import { never } from "../utils/util-no-import.js";
import { getBytes, getText } from "../web/webget.js";
import { AABBCollider } from "../physics/collider.js";
import { farthestPointInDir, SupportFn } from "../utils/utils-3d.js";
import { MeshHandle, MeshPool, MeshReserve } from "../render/mesh-pool.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { importGltf } from "./import-gltf.js";
import { DBG_CHECK_FOR_TMPS_IN_XY } from "../flags.js";
import { CyMeshPoolPtr } from "../render/gpu-registry.js";
import { meshPoolPtr } from "../render/pipelines/std-scene.js";

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

export type MeshDesc<N extends string = string, B extends boolean = false> = {
  name: N;
  data: string | (() => RawMesh);
  transform?: mat4;
  // TODO(@darzu): remove? deprecate somehow? save back out to assets?
  // TODO(@darzu): basis transform should be restricted to mat3? Or something more compact since it's just 1s and 0s and it's orthonormalized
  transformBasis?: mat4;
  modify?: (m: RawMesh) => RawMesh;
  pool?: CyMeshPoolPtr<any, any>;
} & (B extends true ? { multi: true } : {});

function isMultiMeshDesc<N extends string, B extends boolean>(
  desc: MeshDesc<N, B>
): desc is MeshDesc<N, true> {
  return (desc as MeshDesc<N, true>).multi;
}

export function isMeshReg(r: any): r is MeshReg {
  return !!(r as MeshReg).desc && typeof (r as MeshReg).desc.name === "string";
}

export interface MeshReg<N extends string = string> {
  desc: MeshDesc<N, false>;
  def: ResourceDef<`mesh_${N}`, GameMesh, [GameMesh]>;
  gameMesh: () => Promise<GameMesh>;
  gameMeshNow: () => GameMesh | undefined;
}
export interface MeshGroupReg<N extends string = string> {
  desc: MeshDesc<N, true>;
  def: ResourceDef<`mesh_${N}`, GameMesh[], [GameMesh[]]>;
  gameMeshes: () => Promise<GameMesh[]>;
  gameMeshesNow: () => GameMesh[] | undefined;
}
export type MeshOrGroupReg<N extends string = string> =
  | MeshReg<N>
  | MeshGroupReg<N>;

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
> = ResourceDef<N, MeshSet<MR>, [MeshSet<MR>]>;

// TODO(@darzu): PERF. "ocean" and "ship_fangs" are expensive to load and aren't needed in all games.

// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const blackoutColor: (m: RawMesh) => RawMesh = (m: RawMesh) => {
  m.colors.map((c) => V3.zero(c));
  return m;
};

export type GameMesh = {
  mesh: Mesh;
  aabb: AABB;
  center: V3;
  halfsize: V3;
  // TODO(@darzu): remove dependency on MeshHandleStd
  proto: MeshHandle;
  uniqueVerts: V3[];
  support: SupportFn;
  mkAabbCollider: (solid: boolean) => AABBCollider;
};

// Xylem is our art asset management system
// "Xylem moves water and mineral ions in the plant" - wikipedia
// TODO(@darzu): Generalize for other asset types (sound, shaders?, )
export type XyRegistry = ReturnType<typeof createXylemRegistry>;
export const XY: XyRegistry = createXylemRegistry();
(globalThis as any).XY = XY; // for debugging only
function createXylemRegistry() {
  const loadedMeshes = new Map<string, GameMesh | GameMesh[]>();
  const loadingMeshes = new Map<string, Promise<GameMesh | GameMesh[]>>();

  const allMeshRegistrations: MeshOrGroupReg[] = [];

  async function cachedLoadMeshDesc(
    desc: MeshDesc,
    renderer?: Renderer
  ): Promise<GameMesh | GameMesh[]> {
    let result = loadingMeshes.get(desc.name);
    if (result) return result;
    result = new Promise(async (resolve) => {
      if (!renderer) {
        // TODO(@darzu): track these? Better to load stuff through mesh sets?
        renderer = (await EM.whenResources(RendererDef)).renderer.renderer;
      }
      const done = await internalLoadMeshDesc(desc, renderer);
      loadedMeshes.set(desc.name, done);
      resolve(done);
    });
    loadingMeshes.set(desc.name, result);
    return result;
  }

  function registerMesh<N extends string, B extends true>(
    desc: MeshDesc<N, B>
  ): MeshGroupReg<N>;
  function registerMesh<N extends string, B extends false>(
    desc: MeshDesc<N, B>
  ): MeshReg<N>;
  function registerMesh<N extends string, B extends boolean>(
    desc: MeshDesc<N, B>
  ): MeshGroupReg<N> | MeshReg<N> {
    const def = EM.defineResource(
      `mesh_${desc.name}`,
      (gm: GameMesh | GameMesh[]) => gm
    );
    EM.addLazyInit([RendererDef], [def], async ({ renderer }) => {
      const gm = await cachedLoadMeshDesc(desc, renderer.renderer);
      EM.addResource(def, gm);
    });

    if (isMultiMeshDesc(desc)) {
      let reg: MeshGroupReg<N> = {
        desc,
        def: def as ResourceDef<`mesh_${N}`, GameMesh[], [GameMesh[]]>,
        gameMeshes: () => cachedLoadMeshDesc(desc) as Promise<GameMesh[]>,
        gameMeshesNow: () =>
          loadedMeshes.get(desc.name) as GameMesh[] | undefined,
      };
      allMeshRegistrations.push(reg);
      return reg;
    } else {
      let reg: MeshReg<N> = {
        desc,
        def: def as ResourceDef<`mesh_${N}`, GameMesh, [GameMesh]>,
        gameMesh: () => cachedLoadMeshDesc(desc) as Promise<GameMesh>,
        gameMeshNow: () => loadedMeshes.get(desc.name) as GameMesh | undefined,
      };
      allMeshRegistrations.push(reg);
      return reg;
    }
  }

  async function loadMeshSet<MR extends (MeshReg | MeshGroupReg)[]>(
    meshes: MR,
    renderer: Renderer
  ): Promise<MeshSet<MR>> {
    if (DBG_CHECK_FOR_TMPS_IN_XY) {
      let found = findAnyTmpVec(meshes);
      if (found) {
        console.error(
          `Found temp vec(s) in mesh registrations! Path:\nmeshes${found}`
        );
        console.log("meshes:");
        console.dir(meshes);
      }
    }

    let promises = meshes.map((m) => {
      return cachedLoadMeshDesc(m.desc, renderer);
    });

    const done = await Promise.all(promises);

    const result = toRecord(
      meshes,
      (m) => m.desc.name,
      (_, i) => done[i]
    );

    return result as MeshSet<MR>;
  }

  function defineMeshSetResource<N extends string, MR extends MeshOrGroupReg[]>(
    name: N,
    ...meshes: MR
  ): MeshSetDef<N, MR> {
    const def = EM.defineResource(name, (mr: MeshSet<MR>) => mr);

    let initReg = EM.addLazyInit([RendererDef], [def], async ({ renderer }) => {
      const before = performance.now();
      const gameMeshes = await loadMeshSet(meshes, renderer.renderer);
      EM.addResource(def, gameMeshes);
      console.log(
        `loading mesh set '${def.name}' took ${(
          performance.now() - before
        ).toFixed(2)}ms`
      );
    });
    // TODO(@darzu): DBG
    if (def.name === "allMeshes") {
      console.log(`allMeshes init: #${initReg.id}`);
    }

    return def;
  }

  function _ensureLoadingMesh(desc: MeshDesc) {
    return cachedLoadMeshDesc(desc);
  }

  return {
    registerMesh,
    defineMeshSetResource,

    // TODO(@darzu): Abstraction. I'm not sure we want to expose these:
    _allMeshRegistrations: allMeshRegistrations,
    _loadMeshSet: loadMeshSet,
    _loadedMeshes: loadedMeshes,
    _ensureLoadingMesh,
  };
}

async function internalLoadMeshDesc(
  desc: MeshDesc,
  renderer: Renderer
): Promise<GameMesh | GameMesh[]> {
  if (isMultiMeshDesc(desc)) {
    assert(isString(desc.data), `TODO: support local multi-meshes`);
    const raw = await loadMeshSetInternal(desc.data);
    const processed = raw.map((m) => processMesh(desc, m));
    const game = processed.map((m) =>
      gameMeshFromMesh(m, renderer!, undefined, desc.pool)
    );
    return game;
  } else {
    let raw: RawMesh;
    if (isString(desc.data)) {
      raw = await loadMeshInternal(desc.data);
    } else {
      raw = desc.data();
    }
    const processed = processMesh(desc, raw);
    const game = gameMeshFromMesh(processed, renderer!, undefined, desc.pool);
    return game;
  }
}

function processMesh(desc: MeshDesc, m: RawMesh): RawMesh {
  // TODO(@darzu): UP_Z: try doing in-place update after everything else works.
  // TODO(@darzu): PERF! This should probably in-place update the mesh.
  if (desc.transform || desc.transformBasis)
    m.pos = m.pos.map((v) => V3.clone(v));
  if (desc.transform) {
    m.pos.forEach((v) => V3.tMat4(v, desc.transform!, v));
    // TODO(@darzu): transformRigging()?
  }
  if (desc.modify) {
    m = desc.modify(m);
    // TODO(@darzu): transformRigging()?
  }
  if (desc.transformBasis) {
    m.pos.forEach((v) => V3.tMat4(v, desc.transformBasis!, v));
    if (m.rigging) transformRigging(m.rigging, desc.transformBasis);
  }
  if (!m.dbgName) m.dbgName = desc.name;
  return m;
}

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

export function gameMeshFromMesh(
  rawMesh: RawMesh,
  renderer: Renderer,
  reserve?: MeshReserve,
  poolPtr?: CyMeshPoolPtr<any, any>
): GameMesh {
  validateMesh(rawMesh);
  const mesh = normalizeMesh(rawMesh);
  const aabb = getAABBFromMesh(mesh);
  const center = getCenterFromAABB(aabb, V3.mk());
  const halfsize = getHalfsizeFromAABB(aabb, V3.mk());
  // TODO(@darzu): LINES. add mesh to line pool too??
  const pool = poolPtr ? renderer.getCyResource(poolPtr)! : renderer.stdPool;
  const proto = pool.addMesh(mesh, reserve);
  const uniqueVerts = getUniqueVerts(mesh);
  const support = (d: V3) => farthestPointInDir(uniqueVerts, d);
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

function getUniqueVerts(mesh: RawMesh): V3[] {
  const res: V3[] = [];
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
