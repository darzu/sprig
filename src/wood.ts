import { toFRGB, toOKLAB, toV3 } from "./color/color.js";
import { EM, EntityManager } from "./entity-manager.js";
import { AllMeshSymbols } from "./game/assets.js";
import { BulletDef } from "./game/bullet.js";
import { vec3, vec4 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { AABB, getAABBFromPositions } from "./physics/broadphase.js";
import { ColliderDef } from "./physics/collider.js";
import { PhysicsResultsDef } from "./physics/nonintersection.js";
import { getQuadMeshEdges, RawMesh } from "./render/mesh.js";
import { RenderableDef, RendererDef } from "./render/renderer-ecs.js";
import { assert } from "./test.js";
import { never, range } from "./util.js";

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

export type WoodAssets = Partial<{
  [P in AllMeshSymbols]: WoodenState;
}>;

export const WoodAssetsDef = EM.defineComponent(
  "woodAssets",
  (registry: WoodAssets = {}) => registry
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
    [RendererDef, WoodAssetsDef],
    (es, res) => {
      // TODO(@darzu):
      for (let e of es) {
        if (WoodenStateDef.isOn(e)) continue;

        // TODO(@darzu): need a first-class way to do this sort of pattern
        const m = e.renderable.meshHandle.readonlyMesh!;

        // const before = performance.now();
        // const state = getBoardsFromMesh(m);
        // const after = performance.now();
        // console.log(`getBoardsFromMesh: ${(after - before).toFixed(2)}ms`);

        const state = res.woodAssets.ship_fangs!;

        em.ensureComponentOn(e, WoodenStateDef, state);

        // // first, color all "board"-used
        // for (let qi of state.usedQuadIdxs) {
        //   vec3.copy(m.colors[qi], [1, 0, 0]);
        // }
        // console.log(`fangship has ${m.tri.length} triangles!`);
        // m.tri.forEach((t, ti) => {
        //   vec3.copy(m.colors[ti], [1, 0, 0]);
        // });

        // TODO(@darzu): wait, these color indices might be off by 4 since we have 4 triangles
        // TODO(@darzu): dbg colors:
        console.log(`num boards: ${state.boards.length}`);
        state.boards.forEach((b, i) => {
          // TODO(@darzu): use hue variations
          const color: vec3 = [Math.random(), Math.random(), Math.random()];
          vec3.normalize(color, color);
          vec3.scale(color, color, 0.05);
          // 0.05 * (x^n) = 1.0
          // x = 20^(1/n)
          const incr = Math.pow(20, 1 / b.length);
          console.log(`incr: ${incr}`);
          for (let seg of b) {
            for (let qi of [...seg.quadSideIdxs, ...seg.quadEndIdxs]) {
              vec3.copy(m.colors[qi], color);
            }
            vec3.scale(color, color, incr);
          }
        });
        res.renderer.renderer.updateMesh(e.renderable.meshHandle, m);
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
  vertIdxs: number[]; // TODO(@darzu): always 4?
  quadSideIdxs: number[]; // TODO(@darzu): alway 4?
  quadEndIdxs: number[]; // TODO(@darzu): always 0,1,2?
}
type Board = BoardSeg[];
interface WoodenState {
  usedVertIdxs: Set<number>;
  usedQuadIdxs: Set<number>;
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

const TRACK_INVALID_BOARDS = false;

export function getBoardsFromMesh(m: RawMesh): WoodenState {
  // What's in a board?
  // end verts connect to 3 others
  // mid verts connect to 4 others
  // ASSUME: quad mesh for the boards. Might as well
  // TODO(@darzu):
  // console.log("getBoardsFromMesh");

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

  // console.log("qIsMaybeEnd");
  // console.dir(qIsMaybeEnd);

  // tracks verts and quads used in all boards
  const structureVis = new Set<number>();
  const structureQis = new Set<number>();

  // TODO: vi to board idx ?
  function createBoard(startQi: number): Board | undefined {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    const startLoop = m.quad[startQi];

    // build the board
    const allSegments = addBoardSegment(startLoop, true);

    if (allSegments) {
      // the board is valid; track it, return it
      boardVis.forEach((vi) => structureVis.add(vi));
      boardQis.forEach((qi) => structureQis.add(qi));

      // TODO(@darzu): DEBUG: render the board
      // console.log("boardQis:");
      // console.dir(boardQis);
      // boardQis.forEach((qi) =>
      //   assert(0 <= qi && qi < m.quad.length, "invalid qi")
      // );
      // boardQis.forEach((qi) => newQuads.push(m.quad[qi]));
      return allSegments;
    }

    return undefined;

    function addBoardSegment(
      lastLoop: vec4,
      isFirstLoop: boolean = false
    ): BoardSeg[] | undefined {
      // start tracking this segment
      const segVis = new Set([...lastLoop]);

      // find the next loop
      const nextLoop_: number[] = [];
      lastLoop.forEach((vi) => {
        edges[vi].forEach((vi2) => {
          if (
            !segVis.has(vi2) &&
            !boardVis.has(vi2) &&
            !structureVis.has(vi2)
          ) {
            nextLoop_.push(vi2);
          }
        });
      });

      // is our loop valid?
      if (nextLoop_.length !== 4) {
        // invalid board
        if (TRACK_INVALID_BOARDS)
          console.log(`invalid board: next loop has ${nextLoop_.length} verts`);
        return undefined;
      }
      const nextLoop = nextLoop_ as vec4;

      // add next loop verts to segment
      nextLoop.forEach((vi) => segVis.add(vi));

      // find all quads for segment
      // TODO(@darzu): PERF. inefficient to repeat this linear scan for each loop..
      //    probably partition the mesh into islands first
      const segQis = m.quad.reduce(
        (p, n, ni) =>
          !boardQis.has(ni) &&
          !structureQis.has(ni) &&
          n.every((vi) => segVis.has(vi))
            ? [...p, ni]
            : p,
        [] as number[]
      );

      // TODO(@darzu): in the case of 6, we might have a single-segment
      //    board and we need to allow for that
      // do we still have a valid board?
      if (segQis.length !== 4 && segQis.length !== 5) {
        // invalid board; missing quads
        if (TRACK_INVALID_BOARDS)
          console.log(`invalid board: seg has ${segQis.length} quads`);
        return undefined;
      }

      // track segment quads as board quads, from here the segment has either
      // the right verts and quads or the whole board is invalid.
      segQis.forEach((qi) => boardQis.add(qi));
      segVis.forEach((vi) => boardVis.add(vi));

      // create common segment data
      const vertIdxs = [...segVis.values()];
      const aabb = getAABBFromPositions(vertIdxs.map((vi) => m.pos[vi]));
      let seg: BoardSeg;

      // are we at an end of the board?
      if (segQis.length === 5) {
        // get the end-cap
        const endQuads = segQis.filter((qi) =>
          m.quad[qi].every((vi) =>
            (isFirstLoop ? lastLoop : nextLoop).includes(vi)
          )
        );
        if (endQuads.length === 1) {
          const endQuad = endQuads[0];
          const sideQuads = segQis.filter((qi) => qi !== endQuad);
          seg = {
            localAABB: aabb,
            vertIdxs,
            quadSideIdxs: sideQuads,
            quadEndIdxs: [endQuad],
          };
          if (isFirstLoop) {
            // no-op, we'll continue below
          } else {
            // we're done with the board
            return [seg];
          }
        } else {
          // invalid board
          if (TRACK_INVALID_BOARDS)
            console.log(
              `invalid board: 5-quad but ${endQuads.length} end quads and is first: ${isFirstLoop}`
            );
          return undefined;
        }
      } else {
        // no end quads, just side
        seg = {
          localAABB: aabb,
          vertIdxs,
          quadSideIdxs: segQis,
          quadEndIdxs: [],
        };
      }

      // continue
      // TODO(@darzu): perf. tail call optimization?
      const nextSegs = addBoardSegment(nextLoop);
      if (!nextSegs) return undefined;
      else return [seg, ...nextSegs];
    }
  }

  const boards: Board[] = [];
  for (let qi of qIsMaybeEnd) {
    if (!structureQis.has(qi)) {
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
    usedVertIdxs: structureVis,
    usedQuadIdxs: structureQis,
  };

  return woodenState;
}
