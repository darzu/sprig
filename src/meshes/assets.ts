import { Component, EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { importObj, isParseError } from "./import-obj.js";
import {
  cloneMesh,
  getAABBFromMesh,
  getMeshAsGrid,
  mapMeshPositions,
  mergeMeshes,
  Mesh,
  normalizeMesh,
  RawMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
  validateMesh,
} from "./mesh.js";
import {
  AABB,
  getCenterFromAABB,
  getHalfsizeFromAABB,
} from "../physics/aabb.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { Renderer } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { objMap, range } from "../utils/util.js";
import { getBytes, getText } from "../fetch/webget.js";
import { AABBCollider } from "../physics/collider.js";
import {
  computeTriangleNormal,
  farthestPointInDir,
  normalizeVec2s,
  randNormalPosVec3,
  SupportFn,
  uintToVec3unorm,
  vec3Reverse,
  vec4Reverse,
} from "../utils/utils-3d.js";
import { MeshHandle, MeshReserve } from "../render/mesh-pool.js";
import { onInit } from "../init.js";
import { jitter, mathMap, max, min } from "../utils/math.js";
import { VERBOSE_LOG } from "../flags.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  debugBoardSystem,
  getBoardsFromMesh,
  unshareProvokingForWood,
  WoodAssets,
  WoodAssetsDef,
} from "../wood/wood.js";
import { tempMat4, tempVec3 } from "../matrix/temp-pool.js";
import {
  BOAT_MESH,
  BULLET_MESH,
  createRudderMesh,
  CUBE_MESH,
  DBG_FABRIC,
  GRID_PLANE_MESH,
  HEX_MESH,
  makePlaneMesh,
  makeSailMesh,
  mkHalfEdgeQuadMesh,
  mkOctogonMesh,
  mkTimberSplinterEnd,
  SHIP_OFFSET,
  TETRA_MESH,
  TRI_FENCE,
} from "./primatives.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { importGltf } from "./import-gltf.js";

// TODO: load these via streaming
// TODO(@darzu): it's really bad that all these assets are loaded for each game

export const BLACK = V(0, 0, 0);
export const DARK_GRAY = V(0.02, 0.02, 0.02);
export const LIGHT_GRAY = V(0.2, 0.2, 0.2);
export const DARK_BLUE = V(0.03, 0.03, 0.2);
export const LIGHT_BLUE = V(0.05, 0.05, 0.2);

const DEFAULT_ASSET_PATH = "assets/";
const BACKUP_ASSET_PATH = "https://sprig.land/assets/";

const RemoteMeshes = {
  ship: "barge.sprig.obj",
  ship_small: "player_ship_small.sprig.obj",
  ship_fangs: "enemy_ship_fangs.sprig.obj",
  // ship_fangs: "ball.sprig.obj", // TODO: FOR PERF
  ball: "ball.sprig.obj",
  pick: "pick.sprig.obj",
  spaceore: "spaceore.sprig.obj",
  spacerock: "spacerock.sprig.obj",
  ammunitionBox: "ammunition_box.sprig.obj",
  linstock: "linstock.sprig.obj",
  cannon: "cannon_simple.sprig.obj",
  ld51_cannon: "ld51_cannon.sprig.obj",
  grappleHook: "grapple-hook.sprig.obj",
  grappleGun: "grapple-gun.sprig.obj",
  grappleGunUnloaded: "grapple-gun-unloaded.sprig.obj",
  rudder: "rudder.sprig.obj",
  // TODO(@darzu): including hyperspace-ocean makes load time ~100ms slower :/
  ocean: "hyperspace-ocean.sprig.obj",
  pirate: "pirate.glb",
  // ocean: "ball.sprig.obj", // TODO: FOR PERF
} as const;

type RemoteMeshSymbols = keyof typeof RemoteMeshes;

const RemoteMesheSets = {
  // TODO(@darzu): both of these are doing "cell fracture" in Blender
  //    than exporting into here. It'd be great if sprigland could
  //    natively do cell fracture b/c there
  //    is a lot of translate/scale alignment issues when we have
  //    a base model and a fractured model. Very hard to make changes.
  // TODO(@darzu): enemy broken parts doesn't seem to work rn. probably rename related
  boat_broken: "boat_broken.sprig.obj",
  ship_broken: "barge1_broken.sprig.obj",
  ball_broken: "ball_broken6.sprig.obj",
} as const;

