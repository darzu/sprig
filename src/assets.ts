import { Component, EM, EntityManager } from "./entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "./sprig-matrix.js";
import { importObj, isParseError } from "./import_obj.js";
import {
  cloneMesh,
  getAABBFromMesh,
  getCenterFromAABB,
  getHalfsizeFromAABB,
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
} from "./render/mesh.js";
import { AABB } from "./physics/broadphase.js";
import { RendererDef } from "./render/renderer-ecs.js";
import { Renderer } from "./render/renderer-ecs.js";
import { assert } from "./util.js";
import { objMap, range } from "./util.js";
import { getText } from "./webget.js";
import { AABBCollider } from "./physics/collider.js";
import {
  computeTriangleNormal,
  farthestPointInDir,
  normalizeVec2s,
  randNormalPosVec3,
  SupportFn,
  uintToVec3unorm,
  vec3Reverse,
  vec4Reverse,
} from "./utils-3d.js";
import { MeshHandle, MeshReserve } from "./render/mesh-pool.js";
import { onInit } from "./init.js";
import { jitter, mathMap, max, min } from "./math.js";
import { VERBOSE_LOG } from "./flags.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  debugBoardSystem,
  getBoardsFromMesh,
  unshareProvokingForWood,
  WoodAssets,
  WoodAssetsDef,
} from "./wood.js";
import { tempMat4, tempVec3 } from "./temp-pool.js";

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
  ld51_cannon: mat4.fromRotationTranslationScale(
    quat.rotateX(quat.IDENTITY, Math.PI * -0.5, quat.create()),
    [0, 0, 0],
    [0.8, 0.8, 0.8],
    mat4.create()
  ),
};

// TODO(@darzu): PERF. "ocean" and "ship_fangs" are expensive to load and aren't needed in all games.

// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const SHIP_OFFSET: vec3 = V(3.85 - 2.16, -0.33 - 0.13, -8.79 + 4.63);
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
export const CUBE_MESH: RawMesh = {
  dbgName: "cube",
  pos: [
    V(+1.0, +1.0, +1.0),
    V(-1.0, +1.0, +1.0),
    V(-1.0, -1.0, +1.0),
    V(+1.0, -1.0, +1.0),

    V(+1.0, +1.0, -1.0),
    V(-1.0, +1.0, -1.0),
    V(-1.0, -1.0, -1.0),
    V(+1.0, -1.0, -1.0),
  ],
  tri: [
    V(0, 1, 2),
    V(0, 2, 3),
    // front
    V(4, 5, 1),
    V(4, 1, 0),
    // top
    V(3, 4, 0),
    V(3, 7, 4),
    // right
    V(2, 1, 5),
    V(2, 5, 6),
    // left
    V(6, 3, 2),
    V(6, 7, 3),
    // bottom
    V(5, 4, 7),
    V(5, 7, 6),
    // back
  ],
  quad: [],
  lines: [
    // top
    vec2.clone(
      // top
      [0, 1]
    ),
    vec2.clone([1, 2]),
    vec2.clone([2, 3]),
    vec2.clone([3, 0]),
    // bottom
    vec2.clone(
      // bottom
      [4, 5]
    ),
    vec2.clone([5, 6]),
    vec2.clone([6, 7]),
    vec2.clone([7, 4]),
    // connectors
    vec2.clone(
      // connectors
      [0, 4]
    ),
    vec2.clone([1, 5]),
    vec2.clone([2, 6]),
    vec2.clone([3, 7]),
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
};

export function mkTimberSplinterEnd(loopCursor?: mat4, splintersCursor?: mat4) {
  loopCursor = loopCursor ?? mat4.create();
  splintersCursor = splintersCursor ?? mat4.create();
  const b = createTimberBuilder(createEmptyMesh("splinterEnd"));
  b.width = 0.5;
  b.depth = 0.2;

  // mat4.rotateY(b.cursor, b.cursor, Math.PI * -0.5); // TODO(@darzu): DBG
  // b.addLoopVerts();
  // mat4.translate(b.cursor, b.cursor, [0, 2, 0]);
  b.setCursor(loopCursor);
  b.addLoopVerts();
  b.addEndQuad(true);
  // b.addSideQuads();

  b.setCursor(splintersCursor);
  mat4.translate(b.cursor, [0, 0.1, 0], b.cursor);
  b.addSplinteredEnd(b.mesh.pos.length, 5);

  // b.addEndQuad(false);

  // TODO(@darzu): triangle vs quad coloring doesn't work
  b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
  b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));

  // console.dir(b.mesh);

  return b.mesh;
}

