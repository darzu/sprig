// which triangles belong to which faces

import { BLACK } from "./mesh-list.js";
import {
  AllEndesga16,
  ENDESGA16,
  randEndesga16,
  seqEndesga16,
} from "../color/palettes.js";
import { AABB } from "../physics/aabb.js";
import {
  cloneMesh,
  mapMeshPositions,
  mergeMeshes,
  Mesh,
  RawMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
  unshareProvokingVertices,
} from "./mesh.js";
import {
  mat3,
  mat4,
  quat,
  V,
  vec2,
  vec3,
  vec4,
} from "../matrix/sprig-matrix.js";
import { assert, range } from "../utils/util.js";
import { uintToVec3unorm, vec3Dbg } from "../utils/utils-3d.js";
import { drawBall } from "../utils/utils-game.js";
import { createTimberBuilder, createEmptyMesh } from "../wood/wood.js";
import { transformYUpModelIntoZUp } from "../camera/basis.js";

// TODO(@darzu): Z_UP, this whole file..

// TODO(@darzu): A bunch of stuff shouldn't be in here like barge and sail stuff

export const mkCubeMesh: () => Mesh = () => ({
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
  tri: [],
  quad: [
    // +Z
    V(0, 1, 2, 3),
    // +Y
    V(4, 5, 1, 0),
    // +X
    V(3, 7, 4, 0),
    // -X
    V(2, 1, 5, 6),
    // -Y
    V(6, 7, 3, 2),
    // -Z
    V(5, 4, 7, 6),
  ],
  lines: [
    // top
    V(0, 1),
    V(1, 2),
    V(2, 3),
    V(3, 0),
    // bottom
    V(4, 5),
    V(5, 6),
    V(6, 7),
    V(7, 4),
    // connectors
    V(0, 4),
    V(1, 5),
    V(2, 6),
    V(3, 7),
  ],
  colors: [
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    // ENDESGA16.lightBlue,
    // ENDESGA16.lightGreen,
    // ENDESGA16.red,
    // ENDESGA16.darkRed,
    // ENDESGA16.darkGreen,
    // ENDESGA16.blue,
  ],
  surfaceIds: [1, 2, 3, 4, 5, 6],
  usesProvoking: true,
});

// points from y=0 to y=1; for debug visualization
// TODO(@darzu): enhance this with an arrow head?
export const mkArrowMesh: () => Mesh = () => {
  const A = 0.2;
  const B = 0.05;

  return {
    dbgName: "arrow",
    pos: [
      V(+B, 1.0, +B),
      V(-B, 1.0, +B),
      V(-A, 0.0, +A),
      V(+A, 0.0, +A),

      V(+B, 1.0, -B),
      V(-B, 1.0, -B),
      V(-A, 0.0, -A),
      V(+A, 0.0, -A),
    ],
    tri: [],
    quad: [
      // +Z
      V(0, 1, 2, 3),
      // +Y
      V(4, 5, 1, 0),
      // +X
      V(3, 7, 4, 0),
      // -X
      V(2, 1, 5, 6),
      // -Y
      V(6, 7, 3, 2),
      // -Z
      V(5, 4, 7, 6),
    ],
    lines: [
      // top
      V(0, 1),
      V(1, 2),
      V(2, 3),
      V(3, 0),
      // bottom
      V(4, 5),
      V(5, 6),
      V(6, 7),
      V(7, 4),
      // connectors
      V(0, 4),
      V(1, 5),
      V(2, 6),
      V(3, 7),
    ],
    colors: [
      V(0, 0, 0),
      V(0, 0, 0),
      V(0, 0, 0),
      V(0, 0, 0),
      V(0, 0, 0),
      V(0, 0, 0),
      // ENDESGA16.lightBlue,
      // ENDESGA16.lightGreen,
      // ENDESGA16.red,
      // ENDESGA16.darkRed,
      // ENDESGA16.darkGreen,
      // ENDESGA16.blue,
    ],
    surfaceIds: [1, 2, 3, 4, 5, 6],
    usesProvoking: true,
  };
};

