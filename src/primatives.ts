// which triangles belong to which faces

import { BLACK } from "./assets.js";
import { AABB } from "./physics/broadphase.js";
import {
  cloneMesh,
  mapMeshPositions,
  Mesh,
  RawMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
} from "./render/mesh.js";
import { mat4, quat, V, vec2, vec3, vec4 } from "./sprig-matrix.js";
import { range } from "./util.js";
import { uintToVec3unorm } from "./utils-3d.js";
import { createTimberBuilder, createEmptyMesh } from "./wood.js";

// TODO(@darzu): A bunch of stuff shouldn't be in here like barge and sail stuff

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
  // TODO(@darzu): use quads
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
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
    V(0, 0, 0),
  ],
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
  return { pos, tri, quad: [], lines, colors: tri.map((_) => V(0, 0, 0)) };
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
        idx(x, z + 1),
        idx(x + 1, z + 1),
        idx(x + 1, z),
        idx(x, z),
      ]);
      quad.push(q);
      // quad.push(vec4.clone([q[3], q[2], q[1], q[0]]));
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
    // colors: quad.map((_, i) => V(i / quad.length, 0.2, 0.2)),
    colors: quad.map((_, i) => V(0, 0, 0)),
    dbgName: `fabric-${width}x${height}`,
    surfaceIds: quad.map((_, i) => i + 1),
    usesProvoking: true,
  };

  function idx(x: number, z: number): number {
    return z + x * width;
  }
  // TODO(@darzu): return
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

// const shipMinX = min(SHIP_AABBS.map((a) => a.min[0]));
// const shipMaxX = min(SHIP_AABBS.map((a) => a.max[0]));
// console.log(`${(shipMaxX + shipMinX) / 2}`);

export const BOAT_MESH = cloneMesh(CUBE_MESH);
scaleMesh3(BOAT_MESH, V(10, 0.6, 5));

export const BULLET_MESH = cloneMesh(CUBE_MESH);
scaleMesh(BULLET_MESH, 0.3);
