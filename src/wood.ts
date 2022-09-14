import { vec3, vec4 } from "./gl-matrix.js";
import { getQuadMeshEdges, RawMesh } from "./render/mesh.js";
import { edges } from "./util.js";

interface Board {}

export function debugBoardSystem(m: RawMesh): RawMesh {
  const r = getBoardsFromMesh(m);
  return r;
}

export function getBoardsFromMesh(m: RawMesh): RawMesh {
  // What's in a board?
  // end verts connect to 3 others
  // mid verts connect to 4 others
  // ASSUME: quad mesh for the boards. Might as well
  // TODO(@darzu):
  console.log("getBoardsFromMesh");

  const edges = getQuadMeshEdges(m);
  // possible ends
  // from the end, dist 1 from each vert that isn't in the end is the next stop
  // next stop must be inter connected
  const mightBeEnd = new Set(
    edges.reduce((p, n, i) => (n.length === 3 ? [...p, i] : p), [])
  );
  console.log("ends:");
  console.dir(mightBeEnd);

  const isEnd = new Set();

  m.quad = [];
  m.tri = [];

  let ends: vec4[] = [];
  for (let eIdx of mightBeEnd) {
    if (isEnd.has(eIdx)) continue;
    const q: number[] = [];
    q.push(eIdx);
    for (let oIdx of edges[eIdx]) {
      if (!isEnd.has(oIdx) && mightBeEnd.has(oIdx)) {
        q.push(oIdx);
        for (let o2Idx of edges[oIdx]) {
          if (
            !isEnd.has(o2Idx) &&
            mightBeEnd.has(o2Idx) &&
            !q.includes(o2Idx)
          ) {
            q.push(o2Idx);
          }
        }
      }
    }
    if (q.length === 4) {
      console.log("end!");
      m.quad.push(q as vec4);
      ends.push(q as vec4);
      for (let i of q) {
        isEnd.add(i);
      }
    }
  }

  const isTaken = new Set();
  function createBoard(end: vec4) {
    const next: number[] = [];
    for (let ei of end) {
      for (let ni of edges[ei]) {
        if (!isEnd.has(ni) && !next.includes(ni)) {
          next.push(ni);
        }
      }
    }
    if (next.length === 4) {
      m.quad.push(next as vec4);
    }
  }

  for (let e of ends) {
    createBoard(e);
  }

  return m;
}