const TETRA_MESH: RawMesh = {
  pos: [V(0, 1, 0), V(-1, 0, -1), V(1, 0, -1), V(0, 0, 1)],
  tri: [V(2, 1, 0), V(3, 2, 0), V(1, 3, 0), V(2, 3, 1)],
  quad: [],
  lines: [V(0, 1), V(0, 2), V(0, 3), V(1, 2), V(2, 3), V(3, 4)],
  colors: [BLACK, BLACK, BLACK, BLACK],
};
scaleMesh(TETRA_MESH, 2);

// a = cos PI/3
// b = sin PI/3
const HEX_MESH: () => RawMesh = () => {
  const A = Math.cos(Math.PI / 3);
  const B = Math.sin(Math.PI / 3);
  const topTri = [
    [4, 2, 1],
    [1, 5, 4],
    [0, 5, 1],
    [4, 3, 2],
  ];
  const sideTri: (i: number) => vec3[] = (i) => {
    const i2 = (i + 1) % 6;
    return [V(i + 6, i, i2), V(i + 6, i2, i2 + 6)];
  };
  const pos: vec3[] = [
    V(+1, 1, +0),
    V(+A, 1, +B),
    V(-A, 1, +B),
    V(-1, 1, +0),
    V(-A, 1, -B),
    V(+A, 1, -B),
    V(+1, 0, +0),
    V(+A, 0, +B),
    V(-A, 0, +B),
    V(-1, 0, +0),
    V(-A, 0, -B),
    V(+A, 0, -B),
  ];
  const tri: vec3[] = [
    // top 4
    vec3.clone(
      // top 4
      [4, 2, 1]
    ),
    V(1, 5, 4),
    V(0, 5, 1),
    V(4, 3, 2),
    // bottom 4
    vec3.clone(
      // bottom 4
      [8, 10, 7]
    ),
    V(11, 7, 10),
    V(11, 6, 7),
    V(9, 10, 8),
    // sides
    ...sideTri(0),
    ...sideTri(1),
    ...sideTri(2),
    ...sideTri(3),
    ...sideTri(4),
    ...sideTri(5),
  ];
  // TODO(@darzu): lines for hex
  const lines: vec2[] = [];
  // lines: [
  //   [0, 1],
  //   [0, 2],
  //   [1, 3],
  //   [2, 3],
  // ],
  return { pos, tri, quad: [], lines, colors: tri.map((_) => BLACK) };
};
export function makePlaneMesh(
  x1: number,
  x2: number,
  z1: number,
  z2: number
): Mesh {
  const res: Mesh = {
    pos: [V(x2, 0, z2), V(x1, 0, z2), V(x2, 0, z1), V(x1, 0, z1)],
    tri: [],
    quad: [
      vec4.clone([0, 2, 3, 1]), // top
      vec4.clone(
        // top
        [1, 3, 2, 0]
      ), // bottom
    ],
    lines: [
      vec2.clone([0, 1]),
      vec2.clone([0, 2]),
      vec2.clone([1, 3]),
      vec2.clone([2, 3]),
    ],
    colors: [vec3.create(), vec3.create()],
    // uvs: [
    //   [1, 1],
    //   [0, 1],
    //   [1, 0],
    //   [0, 0],
    // ],
    surfaceIds: [1, 2],
    usesProvoking: true,
  };
  return res;
}

