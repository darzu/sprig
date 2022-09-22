import { EM, EntityManager } from "./entity-manager.js";
import { BulletDef } from "./game/bullet.js";
import { vec3, vec4 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { AABB, getAABBFromPositions } from "./physics/broadphase.js";
import { ColliderDef } from "./physics/collider.js";
import { PhysicsResultsDef } from "./physics/nonintersection.js";
import { getQuadMeshEdges, RawMesh } from "./render/mesh.js";
import { emissionTexturePtr } from "./render/pipelines/std-stars.js";
import { RenderableDef } from "./render/renderer-ecs.js";
import { assert } from "./test.js";
import { edges } from "./util.js";

// TODO(@darzu): consider other mesh representations like:
//    DCEL or half-edge data structure

export const WoodenDef = EM.defineComponent("wooden", () => {
  return {
    // TODO(@darzu): options?
  };
});

export const WoodenStateDef = EM.defineComponent(
  "woodenState",
  (s: WoodenState) => {
    return s;
  }
);

onInit((em) => {
  em.registerSystem(
    [WoodenDef],
    [PhysicsResultsDef],
    (es, res) => {
      const { collidesWith } = res.physicsResults;

      for (let e of es) {
        const hits = collidesWith.get(e.id);
        if (hits) {
          const balls = hits
            .map((h) => em.findEntity(h, [BulletDef, ColliderDef]))
            .filter((b) => {
              // TODO(@darzu): check authority and team
              return b;
            });
          for (let b of balls) {
            console.log(`hit!`);
          }
        }
      }

      // TODO(@darzu):
      // console.log("wooden!: " + es.length);
      //
      // TODO(@darzu): auto AABB system?
      /*
      Broadphase Collision / non-intersection:
        each level of floor planks, etc
      */
    },
    "runWooden"
  );
});

onInit((em: EntityManager) => {
  em.registerSystem(
    [WoodenDef, RenderableDef],
    [],
    (es, res) => {
      // TODO(@darzu):
      for (let e of es) {
        if (WoodenStateDef.isOn(e)) continue;

        const before = performance.now();
        const state = getBoardsFromMesh(e.renderable.meshHandle.readonlyMesh!);
        const after = performance.now();
        console.log(`getBoardsFromMesh: ${(after - before).toFixed(2)}ms`);

        em.ensureComponentOn(e, WoodenStateDef, state);
      }
    },
    "initWooden"
  );
});

interface OBB {
  // TODO(@darzu): 3 axis + lengths
}

// each board has an AABB, OBB,
interface BoardSeg {
  localAABB: AABB;
  vertIdxs: number[];
  quadIdxs: number[];
}
type Board = BoardSeg[];
interface WoodenState {
  boards: Board[];
}

export function debugBoardSystem(m: RawMesh): RawMesh {
  const before = performance.now();
  const boards = getBoardsFromMesh(m);
  console.dir(boards);
  const after = performance.now();
  console.log(`debugBoardSystem: ${(after - before).toFixed(2)}ms`);
  return m;
}

export function getBoardsFromMesh(m: RawMesh): WoodenState {
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
  function createBoard(startQi: number): Board | undefined {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    // track starting quad and vert indices as part of this board
    boardQis.add(startQi);
    const startQ = m.quad[startQi];
    startQ.forEach((vi) => boardVis.add(vi));

    // build the board
    const segments = addBoardSegment(startQ);

    if (segments) {
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

    return segments;

    function addBoardSegment(lastLoop: vec4): BoardSeg[] | undefined {
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
        return undefined;
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

      // do we still have a valid board?
      if (segQis.length !== 4 && segQis.length !== 5) {
        // invalid board; missing quads
        return undefined;
      }

      // create the segment
      const vertIdxs = [...segVis.values()];
      const aabb = getAABBFromPositions(vertIdxs.map((vi) => m.pos[vi]));
      const seg: BoardSeg = {
        localAABB: aabb,
        vertIdxs,
        quadIdxs: segQis,
      };

      // are we at the end?
      if (segQis.length === 5) {
        // we might be at the other end
        const hasEndQuad =
          segQis.filter((qi) => m.quad[qi].every((vi) => loop.includes(vi)))
            .length === 1;

        return [seg];
      }

      // continue
      // TODO(@darzu): perf. tail call optimization?
      const nextSegs = addBoardSegment(loop);
      if (!nextSegs) return undefined;
      else return [seg, ...nextSegs];
    }
  }

  const boards: Board[] = [];
  for (let qi of qIsMaybeEnd) {
    if (!takenQis.has(qi)) {
      const b = createBoard(qi);
      if (b) boards.push(b);
    }
  }

  // const newQuads: vec4[] = [];
  // const newTri: vec3[] = [];
  // const newColors: vec3[] = [];
  // const newSurfaceIds: number[] = [];

  // // TODO(@darzu): transfer quad data
  // takenQis.forEach((qi) => {
  //   const newQi = newQuads.length;
  //   newQuads.push(m.quad[qi]);
  //   newColors[newQi] = m.colors[qi]; // TODO(@darzu): face indexing isn't quite right here b/c of triangles
  //   newSurfaceIds[newQi] = newQi;
  // });

  // console.log(`quad count: ${m.quad.length} -> ${m.quad.length}`);

  // m.quad = newQuads;
  // m.tri = newTri;
  // m.colors = newColors;
  // m.surfaceIds = newSurfaceIds;

  const woodenState: WoodenState = {
    boards,
  };

  return woodenState;
}