type RemoteMeshSetSymbols = keyof typeof RemoteMesheSets;

export type AllMeshSymbols =
  | RemoteMeshSymbols
  | RemoteMeshSetSymbols
  | LocalMeshSymbols;

const MeshTransforms: Partial<{
  [P in AllMeshSymbols]: mat4;
}> = {
  cannon: mat4.fromYRotation(-Math.PI / 2, mat4.create()),
  linstock: mat4.fromScaling([0.1, 0.1, 0.1], mat4.create()),
  // ship: mat4.fromScaling(mat4.create(), [3, 3, 3]),
  // ship_broken: mat4.fromScaling(mat4.create(), [3, 3, 3]),
  spacerock: mat4.fromScaling([1.5, 1.5, 1.5], mat4.create()),
  grappleGun: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
  grappleGunUnloaded: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
  grappleHook: mat4.fromScaling([0.5, 0.5, 0.5], mat4.create()),
  rudder: mat4.translate(
    mat4.fromYRotation(-Math.PI * 0.5, mat4.create()),
    V(-5, 0, 0),
    mat4.create()
  ),
  ocean: mat4.fromScaling([2, 2, 2], mat4.create()),
  ship_fangs: mat4.fromScaling([3, 3, 3], mat4.create()),
  ship_small: mat4.fromRotationTranslationScaleOrigin(
    quat.IDENTITY,
    [0, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
    mat4.create()
  ),
  ld51_cannon: mat4.fromRotationTranslationScale(
    quat.rotateX(quat.IDENTITY, Math.PI * -0.5, quat.create()),
    [0, 0, 0],
    // [0.8, 0.8, 0.8], // LD51 size
    [1.2, 1.2, 1.2],
    mat4.create()
  ),
  // TODO(@darzu): FOR LD53
  ball: mat4.fromScaling([2, 2, 2]),
  // ball_broken: mat4.fromScaling([2, 2, 2]),
};

// TODO(@darzu): PERF. "ocean" and "ship_fangs" are expensive to load and aren't needed in all games.

// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const blackoutColor: (m: RawMesh) => RawMesh = (m: RawMesh) => {
  m.colors.map((c) => vec3.zero(c));
  return m;
};