function makeSailMesh(): RawMesh {
  const mesh: RawMesh = {
    pos: [],
    tri: [],
    quad: [],
    lines: [],
    colors: [],
  };
  for (let i = 0; i < 6; i++) {
    mesh.pos.push(V(0, 0, 0));
    mesh.pos.push(V(0, 1, 0));
    mesh.pos.push(V(0, 1, 1));
    mesh.tri.push(V(i * 3, i * 3 + 1, i * 3 + 2));
    mesh.tri.push(V(i * 3 + 2, i * 3 + 1, i * 3));
    mesh.colors.push(BLACK);
    mesh.colors.push(BLACK);
  }
  return mesh;
}

const SAIL_MESH: RawMesh = makeSailMesh();

const TRI_FENCE_LN = 100;
const TRI_FENCE: () => RawMesh = () => {
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  for (let i = 0; i < TRI_FENCE_LN; i++) {
    tri.push(
      vec3.clone([
        pos.push(V(-0.5 + i, 0, 0)) - 1,
        pos.push(V(0 + i, 2, 0)) - 1,
        pos.push(V(0.5 + i, 0, 0)) - 1,
      ])
    );
  }
  const surfaceIds = tri.map((_, i) => i);

  // output.surface.r = f32(((input.surfaceId & 1u) >> 0u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);
  //   output.surface.g = f32(((input.surfaceId & 2u) >> 1u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);
  //   output.surface.b = f32(((input.surfaceId & 4u) >> 2u) * (input.surfaceId / 8u)) / f32(scene.maxSurfaceId / 8u);

  const colors = tri.map((_, i) => uintToVec3unorm(i, TRI_FENCE_LN));

  return {
    pos,
    tri,
    quad: [],
    colors,
    surfaceIds,
  };
};

const GRID_PLANE_MESH = createGridPlane(30, 30);

// TODO(@darzu): DBG
// console.log("getMeshAsGrid(GRID_PLANE_MESH)");
// getMeshAsGrid(GRID_PLANE_MESH);

function createGridPlane(width: number, height: number): RawMesh {
  const m: RawMesh = {
    pos: [],
    tri: [],
    colors: [],
    lines: [],
    quad: [],
  };

  for (let x = 0; x <= width; x++) {
    const i = m.pos.length;
    m.pos.push(V(x, 0, 0));
    m.pos.push(V(x, 0, height));
    m.lines!.push(vec2.clone([i, i + 1]));
  }

  for (let z = 0; z <= height; z++) {
    const i = m.pos.length;
    m.pos.push(V(0, 0, z));
    m.pos.push(V(width, 0, z));
    m.lines!.push(vec2.clone([i, i + 1]));
  }

  mapMeshPositions(m, (p) => V(p[0] - width / 2, p[1], p[2] - height / 2));
  scaleMesh(m, 10 / Math.min(width, height));

  return m;
}

const DBG_FABRIC = createFlatQuadMesh(5, 5);

export function createFlatQuadMesh(width: number, height: number): Mesh {
  const pos: vec3[] = [];
  const quad: vec4[] = [];
  const uvs: vec2[] = [];

  // create each vert
  // NOTE: z:width, x:height
  for (let x = 0; x < height; x++) {
    for (let z = 0; z < width; z++) {
      pos.push(V(x, 0, z));
      // NOTE: world_z:tex_x, world_x:tex_y
      uvs.push(V(z / width, x / height));
    }
  }

  // create each quad
  for (let x = 0; x < height - 1; x++) {
    for (let z = 0; z < width - 1; z++) {
      const q: vec4 = vec4.clone([
        idx(x, z),
        idx(x + 1, z),
        idx(x + 1, z + 1),
        idx(x, z + 1),
      ]);
      quad.push(q);
      quad.push(vec4.clone([q[3], q[2], q[1], q[0]]));
    }
  }

  // TODO(@darzu): PERF. this is soo much wasted memory
  const normals = pos.map((_) => V(0, 1, 0));
  const tangents = pos.map((_) => V(-1, 0, 0)); // TODO(@darzu): what should tangent be? should it be optional?

  return {
    pos,
    tri: [],
    uvs,
    quad,
    normals,
    tangents,
    colors: quad.map((_, i) => V(i / quad.length, 0.2, 0.2)),
    dbgName: `fabric-${width}x${height}`,
    surfaceIds: quad.map((_, i) => i + 1),
    usesProvoking: true,
  };

  function idx(x: number, z: number): number {
    return z + x * width;
  }
  // TODO(@darzu): return
}

