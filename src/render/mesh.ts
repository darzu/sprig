import { vec3, vec2, mat4 } from "../gl-matrix.js";
import { AABB, getAABBFromPositions } from "../physics/broadphase.js";
import { vec3Mid } from "../utils-3d.js";

// defines the geometry and coloring of a mesh
export interface Mesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
  lines?: vec2[];
  uvs?: vec2[];
  // format flags:
  usesProvoking?: boolean;
  verticesUnshared?: boolean; // TODO(@darzu): support
}

export function unshareVertices(input: Mesh): Mesh {
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  input.tri.forEach(([i0, i1, i2], i) => {
    pos.push(input.pos[i0]);
    pos.push(input.pos[i1]);
    pos.push(input.pos[i2]);
    tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
  });
  return { ...input, pos, tri, verticesUnshared: true };
}
export function unshareProvokingVerticesWithMap(input: Mesh): {
  mesh: Mesh;
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
  const mesh: Mesh = { ...input, pos, uvs, tri, usesProvoking: true };

  return { mesh, posMap };
}
export function unshareProvokingVertices(input: Mesh): Mesh {
  const { mesh, posMap } = unshareProvokingVerticesWithMap(input);
  return mesh;
}

// utils

export function getAABBFromMesh(m: Mesh): AABB {
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
  m: Mesh,
  map: (p: vec3, i: number) => vec3
): Mesh {
  let pos = m.pos.map(map);
  return { ...m, pos };
}
export function scaleMesh(m: Mesh, by: number): Mesh {
  return mapMeshPositions(m, (p) => vec3.scale(vec3.create(), p, by));
}
export function scaleMesh3(m: Mesh, by: vec3): Mesh {
  return mapMeshPositions(m, (p) => vec3.multiply(vec3.create(), p, by));
}
export function transformMesh(m: Mesh, t: mat4): Mesh {
  return mapMeshPositions(m, (p) => vec3.transformMat4(vec3.create(), p, t));
}
export function cloneMesh(m: Mesh): Mesh {
  return {
    ...m,
    pos: m.pos.map((p) => vec3.clone(p)),
    tri: m.tri.map((p) => vec3.clone(p)),
    colors: m.colors.map((p) => vec3.clone(p)),
    lines: m.lines ? m.lines.map((p) => vec2.clone(p)) : undefined,
  };
}
// split mesh by connectivity
// TODO(@darzu): actually, we probably don't need this function
export function splitMesh(m: Mesh): Mesh[] {
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