const MeshModify: Partial<{
  [P in AllMeshSymbols]: (m: RawMesh) => RawMesh;
}> = {
  ship_fangs: (m) => {
    // if ("true") return m; // TODO(@darzu): FOR PERF

    // m.colors = m.colors.map((c) => [0.2, 0.2, 0.2]);
    m.surfaceIds = m.colors.map((_, i) => i);
    // console.log(`
    // Fang ship has:
    // ${m.tri.length} tris
    // ${m.quad.length} quads
    // `);

    // m = debugBoardSystem(m);

    // TODO(@darzu): call getBoardsFromMesh,
    //    then move this data into some resource to be accessed later in an entities lifecycle
    const woodState = getBoardsFromMesh(m);

    unshareProvokingForWood(m, woodState);

    const woodAssets: WoodAssets =
      EM.getResource(WoodAssetsDef) ?? EM.addResource(WoodAssetsDef);

    woodAssets["ship_fangs"] = woodState;

    return m;
  },
  // timber_rib: (m) => {
  //   // TODO(@darzu): de-duplicate w/ fang ship above
  //   m.surfaceIds = m.colors.map((_, i) => i);

  //   const woodState = getBoardsFromMesh(m);

  //   unshareProvokingForWood(m, woodState);

  //   const woodAssets: WoodAssets =
  //     EM.getResource(WoodAssetsDef) ?? EM.addResource(WoodAssetsDef);

  //   woodAssets["timber_rib"] = woodState;

  //   return m;
  // },
  cannon: (m) => {
    m.colors = m.colors.map((c) => V(0.2, 0.2, 0.2));
    return m;
  },
  spacerock: (m) => {
    m.colors = m.colors.map((c) => V(0.05, 0.15, 0.2));
    const t = mat4.fromYRotation(Math.PI * 0.2, mat4.create());
    transformMesh(m, t);
    m.lines = [];
    return m;
  },
  // cube: blackoutColor,
  // ship: blackoutColor,
  // ball: blackoutColor,
  // enemyShip_broken: blackoutColor,
  ship: (m) => {
    m.lines = [];
    scaleMesh(m, 3);
    return m;
  },
  ship_broken: (m) => {
    m.lines = [];
    m.pos = m.pos.map((p) => vec3.sub(p, SHIP_OFFSET, vec3.create()));
    scaleMesh(m, 3);
    return m;
  },
  ocean: (m) => {
    // if ("true") return m; // TODO(@darzu): FOR PERF
    // TODO(@darzu): extract out all this setUV stuff.
    // reduce duplicate positions
    // console.log("OCEAN");
    // console.dir(m);
    // m = deduplicateVertices(m);
    // console.dir(m);

    // TODO(@darzu): do we want convexity highlighting on the ocean?
    m.surfaceIds = m.quad.map((_, i) => i);
    // TODO(@darzu): generate UVs for the ocean
    const minX = m.pos.reduce((p, n) => (n[0] < p ? n[0] : p), Infinity);
    const maxX = m.pos.reduce((p, n) => (n[0] > p ? n[0] : p), -Infinity);
    const minZ = m.pos.reduce((p, n) => (n[2] < p ? n[2] : p), Infinity);
    const maxZ = m.pos.reduce((p, n) => (n[2] > p ? n[2] : p), -Infinity);
    // m.uvs = m.pos.map(
    //   (p, i) =>
    //     vec2.fromValues(
    //       mathMap(p[0], minX, maxX, 0, 1),
    //       mathMap(p[2], minZ, maxZ, 0, 1)
    //     )
    //   // vec2.fromValues(i / m.pos.length, 0)
    //   // vec2.fromValues(0.5, 0.5)
    // );

    // TODO(@darzu): DBG
    // try {
    //   console.log("getMeshAsGrid(ocean)");
    const { coords, grid } = getMeshAsGrid(m);
    //   console.log("getMeshAsGrid success!");
    // } catch (e) {
    //   console.log("getMeshAsGrid failed!");
    //   console.error(e);
    // }
    const xLen = grid.length;
    const yLen = grid[0].length;

    // TODO(@darzu): I forgot why we want this? From https://github.com/darzu/sprig/pull/59
    // redo quad indices based on the grid (optional?)
    for (let xi = 0; xi < xLen - 1; xi++) {
      for (let yi = 0; yi < yLen - 1; yi++) {
        const qi = gridXYtoQuad(xi, yi);
        vec4.copy(m.quad[qi], [
          grid[xi][yi],
          grid[xi + 1][yi],
          grid[xi + 1][yi + 1],
          grid[xi][yi + 1],
        ]);
      }
    }
    function gridXYtoQuad(xi: number, yi: number): number {
      const qi = yi + xi * (yLen - 1);
      assert(qi < m.quad.length, "quads and grid mismatch!");
      return qi;
    }

    // console.log(`xLen:${xLen},yLen:${yLen}`);
    const uvs = m.pos.map((_, vi) => vec2.create());
    m.uvs = uvs;
    // setUV(Math.floor(xLen / 2), 0, [0, 1], [0, 0], true);
    setUV(
      0,
      Math.floor(yLen / 2),
      vec2.clone([1, 0]),
      vec2.clone([0, 0]),
      true
    );
    // TODO(@darzu): lots of little annoying issues happen when you go right to the texture edge
    normalizeVec2s(uvs, 0 + 0.01, 1 - 0.01);

    // TODO: should we compute tangents (and normals!) per vertex
    // instead of per quad, for vertex displacement (e.g. waves)
    // purposes?

    //set tangents
    m.tangents = m.pos.map(() => vec3.create());
    m.normals = m.pos.map(() => vec3.create());
    for (let xIndex = 0; xIndex < grid.length; xIndex++) {
      for (let yIndex = 0; yIndex < grid[0].length; yIndex++) {
        let normal: vec3;
        let tangent: vec3;
        if (xIndex + 1 < grid.length && yIndex + 1 < grid[0].length) {
          const pos = m.pos[grid[xIndex][yIndex]];
          const posNX = m.pos[grid[xIndex + 1][yIndex]];
          const posNY = m.pos[grid[xIndex][yIndex + 1]];

          normal = computeTriangleNormal(pos, posNX, posNY, vec3.create());

          tangent = vec3.sub(posNX, pos, m.tangents[grid[xIndex][yIndex]]);
          vec3.normalize(tangent, tangent);
        } else if (xIndex + 1 >= grid.length) {
          normal = m.normals[grid[xIndex - 1][yIndex]];
          tangent = m.tangents[grid[xIndex - 1][yIndex]];
        } else if (yIndex + 1 >= grid[0].length) {
          normal = m.normals[grid[xIndex][yIndex - 1]];
          tangent = m.tangents[grid[xIndex][yIndex - 1]];
        } else {
          assert(false);
        }
        vec3.copy(m.normals[grid[xIndex][yIndex]], normal);
        vec3.copy(m.tangents[grid[xIndex][yIndex]], tangent);
      }
    }

    // console.dir(uvs);
    // console.log(`
    // X:
    // ${max(uvs.map((uv) => uv[0]))}
    // ${min(uvs.map((uv) => uv[0]))}
    // Y:
    // ${max(uvs.map((uv) => uv[1]))}
    // ${min(uvs.map((uv) => uv[1]))}
    // `);

    function setUV(
      x: number,
      y: number,
      dir: vec2,
      currDist: vec2,
      branch: boolean
    ) {
      // console.log(`setUV ${x} ${y} ${dir} ${currDist} ${branch}`);
      // set this UV
      const vi = grid[x][y];
      vec2.copy(uvs[vi], currDist);

      // branch?
      if (branch) {
        setUV(x, y, vec2.clone([dir[1], dir[0]]), currDist, false);
        setUV(x, y, vec2.clone([-dir[1], -dir[0]]), currDist, false);
      }

      // continue forward?
      const nX = x + dir[0];
      const nY = y + dir[1];
      if (nX < 0 || xLen <= nX || nY < 0 || yLen <= nY) return;
      const nVi = grid[nX][nY];
      const delta = vec3.dist(m.pos[vi], m.pos[nVi]);
      const newDist: vec2 = vec2.clone([
        currDist[0] + dir[0] * delta,
        currDist[1] + dir[1] * delta,
      ]);
      setUV(nX, nY, dir, newDist, branch);
    }
    // console.dir({
    //   uvMin: [min(m.uvs.map((a) => a[0])), min(m.uvs.map((a) => a[1]))],
    //   uvMax: [max(m.uvs.map((a) => a[0])), max(m.uvs.map((a) => a[1]))],
    // });

    // console.dir(m.uvs);
    // console.dir({ minX, maxX, minZ, maxZ });
    return m;
  },
};

