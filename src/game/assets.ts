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
} from "../render/mesh-pool.js";
import { AABB } from "../physics/broadphase.js";
import { RendererDef } from "../render/render_init.js";
import { Renderer } from "../render/renderer.js";
import { assert } from "../test.js";
import { objMap } from "../util.js";
import { getText } from "../webget.js";
import { aabbListToStr } from "./modeler.js";

export const BLACK = vec3.fromValues(0, 0, 0);
export const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
export const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
export const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
export const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);

const DEFAULT_ASSET_PATH = "/assets/";
const BACKUP_ASSET_PATH = "https://sprig.land/assets/";

const RemoteMeshes = {
  ship: "barge.sprig.obj",
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
  ship: mat4.fromScaling(mat4.create(), [3, 3, 3]),
};

// which triangles belong to which faces
// TODO(@darzu): should these be standardized for all meshes?
export const CUBE_FACES = {
  front: [0, 1],
  top: [2, 3],
  right: [4, 5],
  left: [6, 7],
  bottom: [8, 9],
  back: [10, 11],
};
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

const RAW_SHIP_AABBS: AABB[] = [
  { min: [-5.1, -13.6, 83.35], max: [22.1, -11.6, 135.05] },
  { min: [19.2, -11.5, 83.35], max: [22.0, -9.5, 135.05] },
  { min: [-5.1, -11.5, 83.35], max: [-2.3, -9.5, 135.05] },
  { min: [-2.95, -11.5, 83.35], max: [19.55, -9.5, 86.05] },
  { min: [-2.95, -11.5, 132.25], max: [19.55, -9.5, 134.95] },
];
export const SHIP_AABBS: AABB[] = RAW_SHIP_AABBS.map((aabb) => {
  const yShift = 10;
  aabb.min[1] += yShift;
  aabb.max[1] += yShift;
  const zShift = -130;
  aabb.min[2] += zShift;
  aabb.max[2] += zShift;

  vec3.scale(aabb.min, aabb.min, 3 / 5);
  vec3.scale(aabb.max, aabb.max, 3 / 5);
  return aabb;
});

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

  // TODO(@darzu): this shouldn't directly add to a mesh pool, we don't know which pool it should
  //  go to
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