export const TETRA_MESH: RawMesh = {
  pos: [V(0, 1, 0), V(-1, 0, -1), V(1, 0, -1), V(0, 0, 1)],
  tri: [V(2, 1, 0), V(3, 2, 0), V(1, 3, 0), V(2, 3, 1)],
  quad: [],
  lines: [V(0, 1), V(0, 2), V(0, 3), V(1, 2), V(2, 3), V(3, 4)],
  colors: [V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)],
};
scaleMesh(TETRA_MESH, 2);

// a = cos PI/3
// b = sin PI/3
export const HEX_MESH: () => RawMesh = () => {
  const A = Math.sin(Math.PI / 3);
  const B = Math.cos(Math.PI / 3);
  const sideTri: (i: number) => vec3[] = (i) => {
    const i2 = (i + 1) % 6;
    return [V(i + 6, i, i2), V(i + 6, i2, i2 + 6)];
  };
  const pos: vec3[] = [
    V(+0, +1, 1),
    V(+A, +B, 1),
    V(+A, -B, 1),
    V(+0, -1, 1),
    V(-A, -B, 1),
    V(-A, +B, 1),
    V(+0, +1, 0),
    V(+A, +B, 0),
    V(+A, -B, 0),
    V(+0, -1, 0),
    V(-A, -B, 0),
    V(-A, +B, 0),
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
  return { pos, tri, quad: [], lines, colors: tri.map((_) => V(0, 0, 0)) };
};

export function makePlaneMesh(
  x1: number,
  x2: number,
  y1: number,
  y2: number
): Mesh {
  const res: Mesh = {
    pos: [V(x2, y2, 0), V(x1, y2, 0), V(x2, y1, 0), V(x1, y1, 0)],
    tri: [],
    quad: [
      vec4.clone([0, 2, 3, 1]), // top
      vec4.clone([1, 3, 2, 0]), // bottom
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

const TRI_FENCE_LN = 100;
export const TRI_FENCE: () => RawMesh = () => {
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

export const GRID_PLANE_MESH = createGridPlane(30, 30);

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

export const DBG_FABRIC = createFlatQuadMesh(5, 5);

export function resetFlatQuadMesh(
  width: number,
  height: number,
  mesh: Mesh,
  doubleSided = false
) {
  assert(width > 1 && height > 1);
  assert(mesh.uvs);
  assert(mesh.pos.length === height * width);
  assert(mesh.quad.length === height * width * (doubleSided ? 2 : 1));
  assert(mesh.normals!.length === mesh.pos.length);
  assert(mesh.tangents!.length === mesh.pos.length);

  // create each vert
  // NOTE: z:width, x:height
  {
    let i = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        vec3.set(x, y, 0, mesh.pos[i]);
        // NOTE: world_z:tex_x, world_x:tex_y
        vec2.set(x / width, y / height, mesh.uvs![i]);
        i++;
      }
    }
  }

  // create each quad
  {
    let i = 0;
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        vec4.set(
          idx(x + 1, y), //
          idx(x + 1, y + 1),
          idx(x, y + 1),
          idx(x, y),
          mesh.quad[i]
        );
        i++;

        if (doubleSided) {
          vec4.set(
            idx(x, y), //
            idx(x, y + 1),
            idx(x + 1, y + 1),
            idx(x + 1, y),
            mesh.quad[i]
          );
          i++;
        }
        // quad.push(vec4.clone([q[3], q[2], q[1], q[0]]));
      }
    }
  }

  // TODO(@darzu): PERF. this is soo much wasted memory
  mesh.normals!.forEach((n) => vec3.set(0, 0, 1, n));
  mesh.tangents!.forEach((n) => vec3.set(1, 0, 0, n));

  function idx(x: number, y: number): number {
    return x + y * width;
  }
  // TODO(@darzu): return
}

// Creates a flat mesh on the XY plane with grid
//  spacing of 1 and width * height number of positions
// NOTE: If indexing via two for loops, Y is the outer loop, X is the inner loop
//  idx = yi * width + xi
// TODO(@darzu): Standardize 2d grid walk for all of sprigland! Always Y outer loop?
export function createFlatQuadMesh(
  width: number,
  height: number,
  doubleSided = false
): Mesh {
  assert(width > 1 && height > 1);

  const quadNum = height * width * (doubleSided ? 2 : 1);
  const mesh: Mesh = {
    pos: range(width * height).map((_) => vec3.create()),
    uvs: range(width * height).map((_) => vec2.create()),
    quad: range(quadNum).map((_) => vec4.create()),
    tri: [],
    normals: range(width * height).map((_) => vec3.create()),
    tangents: range(width * height).map((_) => vec3.create()),
    colors: range(quadNum).map((_) => V(0, 0, 0)),
    dbgName: `fabric-${width}x${height}`,
    surfaceIds: range(quadNum).map((_, i) => i + 1),
    usesProvoking: true,
  };

  resetFlatQuadMesh(width, height, mesh, doubleSided);

  return mesh;
}

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
      colors: range(3).map((_) => vec3.clone(V(0, 0, 0))),
    },
    mat4.fromRotationTranslationScaleOrigin(
      quat.IDENTITY,
      [-1.5, 0, -1.5],
      [0.2, 0.2, 0.2],
      [1.5, 0, 1.5]
    )
  );
}