export const LocalMeshes = {
  cube: () => CUBE_MESH,
  unitCube: () => {
    const unitCube = cloneMesh(CUBE_MESH);
    unitCube.dbgName = "unitCube";
    // normalize this cube to have min at 0,0,0 and max at 1,1,1
    unitCube.pos.forEach((p) => {
      p[0] = p[0] < 0 ? 0 : 1;
      p[1] = p[1] < 0 ? 0 : 1;
      p[2] = p[2] < 0 ? 0 : 1;
    });
    return unitCube;
  },
  plane: () => makePlaneMesh(-10, 10, -10, 10),
  tetra: () => TETRA_MESH,
  he_octo: mkOctogonMesh,
  he_quad: mkHalfEdgeQuadMesh,
  hex: HEX_MESH,
  enemyShip: () => BOAT_MESH,
  bullet: () => BULLET_MESH,
  gridPlane: () => GRID_PLANE_MESH,
  fabric: () => DBG_FABRIC,
  triFence: TRI_FENCE,
  // TODO(@darzu): wire cube is kinda broken; needs line renderer
  wireCube: () =>
    ({ ...CUBE_MESH, tri: [], colors: [], dbgName: "wireCube" } as RawMesh),
  mast: () => {
    let m = cloneMesh(CUBE_MESH);
    m.dbgName = "mast";
    mapMeshPositions(m, (p) => V(p[0], p[1] + 1, p[2]));
    scaleMesh3(m, V(0.5, 20, 0.5));
    return m;
  },
  ld53_cannon: () => {
    let m = cloneMesh(CUBE_MESH);
    m.dbgName = "ld53_cannon";
    scaleMesh3(m, V(8, 2, 2));
    return m;
  },
  sail: makeSailMesh,
  // timber_rib: mkTimberRib,
  timber_splinter: mkTimberSplinterEnd,
  gizmo: () => createGizmoMesh(),
  rudderPrim: () => createRudderMesh(),
} as const;

