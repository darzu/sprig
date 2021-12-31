import { Component, EM, EntityManager } from "../entity-manager.js";
import { mat4, vec3 } from "../gl-matrix.js";
import { importObj, isParseError } from "../import_obj.js";
import {
  getAABBFromMesh,
  mapMeshPositions,
  Mesh,
  MeshHandle,
  scaleMesh,
  scaleMesh3,
  transformMesh,
  unshareProvokingVertices,
} from "../mesh-pool.js";
import { AABB } from "../physics/broadphase.js";
import { RendererDef } from "../render_init.js";
import { Renderer } from "../render_webgpu.js";
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

const RemoteMeshes = {
  ship: "ship.sprig.obj",
  ball: "ball.sprig.obj",
  pick: "pick.sprig.obj",
  spaceore: "spaceore.sprig.obj",
  spacerock: "spacerock.sprig.obj",
  ammunitionBox: "ammunition_box.sprig.obj",
  linstock: "linstock.sprig.obj",
  cannon: "cannon.sprig.obj",
} as const;

const AssetTransforms: Partial<{ [P in keyof typeof RemoteMeshes]: mat4 }> = {
  linstock: mat4.fromScaling(mat4.create(), [0.1, 0.1, 0.1]),
};

const CUBE_MESH = unshareProvokingVertices({
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
const PLANE_MESH = unshareProvokingVertices(
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

const GRID_PLANE_MESH = unshareProvokingVertices(createGridPlane(30, 30));

function createGridPlane(width: number, height: number): Mesh {
  const m: Mesh = {
    pos: [],
    tri: [],
    colors: [],
    lines: [],
  };

  for (let x = 0; x <= width; x++) {
    const i = m.pos.length;
    m.pos.push([x, 0, 0]);
    m.pos.push([x, 0, height]);
    m.lines!.push([i, i + 1]);
  }

  for (let z = 0; z <= height; z++) {
    const i = m.pos.length;
    m.pos.push([0, 0, z]);
    m.pos.push([width, 0, z]);
    m.lines!.push([i, i + 1]);
  }

  return scaleMesh(
    mapMeshPositions(m, (p) => [p[0] - width / 2, p[1], p[2] - height / 2]),
    10 / Math.min(width, height)
  );
}

const SHIP_AABBS: AABB[] = [
  { min: [-20.3, 51.7, -31.3], max: [13.5, 53.7, 16.9] },
  { min: [-11.6, 47.3, 17.2], max: [4.8, 63.7, 42.8] },
  { min: [-11.6, 63.1, 16.4], max: [4.8, 65.5, 18.0] },
  { min: [-21.7, 63.8, 42.3], max: [13.7, 67.6, 43.3] },
  { min: [-12.9, 63.6, 16.4], max: [-11.1, 65.4, 25.6] },
  { min: [3.1, 63.6, 16.4], max: [4.9, 65.4, 25.6] },
  { min: [13.1, 63.4, 20.9], max: [14.9, 66.4, 42.7] },
  { min: [-23.1, 63.4, 20.9], max: [-21.3, 66.4, 42.7] },
  { min: [-21.7, 50.4, 22.5], max: [13.7, 63.8, 42.7] },
  { min: [-21.7, 44.4, -35.7], max: [13.7, 53.8, 16.9] },
  { min: [-22.55, 47.2, -12.4], max: [-20.65, 56.6, 16.0] },
  { min: [12.65, 50.65, -12.4], max: [14.55, 56.75, 16.0] },
  { min: [12.25, 50.65, -29.9], max: [14.55, 56.75, -18.1] },
  { min: [-22.55, 50.65, -29.9], max: [-20.25, 56.75, -18.1] },
  { min: [-21.45, 50.65, -34.7], max: [-16.95, 56.75, -29.7] },
  { min: [-17.85, 50.65, -39.7], max: [-13.35, 56.75, -34.7] },
  { min: [-13.45, 50.65, -44.7], max: [-8.95, 56.75, -39.7] },
  { min: [-8.95, 50.65, -49.5], max: [0.95, 56.75, -44.5] },
  { min: [0.05, 50.65, -44.7], max: [5.15, 56.75, -39.7] },
  { min: [4.85, 50.65, -39.7], max: [9.95, 56.75, -34.7] },
  { min: [9.25, 50.65, -34.7], max: [14.35, 56.75, -29.7] },
  { min: [-13.35, 47.65, -44.9], max: [4.55, 53.75, -35.5] },
  { min: [12.35, 50.65, -18.2], max: [15.25, 54.35, -12.2] },
  { min: [-23.45, 50.65, -18.2], max: [-20.55, 54.35, -12.2] },
  { min: [-21.15, 52.05, 16.9], max: [-12.85, 55.75, 19.1] },
  { min: [-21.15, 54.05, 18.3], max: [-12.85, 57.75, 20.5] },
  { min: [-21.15, 56.05, 19.7], max: [-12.85, 59.75, 21.9] },
  { min: [-21.15, 58.05, 20.9], max: [-12.85, 61.75, 23.1] },
  { min: [4.85, 58.05, 20.9], max: [13.15, 61.75, 23.1] },
  { min: [4.85, 56.05, 19.7], max: [13.15, 59.75, 21.9] },
  { min: [4.85, 54.05, 18.3], max: [13.15, 57.75, 20.5] },
  { min: [4.85, 52.05, 16.9], max: [13.15, 55.75, 19.1] },
  { min: [12.95, 56.45, 15.9], max: [14.65, 63.75, 20.9] },
  { min: [-22.65, 56.45, 15.9], max: [-20.95, 63.75, 20.9] },
];

export const LocalMeshes = {
  cube: CUBE_MESH,
  plane: PLANE_MESH,
  boat: scaleMesh3(CUBE_MESH, [5, 0.3, 2.5]),
  bullet: scaleMesh(CUBE_MESH, 0.3),
  gridPlane: GRID_PLANE_MESH,
  wireCube: { ...CUBE_MESH, tri: [] } as Mesh,
} as const;

type AssetSymbols = keyof typeof RemoteMeshes | keyof typeof LocalMeshes;

type Asset = {
  mesh: Mesh;
  aabb: AABB;
  proto: MeshHandle;
};

type GameAssets = { [P in AssetSymbols]: Asset };

const AssetLoaderDef = EM.defineComponent("assetLoader", () => {
  return {
    promise: null as Promise<GameAssets> | null,
  };
});

export const AssetsDef = EM.defineComponent("assets", (assets: GameAssets) => {
  return assets;
});
export type Assets = Component<typeof AssetsDef>;

export function registerAssetLoader(em: EntityManager) {
  em.addSingletonComponent(AssetLoaderDef);

  // start loading of assets
  em.registerSystem(
    [],
    [AssetLoaderDef, RendererDef],
    (_, { assetLoader, renderer }) => {
      if (!assetLoader.promise) {
        const assetsPromise = loadAssets(renderer.renderer);
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

async function loadAssets(renderer: Renderer): Promise<GameAssets> {
  const start = performance.now();

  const promises = objMap(RemoteMeshes, (p) => loadAssetInternal(p));
  const promisesList = Object.entries(promises);
  const remoteMeshList = await Promise.all(promisesList.map(([_, p]) => p));

  const remoteMeshes = objMap(promises, (_, n) => {
    const idx = promisesList.findIndex(([n2, _]) => n === n2);
    const rawMesh = remoteMeshList[idx];
    const t = AssetTransforms[n!];
    return t ? transformMesh(rawMesh, t) : rawMesh;
  });

  const allMeshes = { ...remoteMeshes, ...LocalMeshes };

  const result = objMap(allMeshes, (mesh, n) => {
    const aabb = getAABBFromMesh(mesh);
    const proto = renderer.addMesh(mesh);
    return {
      mesh,
      aabb,
      proto,
    };
  });

  // perf tracking
  const elapsed = performance.now() - start;
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  return result;
}

