import { createFabric } from "../game/assets.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { AABB, getAABBFromPositions } from "../physics/broadphase.js";
import { assert } from "../test.js";
import { arraySortedEqual, arrayUnsortedEqual } from "../util.js";
import { vec3Dbg, vec3Mid } from "../utils-3d.js";
import { drawBall, drawLine } from "../utils-game.js";

// defines the geometry and coloring of a mesh
// TODO(@darzu): we need to rethink theis whole mesh family of objects
// geometry: pos, tri, quad, lines,
// geo-data: colors, uvs, surfaceIds,
// metadata: dbgName,
// flags: usesProvoking
export interface RawMesh {
  // geometry
  pos: vec3[];
  tri: vec3[];
  quad: vec4[]; // MUST NOT be redundant w/ `tri`
  lines?: vec2[];
  // per-face data, so one per tri and quad
  colors: vec3[]; // in r,g,b float [0-1] format
  surfaceIds?: number[];
  // per-vertex data
  uvs?: vec2[]; // optional; one uv per vertex
  tangents?: vec3[]; // optional; one tangent per vertex
  normals?: vec3[]; // optional; one tangent per vertex
  // TODO(@darzu):
  dbgName?: string;
}
export interface Mesh extends RawMesh {
  // made non-optional
  surfaceIds: NonNullable<RawMesh["surfaceIds"]>;
  // flags
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
    quad: m.quad.map((p) => vec4.clone(p)),
    colors: m.colors.map((p) => vec3.clone(p)),
    lines: m.lines?.map((p) => vec2.clone(p)),
    uvs: m.uvs?.map((p) => vec2.clone(p)),
    tangents: m.tangents?.map((p) => vec3.clone(p)),
    normals: m.normals?.map((p) => vec3.clone(p)),
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
// NOTE: we didn't actually use this or test this fn...
// export function deduplicateVertices(input: RawMesh): RawMesh {
//   // TODO(@darzu): preserve UV data?
//   assert(!input.uvs, "deduplicateVertices doesn't support UVs");
//   // TODO(@darzu): using strings to encode vec3s is horrible
//   const newPosMap: Map<string, number> = new Map();
//   const newPos: vec3[] = [];
//   const oldToNewPosIdx: number[] = [];
//   for (let oldIdx = 0; oldIdx < input.pos.length; oldIdx++) {
//     const p = input.pos[oldIdx];
//     const hash = `${p[0].toFixed(2)},${p[1].toFixed(2)},${p[2].toFixed(2)}`;
//     let newIdx = newPosMap.get(hash);
//     if (!newIdx) {
//       newIdx = newPos.length;
//       newPosMap.set(hash, newIdx);
//       newPos.push(p);
//       oldToNewPosIdx[oldIdx] = newIdx;
//     } else {
//       oldToNewPosIdx[oldIdx] = newIdx;
//     }
//   }

//   // map indices
//   const newTri = input.tri.map((t) =>
//     t.map((i) => oldToNewPosIdx[i])
//   ) as vec3[];
//   let newLines: vec2[] | undefined = undefined;
//   if (input.lines)
//     newLines = input.lines.map((t) =>
//       t.map((i) => oldToNewPosIdx[i])
//     ) as vec2[];

//   return {
//     ...input,
//     pos: newPos,
//     tri: newTri,
//     lines: newLines,
//   };
// }

export function unshareProvokingVerticesWithMap(input: RawMesh): {
  mesh: RawMesh & { usesProvoking: true };
  posMap: Map<number, number>;
  provoking: { [key: number]: boolean };
} {
  const pos: vec3[] = [...input.pos];
  const uvs: vec2[] | undefined = input.uvs ? [...input.uvs] : undefined;
  const tangents: vec3[] | undefined = input.tangents
    ? [...input.tangents]
    : undefined;
  const normals: vec3[] | undefined = input.normals
    ? [...input.normals]
    : undefined;
  const tri: vec3[] = [];
  const quad: vec4[] = [];
  const provoking: { [key: number]: boolean } = {};
  const posMap: Map<number, number> = new Map();
  pos.forEach((_, i) => posMap.set(i, i));
  input.tri.forEach(([i0, i1, i2]) => {
    if (!provoking[i0]) {
      // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
      provoking[i0] = true;
      tri.push(vec3.clone([i0, i1, i2]));
    } else if (!provoking[i1]) {
      // First vertex was taken, so let's see if we can rotate the indices to get an unused
      // provoking vertex.
      provoking[i1] = true;
      tri.push(vec3.clone([i1, i2, i0]));
    } else if (!provoking[i2]) {
      // ditto
      provoking[i2] = true;
      tri.push(vec3.clone([i2, i0, i1]));
    } else {
      // All vertices are taken, so create a new one
      const i3 = pos.length;
      pos.push(input.pos[i0]);
      posMap.set(i3, i0);
      if (uvs) uvs.push(input.uvs![i0]);
      if (tangents) tangents.push(input.tangents![i0]);
      if (normals) normals.push(input.normals![i0]);
      provoking[i3] = true;
      tri.push(vec3.clone([i3, i1, i2]));
    }
  });
  // TODO(@darzu): IMPL
  // input.quad.forEach((q) => quad.push(q));
  input.quad.forEach(([i0, i1, i2, i3]) => {
    if (!provoking[i0]) {
      // First vertex is unused as a provoking vertex, so we'll use it for this triangle.
      provoking[i0] = true;
      quad.push(vec4.clone([i0, i1, i2, i3]));
    } else if (!provoking[i1]) {
      // First vertex was taken, so let's see if we can rotate the indices to get an unused
      // provoking vertex.
      provoking[i1] = true;
      quad.push(vec4.clone([i1, i2, i3, i0]));
    } else if (!provoking[i2]) {
      // ditto
      provoking[i2] = true;
      quad.push(vec4.clone([i2, i3, i0, i1]));
    } else if (!provoking[i3]) {
      // ditto
      provoking[i3] = true;
      quad.push(vec4.clone([i3, i0, i1, i2]));
    } else {
      // All vertices are taken, so create a new one
      const i4 = pos.length;
      pos.push(input.pos[i0]);
      posMap.set(i4, i0);
      // TODO(@darzu): safer way to duplicate all per-vertex data
      if (uvs) uvs.push(input.uvs![i0]);
      if (tangents) tangents.push(input.tangents![i0]);
      if (normals) normals.push(input.normals![i0]);
      provoking[i4] = true;
      quad.push(vec4.clone([i4, i1, i2, i3]));
      // console.log(`duplicating: ${i0}!`);
    }
  });

  return {
    mesh: {
      ...input,
      pos,
      uvs,
      tangents,
      tri,
      quad,
      usesProvoking: true,
    },
    posMap,
    provoking,
  };
}
export function unshareProvokingVertices(
  input: RawMesh
): RawMesh & { usesProvoking: true } {
  const { mesh, posMap, provoking } = unshareProvokingVerticesWithMap(input);
  return mesh;
}

let nextSId = 1;

function generateSurfaceIds(mesh: RawMesh): number[] {
  // TODO(@darzu): HANDLE QUADS
  // TODO(@darzu): better compute surface IDs
  let triIdToSurfaceId: Map<number, number> = new Map();
  let nextSId = 0;
  mesh.tri.forEach((t, i) => {
    triIdToSurfaceId.set(i, nextSId++);
  });

  return mesh.tri.map((_, i) => triIdToSurfaceId.get(i)!);
}

export function normalizeMesh(inM: RawMesh): Mesh {
  // TODO(@darzu): generate lines from surface IDs?
  const oldVertNum = inM.pos.length;
  const {
    mesh: outM,
    posMap,
    provoking,
  } = unshareProvokingVerticesWithMap(inM);
  const newVertNum = outM.pos.length;
  if (inM.tri.length === 0 && inM.quad.length > 0) {
    // single-sided quad meshes shouldn't need to create new verts
    // if (oldVertNum !== newVertNum) {
    //   console.warn(
    //     `quad mesh w/ ${oldVertNum} verts had ${
    //       newVertNum - oldVertNum
    //     } extra verts added by unshareProvokingVerticesWithMap`
    //   );
    //   console.log(`quad count: ${inM.quad.length}`);
    //   console.dir(Object.keys(provoking).map((n) => Number(n)));
    // }
  }
  return {
    // TODO(@darzu): always generate UVs?
    ...outM,
    surfaceIds: outM.surfaceIds ?? generateSurfaceIds(outM),
  };
}

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
  mapMeshPositions(m, (p) => vec3.scale(p, by, vec3.create()));
}
export function scaleMesh3(m: RawMesh, by: vec3) {
  mapMeshPositions(m, (p) => vec3.mul(p, by, vec3.create()));
}
export function transformMesh(m: RawMesh, t: mat4) {
  mapMeshPositions(m, (p) => vec3.transformMat4(p, t, vec3.create()));
}
// split mesh by connectivity
// TODO(@darzu): actually, we probably don't need this function
export function splitMesh(m: RawMesh): RawMesh[] {
  // TODO(@darzu): HANDLE QUADS
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

export function quadToTris(q: vec4): [vec3, vec3] {
  return [
    vec3.clone([q[0], q[1], q[2]]),
    vec3.clone([q[0], q[2], q[3]]),
  ];
}

// {
//   // TODO(@darzu): DEBUG
//   const f = createFabric(5);
//   // console.log("getMeshAsGrid on fabric");
//   const res = getMeshAsGrid(f);
//   // console.dir(res);
//   // console.log("getMeshAsGrid on fabric done.");
// }

export function getMeshAsGrid(m: RawMesh): {
  coords: vec2[];
  grid: number[][];
} {
  // TODO(@darzu): PERF. can big arrays of vecs be more efficiently allocated
  //  as slices into one big type array or something? Each of these is doing
  //  a "new Float32Array(2)" which seems inefficient. Instead of:
  //    const coords = new Array(m.pos.length).fill(vec2.create());
  // TODO(@darzu): PERF. could be made more efficient by using one big typed array
  //  of vert indices w/ 4 slots for edges.

  assert(
    (m.quad.length > 0 || (m.lines?.length ?? 0) > 0) && m.tri.length === 0,
    "getMeshAsGrid only works for fully quad or line meshes"
  );

  // const refGrid = [
  //   [0, 1, 2],
  //   [3, 4, 5],
  //   [6, 7, 8],
  // ];

  // console.log("refGrid");
  // console.dir(refGrid);

  // Collect all edges
  const numVerts = m.pos.length;
  const edges = new Array(numVerts).fill([]).map(() => [] as number[]);
  for (let [t0, t1, t2, t3] of m.quad) {
    // top
    addEdge(t0, t1);
    addEdge(t1, t0);
    // right
    addEdge(t1, t2);
    addEdge(t2, t1);
    // bottom
    addEdge(t2, t3);
    addEdge(t3, t2);
    // left
    addEdge(t0, t3);
    addEdge(t3, t0);
  }
  // TODO(@darzu): There are issues with line generation from our quad mesh
  // if (m.lines)
  //   for (let [t0, t1] of m.lines) {
  //     addEdge(t0, t1);
  //     addEdge(t1, t0);
  //   }
  // console.log("edges:");
  // console.dir(edges);

  // Find a corner, use that as the origin
  const corners = m.pos.reduce(
    (p, n, ni) => (edges[ni].length === 2 ? [...p, ni] : p),
    [] as number[]
  );
  const origin = corners[0];
  assert(origin >= 0, "Invalid grid mesh; no corner");

  // Measure the distance to the other corners
  const xDirVert = edges[origin][0];
  const xLen = distToCorner(origin, xDirVert) + 1;
  const yDirVert = edges[origin][1];
  const yLen = distToCorner(origin, yDirVert) + 1;

  // setup out grid structures
  const coords: vec2[] = [];
  // TODO: figure out grid length
  const grid: number[][] = new Array(xLen)
    .fill([])
    .map(() => new Array(yLen).fill(-1));

  // console.log("start grid:");
  // console.log(grid);

  // Breath-first, add each vertex onto the grid
  const worklist: { vi: number; x: number; y: number }[] = [];

  // The two connections will be used as the X and Y axis
  place(origin, 0, 0);
  place(xDirVert, 1, 0);
  place(yDirVert, 0, 1);

  // console.log("grid");
  // console.dir(grid);

  // Do the breath-first traversal work
  while (worklist.length) {
    const { vi, x, y } = worklist.shift()!;
    // console.log(`doing ${vi}(${x},${y})`);
    addChildrenToGrid(vi, x, y);
  }

  // console.log("grid");
  // console.dir(grid);

  // TODO(@darzu): IMPLEMENT RETURN

  dbgCheckState();

  return {
    coords,
    grid,
  };

  function place(vi: number, x: number, y: number) {
    grid[x][y] = vi;
    coords[vi] = vec2.clone([x, y]);
    worklist.push({ vi, x, y });

    if (!dbgCheckState()) {
      console.dir(dist1Neighbors(x, y));
      console.dir(edges[vi].filter((e) => !!coords[e]));
      throw "inconsistent";
    }
  }

  function addChildrenToGrid(vi: number, x: number, y: number) {
    // invarient: child x,y must be >= x,y

    // get unplaced children
    const children = dist1Neighbors(x, y);
    // console.log(`d1s at ${x},${y}`);
    // console.dir(d1s);
    const unplaced: number[] = [];
    for (let c of edges[vi])
      if (!children.some((d1) => d1 === c)) unplaced.push(c);
    // if (unplaced.length > 2) {
    //   const d1s = dist1Neighbors(x, y);
    //   console.log(`parent: ${vi}->pos${vec3Dbg(m.pos[vi])} at ${x},${y}`);
    //   for (let c of edges[vi]) {
    //     console.log(`child: ${c}->pos${vec3Dbg(m.pos[c])}`);
    //   }
    //   for (let c of d1s) {
    //     console.log(`d1: ${c}->pos${vec3Dbg(m.pos[c])}`);
    //   }
    // }
    assert(unplaced.length <= 2, "inconsitency: too many unplaced children");
    if (!unplaced.length) return;
    const c1: number = unplaced[0];
    const c2: number | undefined = unplaced[1];

    const c1PlacedEdges = edges[c1].filter((e) => !!coords[e]);
    const c2PlacedEdges = c2 ? edges[c2].filter((e) => !!coords[e]) : undefined;

    // console.log("unplaced:");
    // console.dir(unplaced);
    // console.dir({ c1, c1PlacedEdges });
    // console.dir({ c2, c2PlacedEdges });

    const beforeLen = worklist.length;

    // TODO(@darzu): CONSIDER IF IT IS AN EDGE PIECE!!!

    // place in slot 1
    if (x + 1 <= xLen - 1) {
      const slot1d1s = dist1Neighbors(x + 1, y);
      // console.dir({ slot1d1s });
      if (slotCompatible(slot1d1s, c1PlacedEdges)) {
        place(c1, x + 1, y);
      } else if (c2 && slotCompatible(slot1d1s, c2PlacedEdges!)) {
        place(c2, x + 1, y);
      }
    }

    // place in slot 2
    if (y + 1 <= yLen - 1) {
      const slot2d1s = dist1Neighbors(x, y + 1);
      // console.dir({ slot2d1s });
      if (slotCompatible(slot2d1s, c1PlacedEdges)) {
        place(c1, x, y + 1);
      } else if (c2 && slotCompatible(slot2d1s, c2PlacedEdges!)) {
        place(c2, x, y + 1);
      }
    }

    assert(
      worklist.length === beforeLen + unplaced.length,
      "Didn't place all children!"
    );
  }

  function dbgCheckState() {
    // for (let x = 0; x < xLen; x++) {
    //   for (let y = 0; y < yLen; y++) {
    //     if (grid[x][y] >= 0 && grid[x][y] !== refGrid[x][y]) {
    //       console.log("INCONSITENT!");

    //       console.log("expected:");
    //       console.dir(refGrid);
    //       console.log("actual:");
    //       console.dir(grid);

    //       console.trace();
    //       return false;
    //     }
    //   }
    // }
    return true;
  }
  function distToCorner(last: number, current: number): number {
    // console.log(
    //   `distToCorner: ${last}, ${current}(${edges[current].length}->${edges[
    //     current
    //   ]
    //     .map((n) => edges[n].length)
    //     .join(",")})`
    // );
    // drawBall(m.pos[last], 1.0, [0.2, 0.2, 0.9]);

    const cEdges = edges[current];
    assert(cEdges.length <= 3, "not walking along an edge!");
    for (let next of cEdges) {
      if (next === last) continue;
      const nEdges = edges[next];
      // console.log(`n: ${next}`);
      // console.dir(nEdges);
      if (nEdges.length === 3) return 1 + distToCorner(current, next);
      if (nEdges.length === 2) return 2;
    }
    // console.dir(edges[current]);
    // console.dir(
    //   m.quad.filter((q) => q.some((vi) => vi === current || vi === last))
    // );

    // Debugging
    drawBall(m.pos[last], 1.0, vec3.clone([0.2, 0.2, 0.9]));
    drawBall(m.pos[current], 1.0, vec3.clone([0.2, 0.9, 0.2]));
    cEdges.forEach((n, i) => {
      const red = 0.7 + i * 0.1;
      drawBall(m.pos[n], 0.8, vec3.clone([red, 0.2, 0.2]));
      edges[n].forEach((n2, i2) => {
        // drawLine(m.pos[n], m.pos[n2], [red, 0.2, 0.2]);
        drawBall(m.pos[n2], 0.5, vec3.clone([red, 0.2, 0.2]));
      });
    });

    assert(
      false,
      `couldn't find an edge to walk along! ${last}->${current}->?!`
    );
  }

  function slotCompatible(slotd1s: number[], placedEdges: number[]): boolean {
    if (slotd1s.length !== placedEdges.length) return false;

    return arrayUnsortedEqual(slotd1s, placedEdges);
    // return slotd1s.every((a) => edges.some((b) => a === b));
  }
  function anyOverlap(xs: number[], ys: number[]): boolean {
    for (let x of xs) {
      for (let y of ys) {
        if (x === y) return true;
      }
    }
    return false;
  }

  function dist1Neighbors(x: number, y: number): number[] {
    const res: number[] = [];
    if (x - 1 >= 0) {
      const o = grid[x - 1][y];
      if (o >= 0) res.push(o);
    }
    if (x + 1 <= xLen - 1) {
      const o = grid[x + 1][y];
      if (o >= 0) res.push(o);
    }
    if (y - 1 >= 0) {
      const o = grid[x][y - 1];
      if (o >= 0) res.push(o);
    }
    if (y + 1 <= yLen - 1) {
      const o = grid[x][y + 1];
      if (o >= 0) res.push(o);
    }
    return res;
  }

  function addEdge(va: number, vb: number) {
    const es = edges[va];
    if (es.length < 4 && es[0] !== vb && es[1] !== vb && es[2] !== vb) {
      es.push(vb);
    }
  }
}

/*
log based, steps, groups, hide/show

Debug viz:
dots, lines,
dbg.setWorldSize(100,100)
dbg.setStepMs(100ms)
let d1 = dbg.drawDot(x,y)
dbg.disableTransitionTime()
dbg.label("next step")
let l1 = dbg.drawLine(x1,y1,x2,y2)
d1.hide()
dbg.enableTransitionTime()

register2DDebugViz("meshGrid");
*/