type LocalMeshSymbols = keyof typeof LocalMeshes;

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

type GameMeshes = { [P in RemoteMeshSymbols | LocalMeshSymbols]: GameMesh } & {
  [P in RemoteMeshSetSymbols]: GameMesh[];
};

const AssetLoaderDef = EM.defineComponent("assetLoader", () => {
  return {
    promise: null as Promise<GameMeshes> | null,
  };
});

export const AssetsDef = EM.defineComponent("assets", (meshes: GameMeshes) => {
  return meshes;
});
export type Assets = Component<typeof AssetsDef>;

onInit(async (em) => {
  em.addResource(AssetLoaderDef);

  // start loading of assets
  const { assetLoader, renderer } = await em.whenResources(
    AssetLoaderDef,
    RendererDef
  );
  assert(!assetLoader.promise, "somehow we're double loading assets");

  const assetsPromise = loadAssets(renderer.renderer);
  assetLoader.promise = assetsPromise;
  // TODO(@darzu): do we want this try-catch here? It just obscures errors.
  // try {
  const result = await assetsPromise;
  em.addResource(AssetsDef, result);
  // } catch (failureReason) {
  //   // TODO(@darzu): fail more gracefully
  //   throw `Failed to load assets: ${failureReason}`;
  // }
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
    console.dir(res);
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

async function loadAssets(renderer: Renderer): Promise<GameMeshes> {
  const start = performance.now();

  const singlePromises = objMap(RemoteMeshes, (p) => loadMeshInternal(p));
  const setPromises = objMap(RemoteMesheSets, (p) => loadMeshSetInternal(p));
  const singlesList = Object.entries(singlePromises);
  const singlesMeshList = await Promise.all(singlesList.map(([_, p]) => p));

  // TODO(@darzu): We need clearer asset processing stages. "processMesh", "meshModify", "gameMeshFromMesh", "normalizeMesh"
  const singleMeshes = objMap(singlePromises, (_, n) => {
    const idx = singlesList.findIndex(([n2, _]) => n === n2);
    let m = singlesMeshList[idx];
    return processMesh(n, m);
  });

  const localMeshes = objMap(LocalMeshes, (m, n) => {
    return processMesh(n, m());
  });

  const setsList = Object.entries(setPromises);
  const setsMeshList = await Promise.all(setsList.map(([_, p]) => p));
  const setMeshes = objMap(setPromises, (_, n) => {
    const idx = setsList.findIndex(([n2, _]) => n === n2);
    let ms = setsMeshList[idx];
    return ms.map((m) => processMesh(n, m));
  });

  function processMesh(n: AllMeshSymbols, m: RawMesh): RawMesh {
    const t1 = MeshTransforms[n];
    if (t1) transformMesh(m, t1);
    const t2 = MeshModify[n];
    if (t2) m = t2(m);
    if (!m.dbgName) m.dbgName = n;
    return m;
  }

  const allSingleMeshes = { ...singleMeshes, ...localMeshes };

  // TODO(@darzu): this shouldn't directly add to a mesh pool, we don't know which pool it should
  //  go to
  const allSingleAssets = objMap(allSingleMeshes, (m) =>
    gameMeshFromMesh(m, renderer)
  );
  const allSetAssets = objMap(setMeshes, (ms, n) =>
    ms.map((m) => gameMeshFromMesh(m, renderer))
  );

  // console.log("allSingleAssets.ocean.mesh");
  // console.dir(allSingleAssets.ocean.mesh);

  const result = { ...allSingleAssets, ...allSetAssets };

  // perf tracking
  const elapsed = performance.now() - start;
  if (VERBOSE_LOG) console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  return result;
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
