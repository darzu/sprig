import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { importObj, isParseError } from "../import_obj.js";
import {
  cloneMesh,
  getAABBFromMesh,
  getCenterFromAABB,
  getHalfsizeFromAABB,
  getMeshAsGrid,
  mapMeshPositions,
  Mesh,
  normalizeMesh,
  RawMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
} from "../render/mesh.js";
import { AABB } from "../physics/broadphase.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { Renderer } from "../render/renderer-ecs.js";
import { assert } from "../test.js";
import { objMap, range } from "../util.js";
import { getText } from "../webget.js";
import { AABBCollider } from "../physics/collider.js";
import {
  computeTriangleNormal,
  farthestPointInDir,
  normalizeVec2s,
  SupportFn,
  uintToVec3unorm,
} from "../utils-3d.js";
import { MeshHandle } from "../render/mesh-pool.js";
import { onInit } from "../init.js";
import { mathMap, max, min } from "../math.js";

// TODO: load these via streaming

export const BLACK = vec3.fromValues(0, 0, 0);
export const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
export const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
export const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
export const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);

const DEFAULT_ASSET_PATH = "/assets/";
const BACKUP_ASSET_PATH = "http://sprig.land/assets/";

const RemoteMeshes = {
  ship: "barge.sprig.obj",
  ball: "ball.sprig.obj",
  pick: "pick.sprig.obj",
  spaceore: "spaceore.sprig.obj",
  spacerock: "spacerock.sprig.obj",
  ammunitionBox: "ammunition_box.sprig.obj",
  linstock: "linstock.sprig.obj",
  cannon: "cannon_simple.sprig.obj",
  grappleHook: "grapple-hook.sprig.obj",
  grappleGun: "grapple-gun.sprig.obj",
  grappleGunUnloaded: "grapple-gun-unloaded.sprig.obj",
  rudder: "rudder.sprig.obj",
  // TODO(@darzu): including hyperspace-ocean makes load time ~100ms slower :/
  ocean: "hyperspace-ocean.sprig.obj",
  // ocean: "rudder.sprig.obj",
} as const;

type RemoteMeshSymbols = keyof typeof RemoteMeshes;

const RemoteMesheSets = {
  // TODO(@darzu): both of these are doing "cell fracture" in Blender
  //    than exporting into here. It'd be great if sprigland could
  //    natively do that. Doing it natively would be great b/c there
  //    is a lot of translate/scale alignment issues when we have
  //    a base model and a fractured model. Very hard to make changes.
  // TODO(@darzu): enemy broken parts doesn't seem to work rn. probably rename related
  boat_broken: "boat_broken.sprig.obj",
  ship_broken: "barge1_broken.sprig.obj",
} as const;

type RemoteMeshSetSymbols = keyof typeof RemoteMesheSets;

const MeshTransforms: Partial<{
  [P in RemoteMeshSymbols | RemoteMeshSetSymbols | LocalMeshSymbols]: mat4;
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
    vec3.fromValues(-5, 0, 0),
    mat4.create()
  ),
  ocean: mat4.fromScaling([2, 2, 2], mat4.create()),
};

