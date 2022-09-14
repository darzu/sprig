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
  const vHas3Edges = new Set(
    edges.reduce((p, n, i) => (n.length === 3 ? [...p, i] : p), [])
  );
  // console.log("vHas3Edges:");
  // console.dir(vHas3Edges);

  const vIsMaybeEnd = new Set<number>();

  const newQuads: vec4[] = [];
  const newTris: vec3[] = [];

  // TODO(@darzu): use m.quad as end canidates! b/c we need their cw/ccw order

  const qIsMaybeEnd = new Set<number>();
  for (let qi = 0; qi < m.quad.length; qi++) {
    const q = m.quad[qi];
    if (q.every((vi) => vHas3Edges.has(vi) && !vIsMaybeEnd.has(vi))) {
      q.forEach((vi) => vIsMaybeEnd.add(vi));
      qIsMaybeEnd.add(qi);
    }
  }

  console.log("qIsMaybeEnd");
  console.dir(qIsMaybeEnd);

  // TODO: vi to board idx ?
  function createBoard(startQi: number) {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    boardQis.add(startQi);

    const startQ = m.quad[startQi];
    startQ.forEach((vi) => boardVis.add(vi));

    const nextLoop: number[] = [];
    startQ.forEach((vi) => {
      edges[vi].forEach((vi2) => {
        if (!boardVis.has(vi2)) {
          nextLoop.push(vi2);
          boardVis.add(vi2);
        }
      });
    });
    if (nextLoop.length !== 4) {
      // TODO(@darzu): invalid board
      return;
    }

    const loop = nextLoop as vec4;
    const segVis = new Set([...startQ, ...loop]);
    // TODO(@darzu): inefficient to repeat this linear scan for each loop..
    //    probably partition the mesh into islands first
    const segQis = m.quad.reduce(
      (p, n, ni) =>
        !boardQis.has(ni) && n.every((vi) => segVis.has(vi)) ? [...p, ni] : p,
      [] as number[]
    );
    if (segQis.length !== 4) {
      // TODO(@darzu): invalid board; missing quads
      return;
    }
    segQis.forEach((qi) => boardQis.add(qi));

    // TODO(@darzu): debug:
    boardQis.forEach((qi) => newQuads.push(m.quad[qi]));

    function buildBoard(lastLoop: vec4) {
      // TODO(@darzu):
    }
  }

  for (let qi of qIsMaybeEnd) {
    createBoard(qi);
  }

  m.quad = newQuads;
  m.tri = newTris;

  return m;
}