export const SHIP_AABBS: AABB[] = [
  { min: V(-20.3, 1.7, -31.3), max: V(13.5, 3.75, 16.9) },
  { min: V(-11.6, -2.7, 17.2), max: V(4.8, 13.75, 42.8) },
  { min: V(-11.6, 13.1, 16.4), max: V(4.8, 15.4, 18.0) },
  { min: V(-21.7, 13.8, 42.3), max: V(13.7, 17.6, 43.3) },
  {
    min: V(-12.9, 13.6, 16.4),
    max: V(-11.1, 15.4, 25.6),
  },
  { min: V(3.1, 13.6, 16.4), max: V(4.9, 15.4, 25.6) },
  { min: V(13.1, 13.4, 20.9), max: V(14.9, 16.4, 42.7) },
  {
    min: V(-23.1, 13.4, 20.9),
    max: V(-21.3, 16.4, 42.7),
  },
  { min: V(-21.7, 0.4, 22.5), max: V(13.7, 13.75, 42.7) },
  {
    min: V(-21.7, -5.6, -35.7),
    max: V(13.7, 3.75, 16.9),
  },
  {
    min: V(-22.55, -2.8, -12.4),
    max: V(-20.65, 6.75, 16.0),
  },
  {
    min: V(12.65, 0.65, -12.4),
    max: V(14.55, 6.75, 16.0),
  },
  {
    min: V(12.25, 0.65, -29.9),
    max: V(14.55, 6.75, -18.1),
  },
  {
    min: V(-22.55, 0.65, -29.9),
    max: V(-20.25, 6.75, -18.1),
  },
  {
    min: V(-21.45, 0.65, -34.7),
    max: V(-16.95, 6.75, -29.7),
  },
  {
    min: V(-17.85, 0.65, -39.7),
    max: V(-13.35, 6.75, -34.7),
  },
  {
    min: V(-13.45, 0.65, -44.7),
    max: V(-8.95, 6.75, -39.7),
  },
  {
    min: V(-8.95, 0.65, -49.5),
    max: V(0.95, 6.75, -44.5),
  },
  {
    min: V(0.05, 0.65, -44.7),
    max: V(5.15, 6.75, -39.7),
  },
  {
    min: V(4.85, 0.65, -39.7),
    max: V(9.95, 6.75, -34.7),
  },
  {
    min: V(9.25, 0.65, -34.7),
    max: V(14.35, 6.75, -29.7),
  },
  {
    min: V(-13.35, -2.35, -44.9),
    max: V(4.55, 3.75, -35.5),
  },
  {
    min: V(12.35, 0.65, -18.2),
    max: V(15.25, 4.35, -12.2),
  },
  {
    min: V(-23.45, 0.65, -18.2),
    max: V(-20.55, 4.35, -12.2),
  },
  {
    min: V(-21.15, 2.05, 16.9),
    max: V(-12.85, 5.75, 19.1),
  },
  {
    min: V(-21.15, 4.05, 18.3),
    max: V(-12.85, 7.75, 20.5),
  },
  {
    min: V(-21.15, 6.05, 19.7),
    max: V(-12.85, 9.75, 21.9),
  },
  {
    min: V(-21.15, 8.05, 20.9),
    max: V(-12.85, 11.75, 23.1),
  },
  {
    min: V(4.85, 8.05, 20.9),
    max: V(13.15, 11.75, 23.1),
  },
  { min: V(4.85, 6.05, 19.7), max: V(13.15, 9.75, 21.9) },
  { min: V(4.85, 4.05, 18.3), max: V(13.15, 7.75, 20.5) },
  { min: V(4.85, 2.05, 16.9), max: V(13.15, 5.75, 19.1) },
  {
    min: V(12.95, 6.45, 15.9),
    max: V(14.65, 13.75, 20.9),
  },
  {
    min: V(-22.65, 6.45, 15.9),
    max: V(-20.95, 13.75, 20.9),
  },
];

