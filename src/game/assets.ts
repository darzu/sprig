import { vec3 } from "../gl-matrix.js";
import { importObj, isParseError } from "../import_obj.js";
import {
  getAABBFromMesh,
  Mesh,
  scaleMesh,
  unshareProvokingVertices,
} from "../mesh-pool.js";
import { assert } from "../test.js";
import { getText } from "../webget.js";

export const BLACK = vec3.fromValues(0, 0, 0);
export const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
export const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
export const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
export const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);

export interface GameAssets {
  ship: Mesh;
  pick: Mesh;
  spaceore: Mesh;
  spacerock: Mesh;
  ammunitionBox: Mesh;
}

async function loadAssetInternal(path: string): Promise<Mesh> {
  // download
  const txt = await getText(path);

  // parse
  const opt = importObj(txt);
  assert(
    !!opt && !isParseError(opt),
    `unable to parse asset (${path}):\n${opt}`
  );

  // clean up
  const obj = unshareProvokingVertices(opt);

  return obj;
}

export async function loadAssets(): Promise<GameAssets> {
  const start = performance.now();

  // TODO(@darzu): parallel download for many objs
  const ship = await loadAssetInternal("/assets/ship.sprig.obj");
  const pick = await loadAssetInternal("/assets/pick.sprig.obj");
  const spaceore = await loadAssetInternal("/assets/spaceore.sprig.obj");
  const spacerock = await loadAssetInternal("/assets/spacerock.sprig.obj");
  const ammunitionBox = await loadAssetInternal(
    "/assets/ammunition_box.sprig.obj"
  );

  // perf tracking
  const elapsed = performance.now() - start;
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  // done
  return {
    ship,
    pick,
    spaceore,
    spacerock,
    ammunitionBox,
  };
}

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