// TODO(@darzu): these sort of hacky offsets are a pain to deal with. It'd be
//    nice to have some asset import helper tooling
const SHIP_OFFSET: vec3 = vec3.clone([3.85 - 2.16, -0.33 - 0.13, -8.79 + 4.63]);
const blackoutColor: (m: RawMesh) => RawMesh = (m: RawMesh) => {
  m.colors.map((c) => vec3.zero(c));
  return m;
};
const MeshModify: Partial<{
  [P in RemoteMeshSymbols | RemoteMeshSetSymbols | LocalMeshSymbols]: (
    m: RawMesh
  ) => RawMesh;
}> = {
  cannon: (m) => {
    m.colors = m.colors.map((c) => vec3.clone([0.2, 0.2, 0.2]));
    return m;
  },
  spacerock: (m) => {
    m.colors = m.colors.map((c) => vec3.clone([0.05, 0.15, 0.2]));
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

          normal = computeTriangleNormal(pos, posNX, posNY);

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
    vec3.clone([+1.0, +1.0, +1.0]),
    vec3.clone([-1.0, +1.0, +1.0]),
    vec3.clone([-1.0, -1.0, +1.0]),
    vec3.clone([+1.0, -1.0, +1.0]),

    vec3.clone([+1.0, +1.0, -1.0]),
    vec3.clone([-1.0, +1.0, -1.0]),
    vec3.clone([-1.0, -1.0, -1.0]),
    vec3.clone([+1.0, -1.0, -1.0]),
  ],
  tri: [
    vec3.clone([0, 1, 2]),
    vec3.clone([0, 2, 3]), // front
    vec3.clone(
      // front
      [4, 5, 1]
    ),
    vec3.clone([4, 1, 0]), // top
    vec3.clone(
      // top
      [3, 4, 0]
    ),
    vec3.clone([3, 7, 4]), // right
    vec3.clone(
      // right
      [2, 1, 5]
    ),
    vec3.clone([2, 5, 6]), // left
    vec3.clone(
      // left
      [6, 3, 2]
    ),
    vec3.clone([6, 7, 3]), // bottom
    vec3.clone(
      // bottom
      [5, 4, 7]
    ),
    vec3.clone([5, 7, 6]), // back
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

const TETRA_MESH: RawMesh = {
  pos: [
    vec3.clone([0, 1, 0]),
    vec3.clone([-1, 0, -1]),
    vec3.clone([1, 0, -1]),
    vec3.clone([0, 0, 1]),
  ],
  tri: [
    vec3.clone([2, 1, 0]),
    vec3.clone([3, 2, 0]),
    vec3.clone([1, 3, 0]),
    vec3.clone([2, 3, 1]),
  ],
  quad: [],
  lines: [
    vec2.clone([0, 1]),
    vec2.clone([0, 2]),
    vec2.clone([0, 3]),
    vec2.clone([1, 2]),
    vec2.clone([2, 3]),
    vec2.clone([3, 4]),
  ],
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
    return [vec3.clone([i + 6, i, i2]), vec3.clone([i + 6, i2, i2 + 6])];
  };
  const pos: vec3[] = [
    vec3.clone([+1, 1, +0]),
    vec3.clone([+A, 1, +B]),
    vec3.clone([-A, 1, +B]),
    vec3.clone([-1, 1, +0]),
    vec3.clone([-A, 1, -B]),
    vec3.clone([+A, 1, -B]),
    vec3.clone([+1, 0, +0]),
    vec3.clone([+A, 0, +B]),
    vec3.clone([-A, 0, +B]),
    vec3.clone([-1, 0, +0]),
    vec3.clone([-A, 0, -B]),
    vec3.clone([+A, 0, -B]),
  ];
  const tri: vec3[] = [
    // top 4
    vec3.clone(
      // top 4
      [4, 2, 1]
    ),
    vec3.clone([1, 5, 4]),
    vec3.clone([0, 5, 1]),
    vec3.clone([4, 3, 2]),
    // bottom 4
    vec3.clone(
      // bottom 4
      [8, 10, 7]
    ),
    vec3.clone([11, 7, 10]),
    vec3.clone([11, 6, 7]),
    vec3.clone([9, 10, 8]),
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
const PLANE_MESH: RawMesh = {
  pos: [
    vec3.clone([+1, 0, +1]),
    vec3.clone([-1, 0, +1]),
    vec3.clone([+1, 0, -1]),
    vec3.clone([-1, 0, -1]),
  ],
  tri: [
    vec3.clone([0, 2, 3]),
    vec3.clone([0, 3, 1]), // top
    vec3.clone(
      // top
      [3, 2, 0]
    ),
    vec3.clone([1, 3, 0]), // bottom
  ],
  quad: [],
  lines: [
    vec2.clone([0, 1]),
    vec2.clone([0, 2]),
    vec2.clone([1, 3]),
    vec2.clone([2, 3]),
  ],
  colors: [BLACK, BLACK, BLACK, BLACK],
  // uvs: [
  //   [1, 1],
  //   [0, 1],
  //   [1, 0],
  //   [0, 0],
  // ],
};
scaleMesh(PLANE_MESH, 10);

function makeSailMesh(): RawMesh {
  const mesh: RawMesh = {
    pos: [],
    tri: [],
    quad: [],
    lines: [],
    colors: [],
  };
  for (let i = 0; i < 6; i++) {
    mesh.pos.push(vec3.clone([0, 0, 0]));
    mesh.pos.push(vec3.clone([0, 1, 0]));
    mesh.pos.push(vec3.clone([0, 1, 1]));
    mesh.tri.push(vec3.clone([i * 3, i * 3 + 1, i * 3 + 2]));
    mesh.tri.push(vec3.clone([i * 3 + 2, i * 3 + 1, i * 3]));
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
        pos.push(vec3.clone([-0.5 + i, 0, 0])) - 1,
        pos.push(vec3.clone([0 + i, 2, 0])) - 1,
        pos.push(vec3.clone([0.5 + i, 0, 0])) - 1,
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
    m.pos.push(vec3.clone([x, 0, 0]));
    m.pos.push(vec3.clone([x, 0, height]));
    m.lines!.push(vec2.clone([i, i + 1]));
  }

  for (let z = 0; z <= height; z++) {
    const i = m.pos.length;
    m.pos.push(vec3.clone([0, 0, z]));
    m.pos.push(vec3.clone([width, 0, z]));
    m.lines!.push(vec2.clone([i, i + 1]));
  }

  mapMeshPositions(m, (p) =>
    vec3.clone([p[0] - width / 2, p[1], p[2] - height / 2])
  );
  scaleMesh(m, 10 / Math.min(width, height));

  return m;
}

const DBG_FABRIC = createFabric(5);

export function createFabric(size: number): RawMesh {
  const pos: vec3[] = [];
  const quad: vec4[] = [];
  const uvs: vec2[] = [];

  // create each vert
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      pos.push(vec3.clone([x, y, 0]));
      uvs.push(vec2.clone([x / size, y / size]));
    }
  }

  // create each quad
  for (let x = 0; x < size - 1; x++) {
    for (let y = 0; y < size - 1; y++) {
      const q: vec4 = vec4.clone([
        idx(x, y),
        idx(x + 1, y),
        idx(x + 1, y + 1),
        idx(x, y + 1),
      ]);
      quad.push(q);
      quad.push(vec4.clone([q[3], q[2], q[1], q[0]]));
    }
  }

  return {
    pos,
    tri: [],
    uvs,
    quad,
    colors: quad.map((_, i) => vec3.clone([i / quad.length, 0.2, 0.2])),
    dbgName: `fabric-${size}`,
  };

  function idx(x: number, y: number): number {
    return x * size + y;
  }
  // TODO(@darzu): return
}

export const SHIP_AABBS: AABB[] = [
  { min: vec3.clone([-20.3, 1.7, -31.3]), max: vec3.clone([13.5, 3.75, 16.9]) },
  { min: vec3.clone([-11.6, -2.7, 17.2]), max: vec3.clone([4.8, 13.75, 42.8]) },
  { min: vec3.clone([-11.6, 13.1, 16.4]), max: vec3.clone([4.8, 15.4, 18.0]) },
  { min: vec3.clone([-21.7, 13.8, 42.3]), max: vec3.clone([13.7, 17.6, 43.3]) },
  {
    min: vec3.clone([-12.9, 13.6, 16.4]),
    max: vec3.clone([-11.1, 15.4, 25.6]),
  },
  { min: vec3.clone([3.1, 13.6, 16.4]), max: vec3.clone([4.9, 15.4, 25.6]) },
  { min: vec3.clone([13.1, 13.4, 20.9]), max: vec3.clone([14.9, 16.4, 42.7]) },
  {
    min: vec3.clone([-23.1, 13.4, 20.9]),
    max: vec3.clone([-21.3, 16.4, 42.7]),
  },
  { min: vec3.clone([-21.7, 0.4, 22.5]), max: vec3.clone([13.7, 13.75, 42.7]) },
  {
    min: vec3.clone([-21.7, -5.6, -35.7]),
    max: vec3.clone([13.7, 3.75, 16.9]),
  },
  {
    min: vec3.clone([-22.55, -2.8, -12.4]),
    max: vec3.clone([-20.65, 6.75, 16.0]),
  },
  {
    min: vec3.clone([12.65, 0.65, -12.4]),
    max: vec3.clone([14.55, 6.75, 16.0]),
  },
  {
    min: vec3.clone([12.25, 0.65, -29.9]),
    max: vec3.clone([14.55, 6.75, -18.1]),
  },
  {
    min: vec3.clone([-22.55, 0.65, -29.9]),
    max: vec3.clone([-20.25, 6.75, -18.1]),
  },
  {
    min: vec3.clone([-21.45, 0.65, -34.7]),
    max: vec3.clone([-16.95, 6.75, -29.7]),
  },
  {
    min: vec3.clone([-17.85, 0.65, -39.7]),
    max: vec3.clone([-13.35, 6.75, -34.7]),
  },
  {
    min: vec3.clone([-13.45, 0.65, -44.7]),
    max: vec3.clone([-8.95, 6.75, -39.7]),
  },
  {
    min: vec3.clone([-8.95, 0.65, -49.5]),
    max: vec3.clone([0.95, 6.75, -44.5]),
  },
  {
    min: vec3.clone([0.05, 0.65, -44.7]),
    max: vec3.clone([5.15, 6.75, -39.7]),
  },
  {
    min: vec3.clone([4.85, 0.65, -39.7]),
    max: vec3.clone([9.95, 6.75, -34.7]),
  },
  {
    min: vec3.clone([9.25, 0.65, -34.7]),
    max: vec3.clone([14.35, 6.75, -29.7]),
  },
  {
    min: vec3.clone([-13.35, -2.35, -44.9]),
    max: vec3.clone([4.55, 3.75, -35.5]),
  },
  {
    min: vec3.clone([12.35, 0.65, -18.2]),
    max: vec3.clone([15.25, 4.35, -12.2]),
  },
  {
    min: vec3.clone([-23.45, 0.65, -18.2]),
    max: vec3.clone([-20.55, 4.35, -12.2]),
  },
  {
    min: vec3.clone([-21.15, 2.05, 16.9]),
    max: vec3.clone([-12.85, 5.75, 19.1]),
  },
  {
    min: vec3.clone([-21.15, 4.05, 18.3]),
    max: vec3.clone([-12.85, 7.75, 20.5]),
  },
  {
    min: vec3.clone([-21.15, 6.05, 19.7]),
    max: vec3.clone([-12.85, 9.75, 21.9]),
  },
  {
    min: vec3.clone([-21.15, 8.05, 20.9]),
    max: vec3.clone([-12.85, 11.75, 23.1]),
  },
  {
    min: vec3.clone([4.85, 8.05, 20.9]),
    max: vec3.clone([13.15, 11.75, 23.1]),
  },
  { min: vec3.clone([4.85, 6.05, 19.7]), max: vec3.clone([13.15, 9.75, 21.9]) },
  { min: vec3.clone([4.85, 4.05, 18.3]), max: vec3.clone([13.15, 7.75, 20.5]) },
  { min: vec3.clone([4.85, 2.05, 16.9]), max: vec3.clone([13.15, 5.75, 19.1]) },
  {
    min: vec3.clone([12.95, 6.45, 15.9]),
    max: vec3.clone([14.65, 13.75, 20.9]),
  },
  {
    min: vec3.clone([-22.65, 6.45, 15.9]),
    max: vec3.clone([-20.95, 13.75, 20.9]),
  },
];

const RAW_BARGE_AABBS: AABB[] = [
  {
    min: vec3.clone([-5.1, -13.6, 83.35]),
    max: vec3.clone([22.1, -11.6, 135.05]),
  },
  {
    min: vec3.clone([19.2, -11.5, 83.35]),
    max: vec3.clone([22.0, -9.5, 135.05]),
  },
  {
    min: vec3.clone([-5.1, -11.5, 83.35]),
    max: vec3.clone([-2.3, -9.5, 135.05]),
  },
  {
    min: vec3.clone([-2.95, -11.5, 83.35]),
    max: vec3.clone([19.55, -9.5, 86.05]),
  },
  {
    min: vec3.clone([-2.95, -11.5, 132.25]),
    max: vec3.clone([19.55, -9.5, 134.95]),
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
scaleMesh3(BOAT_MESH, vec3.clone([10, 0.6, 5]));

const BULLET_MESH = cloneMesh(CUBE_MESH);
scaleMesh(BULLET_MESH, 0.3);

export const LocalMeshes = {
  cube: () => CUBE_MESH,
  plane: () => PLANE_MESH,
  tetra: () => TETRA_MESH,
  hex: HEX_MESH,
  enemyShip: () => BOAT_MESH,
  bullet: () => BULLET_MESH,
  gridPlane: () => GRID_PLANE_MESH,
  fabric: () => DBG_FABRIC,
  triFence: TRI_FENCE,
  wireCube: () => ({ ...CUBE_MESH, tri: [] } as RawMesh),
  mast: () => {
    let m = cloneMesh(CUBE_MESH);
    mapMeshPositions(m, (p) => vec3.clone([p[0], p[1] + 1, p[2]]));
    scaleMesh3(m, vec3.clone([0.5, 20, 0.5]));
    return m;
  },
  sail: () => SAIL_MESH,
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
  em.addSingletonComponent(AssetLoaderDef);

  // start loading of assets
  const { assetLoader, renderer } = await em.whenResources(
    AssetLoaderDef,
    RendererDef
  );
  assert(!assetLoader.promise, "somehow we're double loading assets");

  const assetsPromise = loadAssets(renderer.renderer);
  assetLoader.promise = assetsPromise;
  try {
    const result = await assetsPromise;
    em.addSingletonComponent(AssetsDef, result);
  } catch (failureReason) {
    // TODO(@darzu): fail more gracefully
    throw `Failed to load assets: ${failureReason}`;
  }
});

async function loadTxtInternal(relPath: string): Promise<string> {
  // download
  // TODO(@darzu): perf: check DEFAULT_ASSET_PATH once
  let txt;
  try {
    txt = await getText(DEFAULT_ASSET_PATH + relPath);
  } catch (_) {
    txt = await getText(BACKUP_ASSET_PATH + relPath);
  }

  return txt;
}
async function loadMeshInternal(relPath: string): Promise<RawMesh> {
  const res = await loadMeshSetInternal(relPath);
  assert(res.length === 1, "too many meshes; use loadMeshSet for multi meshes");
  return res[0];
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

  function processMesh(n: string, m: RawMesh): RawMesh {
    const t1 = (MeshTransforms as { [key: string]: mat4 })[n];
    if (t1) transformMesh(m, t1);
    const t2 = (MeshModify as { [key: string]: (m: RawMesh) => RawMesh })[n];
    if (t2) m = t2(m);
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
  console.log(`took ${elapsed.toFixed(1)}ms to load assets.`);

  return result;
}

export function gameMeshFromMesh(
  rawMesh: RawMesh,
  renderer: Renderer
): GameMesh {
  const mesh = normalizeMesh(rawMesh);
  const aabb = getAABBFromMesh(mesh);
  const center = getCenterFromAABB(aabb);
  const halfsize = getHalfsizeFromAABB(aabb);
  const proto = renderer.addMesh(mesh);
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
