import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { importObj, isParseError } from "../import_obj.js";
import {
  getAABBFromMesh,
  Mesh,
  scaleMesh,
  unshareProvokingVertices,
} from "../mesh-pool.js";
import { AABB } from "../phys_broadphase.js";
import { assert } from "../test.js";
import { objMap } from "../util.js";
import { getText } from "../webget.js";

export const BLACK = vec3.fromValues(0, 0, 0);
export const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
export const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
export const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
export const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);

const DEFAULT_ASSET_PATH = "/assets/";
const BACKUP_ASSET_PATH = "https://sprig.land/assets/";

const AllAssetPaths = {
  ship: "ship.sprig.obj",
  ball: "ball.sprig.obj",
  pick: "pick.sprig.obj",
  spaceore: "spaceore.sprig.obj",
  spacerock: "spacerock.sprig.obj",
  ammunitionBox: "ammunition_box.sprig.obj",
  linstock: "linstock.sprig.obj",
  cannon: "cannon.sprig.obj",
} as const;

type GameMeshes = { [P in keyof typeof AllAssetPaths]: Mesh };

const AssetLoaderDef = EM.defineComponent("assetLoader", () => {
  return {
    promise: null as Promise<GameMeshes> | null,
  };
});

export const AssetsDef = EM.defineComponent("assets", (meshes: GameMeshes) => {
  const aabbs = objMap(meshes, (m) => getAABBFromMesh(m));
  return {
    meshes,
    aabbs,
  };
});
export type Assets = Component<typeof AssetsDef>;

export function registerAssetLoader(em: EntityManager) {
  em.addSingletonComponent(AssetLoaderDef);

  // start loading of assets
  em.registerSystem(
    [],
    [AssetLoaderDef],
    (_, { assetLoader }) => {
      if (!assetLoader.promise) {
        const assetsPromise = loadAssets();
        assetLoader.promise = assetsPromise;
        assetsPromise.then(
          (result) => {
            em.addSingletonComponent(AssetsDef, result);
          },
          (failureReason) => {
            // TODO(@darzu): fail more gracefully
            throw `Failed to load assets: ${failureReason}`;
          }
        );
      }
    },
    "assetLoader"
  );
}

async function loadAssetInternal(relPath: string): Promise<Mesh> {
  // download
  // TODO(@darzu): perf: parallalize this
  // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
  let txt;
  try {
    txt = await getText(DEFAULT_ASSET_PATH + relPath);
  } catch (_) {
    txt = await getText(BACKUP_ASSET_PATH + relPath);
  }

  // parse
  const opt = importObj(txt);
  assert(
    !!opt && !isParseError(opt),
    `unable to parse asset (${relPath}):\n${opt}`
  );

  // clean up
  const obj = unshareProvokingVertices(opt);

  return obj;
}

async function loadAssets(): Promise<GameMeshes> {
  const start = performance.now();

  const allPromises = objMap(AllAssetPaths, (p) => loadAssetInternal(p));
  const allPromisesList = Object.entries(allPromises);
  const allMeshes = await Promise.all(allPromisesList.map(([_, p]) => p));

  const result = objMap(allPromises, (_, n) => {
    const idx = allPromisesList.findIndex(([n2, _]) => n === n2);
    return allMeshes[idx];
  });

  // perf tracking
  const elapsed = performance.now() - start;
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  return result;
}

// TODO(@darzu): move these into Assets component
export const CUBE_MESH = unshareProvokingVertices({
  pos: [
    [+1.0, +1.0, +1.0],
    [-1.0, +1.0, +1.0],
    [-1.0, -1.0, +1.0],
    [+1.0, -1.0, +1.0],

    [+1.0, +1.0, -1.0],
    [-1.0, +1.0, -1.0],
    [-1.0, -1.0, -1.0],
    [+1.0, -1.0, -1.0],
  ],
  tri: [
    [0, 1, 2],
    [0, 2, 3], // front
    [4, 5, 1],
    [4, 1, 0], // top
    [3, 4, 0],
    [3, 7, 4], // right
    [2, 1, 5],
    [2, 5, 6], // left
    [6, 3, 2],
    [6, 7, 3], // bottom
    [5, 4, 7],
    [5, 7, 6], // back
  ],
  lines: [
    // top
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    // bottom
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    // connectors
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ],
  colors: [
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
  ],
});
export const CUBE_AABB = getAABBFromMesh(CUBE_MESH);

export const PLANE_MESH = unshareProvokingVertices(
  scaleMesh(
    {
      pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
      ],
      tri: [
        [0, 2, 3],
        [0, 3, 1], // top
        [3, 2, 0],
        [1, 3, 0], // bottom
      ],
      lines: [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ],
      colors: [BLACK, BLACK, BLACK, BLACK],
    },
    10
  )
);
export const PLANE_AABB = getAABBFromMesh(PLANE_MESH);