const RAW_BARGE_AABBS: AABB[] = [
  {
    min: V(-5.1, -13.6, 83.35),
    max: V(22.1, -11.6, 135.05),
  },
  {
    min: V(19.2, -11.5, 83.35),
    max: V(22.0, -9.5, 135.05),
  },
  {
    min: V(-5.1, -11.5, 83.35),
    max: V(-2.3, -9.5, 135.05),
  },
  {
    min: V(-2.95, -11.5, 83.35),
    max: V(19.55, -9.5, 86.05),
  },
  {
    min: V(-2.95, -11.5, 132.25),
    max: V(19.55, -9.5, 134.95),
  },
];
export const BARGE_AABBS: AABB[] = RAW_BARGE_AABBS.map((aabb) => {
  // TODO(@darzu): this is especially hacky offset/scale fixing
  const yShift = 10;
  aabb.min[1] += yShift;
  aabb.max[1] += yShift;
  const zShift = -130;
  aabb.min[2] += zShift;
  aabb.max[2] += zShift;

  vec3.scale(aabb.min, 1 / 5, aabb.min);
  vec3.scale(aabb.max, 1 / 5, aabb.max);

  vec3.sub(aabb.min, SHIP_OFFSET, aabb.min);
  vec3.sub(aabb.max, SHIP_OFFSET, aabb.max);

  vec3.scale(aabb.min, 3, aabb.min);
  vec3.scale(aabb.max, 3, aabb.max);
  return aabb;
});
// const shipMinX = min(SHIP_AABBS.map((a) => a.min[0]));
// const shipMaxX = min(SHIP_AABBS.map((a) => a.max[0]));
// console.log(`${(shipMaxX + shipMinX) / 2}`);

const BOAT_MESH = cloneMesh(CUBE_MESH);
scaleMesh3(BOAT_MESH, V(10, 0.6, 5));

const BULLET_MESH = cloneMesh(CUBE_MESH);
scaleMesh(BULLET_MESH, 0.3);

// TODO(@darzu): there should be hooks so we can define these nearer to
//    where they are actually needed
export function mkOctogonMesh(): RawMesh {
  return transformMesh(
    {
      pos: [
        V(1, 0, 0),
        V(2, 0, 0),
        V(3, 0, 1),
        V(3, 0, 2),
        V(2, 0, 3),
        V(1, 0, 3),
        V(0, 0, 2),
        V(0, 0, 1),
      ],
      tri: [],
      quad: [
        vec4.clone([0, 5, 4, 1]),
        vec4.clone([1, 4, 3, 2]),
        vec4.clone([7, 6, 5, 0]),
      ],
      // colors: range(3).map((_) => randNormalPosVec3()),
      colors: range(3).map((_) => vec3.clone(BLACK)),
    },
    mat4.fromRotationTranslationScaleOrigin(
      quat.IDENTITY,
      [-1.5, 0, -1.5],
      [0.2, 0.2, 0.2],
      [1.5, 0, 1.5]
    )
  );
}

function mkHalfEdgeQuadMesh(): RawMesh {
  return transformMesh(
    {
      pos: [V(0, 0, 0), V(0, 0, 3), V(3, 0, 3), V(3, 0, 0)],
      tri: [],
      quad: [vec4.clone([0, 1, 2, 3])],
      colors: [vec3.clone(BLACK)],
    },
    mat4.fromRotationTranslationScaleOrigin(
      quat.IDENTITY,
      [-1.5, 0, 0],
      [0.4, 0.2, 0.2],
      [1.5, 0, 0]
    )
  );
}

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
  sail: () => SAIL_MESH,
  // timber_rib: mkTimberRib,
  timber_splinter: mkTimberSplinterEnd,
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
async function loadMeshInternal(relPath: string): Promise<RawMesh> {
  const res = await loadMeshSetInternal(relPath);
  return mergeMeshes(res);
}
async function loadMeshSetInternal(relPath: string): Promise<RawMesh[]> {
  // download
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
  const halfsize = getHalfsizeFromAABB(aabb);
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