export function mkHalfEdgeQuadMesh(): RawMesh {
  return transformMesh(
    {
      pos: [V(0, 0, 0), V(0, 0, 3), V(3, 0, 3), V(3, 0, 0)],
      tri: [],
      quad: [vec4.clone([0, 1, 2, 3])],
      colors: [vec3.clone(V(0, 0, 0))],
    },
    mat4.fromRotationTranslationScaleOrigin(
      quat.IDENTITY,
      [-1.5, 0, 0],
      [0.4, 0.2, 0.2],
      [1.5, 0, 0]
    )
  );
}

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

export function makeSailMesh(): RawMesh {
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
export const SHIP_OFFSET: vec3 = V(3.85 - 2.16, -0.33 - 0.13, -8.79 + 4.63);
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

export const SHIP_SMALL_AABBS: AABB[] = [
  { min: V(-5.15, -1.8, -21.15), max: V(5.35, 0.2, 10.15) },
  { min: V(4.95, -1.05, -25.15), max: V(8.45, 3.05, 8.95) },
  { min: V(-8.55, -1.05, -25.15), max: V(-5.05, 3.05, 8.95) },
  { min: V(-7.5, -1.05, 7.25), max: V(7.1, 3.05, 11.55) },
  { min: V(-7.5, -1.05, -25.15), max: V(7.1, 3.05, -20.85) },
];

// const shipMinX = min(SHIP_AABBS.map((a) => a.min[0]));
// const shipMaxX = min(SHIP_AABBS.map((a) => a.max[0]));
// console.log(`${(shipMaxX + shipMinX) / 2}`);

export const RAFT_MESH = mkCubeMesh();
scaleMesh3(RAFT_MESH, V(10, 0.6, 5));

export const BULLET_MESH = mkCubeMesh();
scaleMesh(BULLET_MESH, 0.3);

export function makeDome(numLon: number, numLat: number, r: number): Mesh {
  assert(numLon % 1 === 0 && numLon > 0);
  assert(numLat % 1 === 0 && numLat > 0);
  const uvs: vec2[] = [];
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  const quad: vec4[] = [];
  // TODO(@darzu): polar coordinates from these long and lats
  for (let lat = 0; lat <= numLat; lat++) {
    const inc = Math.PI * 0.5 * (lat / numLat);
    for (let lon = 0; lon < numLon; lon++) {
      const azi = Math.PI * 2 * (lon / numLon);
      const x = r * Math.sin(inc) * Math.sin(azi);
      const y = r * Math.sin(inc) * Math.cos(azi);
      const z = r * Math.cos(inc);
      pos.push(V(x, y, z));
      const u = azi / (Math.PI * 2.0);
      const v = 1 - inc / (Math.PI * 0.5);
      uvs.push(V(u, v));
      // drawBall(V(x, y, z), 1, seqEndesga16());
      if (lat === 0) break; // at the tip-top, we only need one pos
      if (lat === 1) {
        // top triangles
        let i3 = pos.length - 2;
        if (i3 == 0) i3 += numLon;
        const t = V(pos.length - 1, 0, i3);
        // console.log(t);
        tri.push(t);
      } else {
        const i0 = pos.length - 1;
        const i1 = pos.length - 1 - numLon;
        let i2 = pos.length - 2 - numLon;
        let i3 = pos.length - 2;
        if (lon === 0) {
          i2 += numLon;
          i3 += numLon;
        }
        // console.log({ i0, i1, i2, i3 });
        quad.push(V(i0, i1, i2, i3));
      }
      // if (lat === numLat) {
      //   const i0 = pos.length - 1;
      //   let i1 = pos.length - 2;
      //   if (lon === 0) {
      //     i1 += numLon;
      //   }
      //   let i2 = pos.length;
      // }
    }
  }
  // final floor of dome
  let centerIdx = pos.length;
  pos.push(V(0, 0, 0));
  uvs.push(V(0, 0));
  for (let lon = 0; lon < numLon; lon++) {
    let i0 = pos.length - lon - 1;
    let i1 = pos.length - lon - 2;
    if (lon === 0) {
      i0 -= numLon;
    }
    tri.push(V(i0, i1, centerIdx));
  }

  const faceNum = tri.length + quad.length;

  // console.log(`dome: ${pos.length} verts, ${faceNum} faces`);

  const mesh: Mesh = {
    pos,
    tri,
    quad,
    uvs,
    surfaceIds: range(faceNum).map((i) => i + 1),
    colors: range(faceNum).map((_) => seqEndesga16()),
    usesProvoking: true,
    dbgName: `dome${numLat}x${numLon}x${r}`,
  };
  return mesh;
}

export function makeSphere(numLon: number, numLat: number, r: number): Mesh {
  assert(numLon % 1 === 0 && numLon > 0);
  assert(numLat % 1 === 0 && numLat > 0);
  const uvs: vec2[] = [];
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  const quad: vec4[] = [];
  const normals: vec3[] = [];
  // TODO(@darzu): polar coordinates from these long and lats
  // HACK: just do 2 * numLat to make a sphere
  for (let lat = 0; lat <= numLat + 1; lat++) {
    const inc = Math.PI * (lat / (numLat + 1));
    for (let lon = 0; lon < numLon; lon++) {
      const azi = Math.PI * 2 * (lon / numLon);
      const x = r * Math.sin(inc) * Math.cos(azi);
      const z = r * Math.sin(inc) * Math.sin(azi);
      const y = r * Math.cos(inc);
      if (lat !== numLat) {
        pos.push(V(x, y, z));
        normals.push(vec3.normalize(pos[pos.length - 1], vec3.create()));
        const u = lon / numLon;
        const v = lat / (numLat + 1);
        uvs.push(V(u, v));
      }
      // drawBall(V(x, y, z), 1, seqEndesga16());
      if (lat === 0 || lat === numLat + 1) break; // at the tip-top, we only need one pos
      if (lat === 1) {
        // top triangles
        let i3 = pos.length - 2;
        if (i3 == 0) i3 += numLon;
        const t = V(pos.length - 1, 0, i3);
        // console.log(t);
        tri.push(t);
      } else if (lat === numLat) {
        // bottom triangles
        let i0 = pos.length + lon - numLon;
        let i1 = pos.length + lon - numLon + 1;
        let i2 = (numLat - 1) * numLon + 1;
        if (i1 == i2) i1 = pos.length - numLon;
        const t = V(i1, i0, i2);
        // console.log(t);
        tri.push(t);
      } else {
        const i0 = pos.length - 1;
        const i1 = pos.length - 1 - numLon;
        let i2 = pos.length - 2 - numLon;
        let i3 = pos.length - 2;
        if (lon === 0) {
          i2 += numLon;
          i3 += numLon;
        }
        // console.log({ i0, i1, i2, i3 });
        quad.push(V(i0, i1, i2, i3));
      }
      // if (lat === numLat) {
      //   const i0 = pos.length - 1;
      //   let i1 = pos.length - 2;
      //   if (lon === 0) {
      //     i1 += numLon;
      //   }
      //   let i2 = pos.length;
      // }
    }
  }

  const faceNum = tri.length + quad.length;

  // console.log(`dome: ${pos.length} verts, ${faceNum} faces`);

  const mesh: Mesh = {
    pos,
    tri,
    quad,
    uvs,
    surfaceIds: range(faceNum).map((i) => i + 1),
    colors: range(faceNum).map((_) => seqEndesga16()),
    usesProvoking: true,
    dbgName: `sphere${numLat}x${numLon}x${r}`,
    normals,
  };
  console.log(mesh);
  return mesh;
}

export function createRudderMesh(): Mesh {
  const m = createEmptyMesh("rudder");

  const handleHalfLength = 6;
  const handleHalfThick = 0.3;
  const rudderHeight = 16;
  const rudderWidthBase = 5;
  const rudderWidthTop = 2;
  const rudderShiftZ = 2;

  const H = handleHalfLength;
  const T = handleHalfThick;
  const R = rudderHeight;
  const W = rudderWidthBase;
  const W2 = rudderWidthTop;
  const Z = rudderShiftZ;

  // handle top
  m.pos.push(V(-T, T, -H)); // 0
  m.pos.push(V(-T, T, H));
  m.pos.push(V(T, T, H));
  m.pos.push(V(T, T, -H));
  m.quad.push(V(0, 1, 2, 3));
  // aft
  m.pos.push(V(T, -R, -H + Z)); // 4
  m.pos.push(V(-T, -R, -H + Z));
  m.quad.push(V(0, 3, 4, 5));
  // rudder bottom
  m.pos.push(V(T, -R, -H + W + Z)); // 6
  m.pos.push(V(-T, -R, -H + W + Z));
  m.quad.push(V(5, 4, 6, 7));
  // rudder fore
  m.pos.push(V(T, -T, -H + W2)); // 8
  m.pos.push(V(-T, -T, -H + W2));
  m.quad.push(V(7, 6, 8, 9));
  // handle under
  m.pos.push(V(T, -T, H)); // 10
  m.pos.push(V(-T, -T, H));
  m.quad.push(V(9, 8, 10, 11));
  // handle fore
  m.quad.push(V(11, 10, 2, 1));
  // rudder +x
  m.quad.push(V(8, 6, 4, 3));
  // rudder -x
  m.quad.push(V(0, 5, 7, 9));
  // handle +x
  m.quad.push(V(3, 2, 10, 8));
  // handle -x
  m.quad.push(V(9, 11, 1, 0));

  m.quad.forEach(() => m.colors.push(V(0, 0, 0)));

  // TODO(@darzu): inline this transformation
  // m.pos.map((v) => vec3.transformMat4(v, ZUpXFwdYLeft_to_YUpZFwdXLeft, v));
  m.pos.map((v) => vec3.transformMat4(v, transformYUpModelIntoZUp, v));

  // TODO(@darzu): Inline y+ forward
  const rot = quat.fromYawPitchRoll(Math.PI, 0, 0);
  m.pos.map((v) => vec3.transformQuat(v, rot, v));

  m.surfaceIds = m.quad.map((_, i) => i + 1);
  (m as Mesh).usesProvoking = true;
  return m as Mesh;
}
