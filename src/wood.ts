import { EM } from "./entity-manager.js";
import { vec3, vec4 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { getQuadMeshEdges, RawMesh } from "./render/mesh.js";
import { assert } from "./test.js";
import { edges } from "./util.js";

// TODO(@darzu): consider other mesh representations like:
//    DCEL or half-edge data structure

export const WoodenDef = EM.defineComponent("wooden", () => {
  return {
    // TODO(@darzu): boards, tight colliders etc
  };
});

onInit((em) => {
  em.registerSystem(
    [WoodenDef],
    [],
    (es, res) => {
      // TODO(@darzu):
      // console.log("wooden!: " + es.length);
    },
    "runWooden"
  );
});

interface Board {}

export function debugBoardSystem(m: RawMesh): RawMesh {
  const before = performance.now();
  const r = getBoardsFromMesh(m);
  const after = performance.now();
  console.log(`debugBoardSystem: ${(after - before).toFixed(2)}ms`);
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

  // const newQuads: vec4[] = [];
  // const newTris: vec3[] = [];

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

  // tracks verts and quads used in all boards
  const takenVis = new Set<number>();
  const takenQis = new Set<number>();

  // TODO: vi to board idx ?
  function createBoard(startQi: number) {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    // track starting quad and vert indices as part of this board
    boardQis.add(startQi);
    const startQ = m.quad[startQi];
    startQ.forEach((vi) => boardVis.add(vi));

    // build the board
    const validBoard = buildBoard(startQ);

    if (validBoard) {
      boardVis.forEach((vi) => takenVis.add(vi));
      boardQis.forEach((qi) => takenQis.add(qi));

      // TODO(@darzu): DEBUG: render the board
      // console.log("boardQis:");
      // console.dir(boardQis);
      // boardQis.forEach((qi) =>
      //   assert(0 <= qi && qi < m.quad.length, "invalid qi")
      // );
      // boardQis.forEach((qi) => newQuads.push(m.quad[qi]));
    }

    function buildBoard(lastLoop: vec4): boolean {
      // find the next loop
      const nextLoop: number[] = [];
      lastLoop.forEach((vi) => {
        edges[vi].forEach((vi2) => {
          if (!boardVis.has(vi2) && !takenVis.has(vi2)) {
            nextLoop.push(vi2);
            boardVis.add(vi2); // eagerly track verts as board verts
          }
        });
      });
      if (nextLoop.length !== 4) {
        // invalid board
        return false;
      }

      // track the segment vertices and quads between the last loop and this loop
      const loop = nextLoop as vec4;
      const segVis = new Set([...lastLoop, ...loop]);
      // TODO(@darzu): PERF. inefficient to repeat this linear scan for each loop..
      //    probably partition the mesh into islands first
      const segQis = m.quad.reduce(
        (p, n, ni) =>
          !boardQis.has(ni) &&
          !takenQis.has(ni) &&
          n.every((vi) => segVis.has(vi))
            ? [...p, ni]
            : p,
        [] as number[]
      );

      // track segment quads as board quads
      segQis.forEach((qi) => boardQis.add(qi));

      // do we still have a valid board, or are we at the end?
      if (segQis.length === 5) {
        // we might be at the other end
        const hasEndQuad =
          segQis.filter((qi) => m.quad[qi].every((vi) => loop.includes(vi)))
            .length === 1;
        return hasEndQuad;
      } else if (segQis.length !== 4) {
        // invalid board; missing quads
        return false;
      }

      // continue
      return buildBoard(loop);
    }
  }

  for (let qi of qIsMaybeEnd) {
    if (!takenQis.has(qi)) {
      createBoard(qi);
    }
  }

  const newQuads: vec4[] = [];
  const newTri: vec3[] = [];
  const newColors: vec3[] = [];
  const newSurfaceIds: number[] = [];

  // TODO(@darzu): transfer quad data
  takenQis.forEach((qi) => {
    const newQi = newQuads.length;
    newQuads.push(m.quad[qi]);
    newColors[newQi] = m.colors[qi]; // TODO(@darzu): face indexing isn't quite right here b/c of triangles
    newSurfaceIds[newQi] = newQi;
  });

  console.log(`quad count: ${m.quad.length} -> ${m.quad.length}`);

  m.quad = newQuads;
  m.tri = newTri;
  m.colors = newColors;
  m.surfaceIds = newSurfaceIds;

  return m;
}
