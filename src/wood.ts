import { vec3, vec4 } from "./gl-matrix.js";
import { getQuadMeshEdges, RawMesh } from "./render/mesh.js";

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

  const es = getQuadMeshEdges(m);
  // possible ends
  // from the end, dist 1 from each vert that isn't in the end is the next stop
  // next stop must be inter connected
  const mightBeEnd = new Set(
    es.reduce((p, n, i) => (n.length === 3 ? [...p, i] : p), [])
  );
  console.log("ends:");
  console.dir(mightBeEnd);

  const isEnd = new Set();

  m.quad = [];
  m.tri = [];
  for (let eIdx of mightBeEnd) {
    if (isEnd.has(eIdx)) continue;
    const q: number[] = [];
    q.push(eIdx);
    for (let oIdx of es[eIdx]) {
      if (!isEnd.has(oIdx) && mightBeEnd.has(oIdx)) {
        q.push(oIdx);
        for (let o2Idx of es[oIdx]) {
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
      for (let i of q) {
        isEnd.add(i);
      }
    }
  }
  return m;
}
