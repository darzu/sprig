import { vec3, vec2, mat4 } from "../gl-matrix.js";
import { AABB, getAABBFromPositions } from "../physics/broadphase.js";
import { vec3Mid } from "../utils-3d.js";

// defines the geometry and coloring of a mesh
export interface RawMesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
  lines?: vec2[];
  uvs?: vec2[];
  surfaceIds?: number[];
  // TODO(@darzu):
  dbgName?: string;
}

// TODO(@darzu): Seperate RawMesh from Mesh, so that we can do standard
//    processing all at once (usesProvoking, surfaceIds)
export interface Mesh extends RawMesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
  lines?: vec2[];
  uvs?: vec2[];
  surfaceIds: number[];
  // format flags:
  usesProvoking: true;
  // verticesUnshared?: boolean;
}

export function cloneMesh(m: Mesh): Mesh;
export function cloneMesh(m: RawMesh): RawMesh;
export function cloneMesh(m: Mesh | RawMesh): Mesh | RawMesh {
  return {
    ...m,
    pos: m.pos.map((p) => vec3.clone(p)),
    tri: m.tri.map((p) => vec3.clone(p)),
    colors: m.colors.map((p) => vec3.clone(p)),
    lines: m.lines?.map((p) => vec2.clone(p)),
    uvs: m.uvs?.map((p) => vec2.clone(p)),
    surfaceIds: (m as Mesh).surfaceIds
      ? [...(m as Mesh).surfaceIds]
      : undefined,
  };
}

// TODO(@darzu): support ?
// function unshareVertices(input: RawMesh): RawMesh {
//   const pos: vec3[] = [];
//   const tri: vec3[] = [];
//   input.tri.forEach(([i0, i1, i2], i) => {
//     pos.push(input.pos[i0]);
//     pos.push(input.pos[i1]);
//     pos.push(input.pos[i2]);
//     tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
//   });
//   return { ...input, pos, tri, verticesUnshared: true };
// }
export function unshareProvokingVerticesWithMap(input: RawMesh): {
  mesh: RawMesh & { usesProvoking: true };
  posMap: Map<number, number>;
} {
  const pos: vec3[] = [...input.pos];
  const uvs: vec2[] | undefined = input.uvs ? [...input.uvs] : undefined;
  const tri: vec3[] = [];
  const provoking: { [key: number]: boolean } = {};
  const posMap: Map<number, number> = new Map();
  pos.forEach((_, i) => posMap.set(i, i));
  input.tri.forEach(([i0, i1, i2], triI) => {
    if (!provoking[i0]) {
      // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
      provoking[i0] = true;
      tri.push([i0, i1, i2]);
    } else if (!provoking[i1]) {
      // First vertex was taken, so let's see if we can rotate the indices to get an unused
      // provoking vertex.
      provoking[i1] = true;
      tri.push([i1, i2, i0]);
    } else if (!provoking[i2]) {
      // ditto
      provoking[i2] = true;
      tri.push([i2, i0, i1]);
    } else {
      // All vertices are taken, so create a new one
      const i3 = pos.length;
      pos.push(input.pos[i0]);
      posMap.set(i3, i0);
      if (uvs) uvs.push(input.uvs![i0]);
      provoking[i3] = true;
      tri.push([i3, i1, i2]);
    }
  });

  return {
    mesh: {
      ...input,
      pos,
      uvs,
      tri,
      usesProvoking: true,
    },
    posMap,
  };
}
export function unshareProvokingVertices(
  input: RawMesh
): RawMesh & { usesProvoking: true } {
  const { mesh, posMap } = unshareProvokingVerticesWithMap(input);
  return mesh;
}

let nextSId = 1;

function generateSurfaceIds(mesh: RawMesh): number[] {
  // TODO(@darzu): better compute surface IDs
  let triIdToSurfaceId: Map<number, number> = new Map();
  mesh.tri.forEach((t, i) => {
    triIdToSurfaceId.set(i, i);
    // triIdToSurfaceId.set(i, nextSId++);
  });

  return mesh.tri.map((_, i) => triIdToSurfaceId.get(i)!);
}

export function normalizeMesh(input: RawMesh): Mesh {
  // TODO(@darzu): generate lines from surface IDs?
  const m1 = unshareProvokingVertices(input);
  return {
    ...m1,
    // TODO(@darzu): always generate UVs?
    uvs: m1.uvs,
    surfaceIds: m1.surfaceIds ?? generateSurfaceIds(m1),
  };
}

// utils

export function getAABBFromMesh(m: RawMesh): AABB {
  return getAABBFromPositions(m.pos);
}
export function getCenterFromAABB(aabb: AABB): vec3 {
  return vec3Mid(vec3.create(), aabb.min, aabb.max);
}
export function getHalfsizeFromAABB(aabb: AABB): vec3 {
  const out = vec3.create();
  const a = aabb.max;
  const b = aabb.min;
  out[0] = (a[0] - b[0]) * 0.5;
  out[1] = (a[1] - b[1]) * 0.5;
  out[2] = (a[2] - b[2]) * 0.5;
  return out;
}

export function mapMeshPositions(
  m: RawMesh,
  map: (p: vec3, i: number) => vec3
) {
  m.pos = m.pos.map(map);
}
export function scaleMesh(m: RawMesh, by: number) {
  mapMeshPositions(m, (p) => vec3.scale(vec3.create(), p, by));
}
export function scaleMesh3(m: RawMesh, by: vec3) {
  mapMeshPositions(m, (p) => vec3.multiply(vec3.create(), p, by));
}
export function transformMesh(m: RawMesh, t: mat4) {
  mapMeshPositions(m, (p) => vec3.transformMat4(vec3.create(), p, t));
}
// split mesh by connectivity
// TODO(@darzu): actually, we probably don't need this function
export function splitMesh(m: RawMesh): RawMesh[] {
  // each vertex is a seperate island
  let vertIslands: Set<number>[] = [];
  for (let i = 0; i < m.pos.length; i++) vertIslands[i] = new Set<number>([i]);

  // tris and lines define connectivity, so
  //    merge together islands
  for (let tri of m.tri) {
    mergeIslands(tri[0], tri[1]);
    mergeIslands(tri[0], tri[2]);
  }
  if (m.lines)
    for (let line of m.lines) {
      mergeIslands(line[0], line[1]);
    }

  const uniqueIslands = uniqueRefs(vertIslands);
  console.dir(uniqueIslands);

  // TODO(@darzu): FINISH IMPL
  return [m];

  function mergeIslands(idx0: number, idx1: number) {
    const s0 = vertIslands[idx0];
    const s1 = vertIslands[idx1];
    if (s0 !== s1) {
      // merge s0 and s1
      for (let i of s1) s0.add(i);
      vertIslands[idx1] = s0;
    }
  }
}
function uniqueRefs<T>(ts: T[]): T[] {
  const res: T[] = [];
  for (let t1 of ts) {
    if (res.every((t2) => t2 !== t1)) res.push(t1);
  }
  return res;
}
