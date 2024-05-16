import { EM } from "../ecs/ecs.js";
import { AllMeshSymbols, BLACK } from "../meshes/mesh-list.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { createIdxPool } from "../utils/idx-pool.js";
import { jitter } from "../utils/math.js";
import { createLine, getLineEnd, Line } from "../physics/broadphase.js";
import {
  getQuadMeshEdges,
  Mesh,
  normalizeMesh,
  RawMesh,
} from "../meshes/mesh.js";
import { assert, assertDbg } from "../utils/util.js";
import { range } from "../utils/util.js";
import { centroid, quatFromUpForward_OLD } from "../utils/utils-3d.js";
import { DBG_ASSERT, VERBOSE_LOG } from "../flags.js";
import {
  createAABB,
  AABB,
  mergeAABBs,
  getAABBFromPositions,
} from "../physics/aabb.js";

// TODO(@darzu): BUG: sometimes ball colisions don't work
// TODO(@darzu): BUG: sometimes splinters are misaligned

// TODO(@darzu): remove all references to pirates

/* TODO(@darzu):
[ ] standardize naming: wood or timber or ??
[ ] remove gameplay specific stuff like
  [ ] pirate ship
  [ ] health values
  [ ] BulletDef
*/

// TODO(@darzu): consider other mesh representations like:
//    DCEL or half-edge data structure

// export const WoodenDef = EM.defineComponent("wooden", () => {
//   return {
//     // TODO(@darzu): options?
//   };
// });

/*
So how could wood + splinters work on the GPU?
Compute shader computes the triangles and vertices,
  based on control points: location, orientation, width, depthi
What does compute shader gain us?
  Less CPU->GPU bandwidth used
  Less CPU work

could do geometry shader to turn line strips into triangles
*/

// TODO(@darzu): implement board heirarchy so that joints between boards are tracked, for
//  damage and construction purposes

// Flag for serialization dbg. determine the max number of boards and segments; useful for sizing (u8 vs u16) for serializing
const TRACK_MAX_BOARD_SEG_IDX = false;
const TRACK_INVALID_BOARDS = false;

const __temp1 = V3.mk();
const __temp2 = V3.mk();

// v24, t16, q8
// TODO(@darzu): reduce to v18, t16, q8
export const _vertsPerSplinter = 24;
export const _trisPerSplinter = 16;
export const _quadsPerSplinter = 8;

interface WoodSplinterState {
  maxNumSplinters: number;
  splinterIdxPool: ReturnType<typeof createIdxPool>;
  // splinterIdxPool: ReturnType<typeof createIdxRing>;
  vertOffset: number;
  quadOffset: number;
  triOffset: number;
  // generation: number;
}

type VI = number; // vertex index
type QI = number; // quad index
// each board has an AABB, OBB,
export interface SegState {
  localAABB: AABB;
  midLine: Line;
  areaNorms: V3[]; // TODO(@darzu): fixed size
  width: number;
  depth: number;
  // TODO(@darzu): establish convention e.g. top-left, top-right, etc.
  vertLastLoopIdxs: V4; // [VI, VI, VI, VI];
  vertNextLoopIdxs: V4; // [VI, VI, VI, VI];
  // TODO(@darzu): establish convention e.g. top, left, right, bottom
  quadSideIdxs: V4; // [QI, QI, QI, QI];
  quadBackIdx?: QI;
  quadFrontIdx?: QI;
}
export interface BoardState {
  segments: SegState[];
  localAABB: AABB;
}

export interface BoardGroupState {
  // localAABB
  name: string;
  boards: BoardState[];
}

export interface WoodState {
  mesh: RawMesh; // TODO(@darzu): make non-raw
  usedVertIdxs: Set<number>;
  usedQuadIdxs: Set<number>;
  // boards: BoardState[];
  groups: BoardGroupState[];

  splinterState?: WoodSplinterState;
}

export const WoodStateDef = EM.defineNonupdatableComponent(
  "woodState",
  (s: WoodState) => {
    return s;
  }
);

export type WoodAssets = Partial<{
  [P in AllMeshSymbols]: WoodState;
}>;

export const WoodAssetsDef = EM.defineResource(
  "woodAssets",
  (registry: WoodAssets = {}) => registry
);

interface SegHealth {
  prev?: SegHealth;
  next?: SegHealth;
  health: number;
  broken: boolean;
  splinterTopIdx?: number;
  splinterBotIdx?: number;
  // splinterTopGeneration?: number;
  // splinterBotGeneration?: number;
}
type BoardHealth = SegHealth[];
interface BoardGroupHealth {
  boards: BoardHealth[];
}
interface WoodHealth {
  // TODO(@darzu): why no pointer to state?
  groups: BoardGroupHealth[];
}

// export type TimberBuilder = ReturnType<typeof createTimberBuilder>;

export const WoodHealthDef = EM.defineNonupdatableComponent(
  "woodHealth",
  (s: WoodHealth) => {
    return s;
  }
);

export function getSegmentRotation(seg: SegState, top: boolean) {
  let segNorm = V3.mk();
  let biggestArea2 = 0;
  for (let v of seg.areaNorms) {
    const a = V3.sqrLen(v);
    if (a > biggestArea2) {
      biggestArea2 = a;
      V3.copy(segNorm, v);
    }
  }

  const endNorm = V3.copy(V3.tmp(), seg.midLine.ray.dir);
  if (top) {
    V3.neg(endNorm, endNorm);
  }

  const rot = quat.mk();
  quatFromUpForward_OLD(rot, endNorm, segNorm);
  return rot;
}

// TODO(@darzu): POOL THESE SPLINTER ENDS!
let _tempSplinterMesh: RawMesh = createEmptyMesh("splinterEnd");

export function removeSplinterEnd(splinterIdx: number, wood: WoodState) {
  // TODO(@darzu): only do this if the splinter is free!!!!
  assert(wood.splinterState);
  const sIdx = splinterIdx;
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;

  for (let i = 0; i < _trisPerSplinter; i++) {
    V3.zero(wood.mesh.tri[triIdx + i]);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    V4.zero(wood.mesh.quad[quadIdx + i]);
  }
}

export function addSplinterEnd(
  seg: SegState,
  wood: WoodState,
  top: boolean
): number | undefined {
  console.log("global:addSplinteredEnd");
  assert(wood.splinterState, "!wood.splinterState");

  const sIdx = wood.splinterState.splinterIdxPool.next();
  if (sIdx === undefined) {
    // console.warn(`splinterIdxPool failed?`);
    return undefined;
  }

  const W = seg.width;
  const D = seg.depth;
  const pos = V3.copy(V3.tmp(), seg.midLine.ray.org);
  if (top) {
    getLineEnd(pos, seg.midLine);
  }

  _tempSplinterMesh.pos.length = 0;
  _tempSplinterMesh.quad.length = 0;
  _tempSplinterMesh.tri.length = 0;

  const rot = getSegmentRotation(seg, top);
  // TODO(@darzu): put these into a pool
  // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  const cursor = mat4.fromRotationTranslation(rot, pos, mat4.create());
  {
    const b = createTimberBuilder(_tempSplinterMesh);
    b.width = W;
    b.depth = D;

    b.setCursor(cursor);
    b.addLoopVerts();
    // TODO(@darzu): HACK. We're "snapping" the splinter loop and segment loops
    //    together via distance; we should be able to do this in a more analytic way
    const snapDistSqr = Math.pow(0.2 * 0.5, 2);
    const loop = top ? seg.vertNextLoopIdxs : seg.vertLastLoopIdxs;
    for (let vi = b.mesh.pos.length - 4; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      for (let vi2 of loop) {
        const lp = wood.mesh.pos[vi2];
        if (V3.sqrDist(p, lp) < snapDistSqr) {
          // console.log("snap!");
          V3.copy(p, lp);
          break;
        }
      }
    }
    b.addEndQuad(true);

    b.setCursor(cursor);
    mat4.translate(b.cursor, [0, 0.1, 0], b.cursor);
    b.addSplinteredEnd(b.mesh.pos.length, 5);

    // TODO(@darzu): triangle vs quad coloring doesn't work
    // b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    // b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
  }

  const qi = seg.quadSideIdxs[0];
  const color = wood.mesh.colors[qi];
  const triColorStartIdx = wood.mesh.quad.length;

  // TODO(@darzu): don't alloc all this mesh stuff!!
  const splinterMesh = normalizeMesh(_tempSplinterMesh);

  // copy mesh into main mesh
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;
  // console.log(`copying to: ${vertIdx} ${triIdx} ${quadIdx}`);

  for (let i = 0; i < _vertsPerSplinter; i++) {
    V3.copy(wood.mesh.pos[vertIdx + i], splinterMesh.pos[i]);
  }
  for (let i = 0; i < _trisPerSplinter; i++) {
    splinterMesh.tri[i][0] += vertIdx;
    splinterMesh.tri[i][1] += vertIdx;
    splinterMesh.tri[i][2] += vertIdx;
    V3.copy(wood.mesh.tri[triIdx + i], splinterMesh.tri[i]);
    V3.copy(wood.mesh.colors[triColorStartIdx + triIdx + i], color);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    splinterMesh.quad[i][0] += vertIdx;
    splinterMesh.quad[i][1] += vertIdx;
    splinterMesh.quad[i][2] += vertIdx;
    splinterMesh.quad[i][3] += vertIdx;
    V4.copy(wood.mesh.quad[quadIdx + i], splinterMesh.quad[i]);
    V3.copy(wood.mesh.colors[quadIdx + i], color);
  }

  return sIdx;
}

export function createEmptyMesh(dbgName: string): RawMesh {
  let mesh: RawMesh = {
    dbgName,
    pos: [],
    tri: [],
    quad: [],
    colors: [],
  };
  return mesh;
}

export function setSideQuadIdxs(
  loop1Vi: number,
  loop2Vi: number,
  q0: V4,
  q1: V4,
  q2: V4,
  q3: V4
) {
  // for provoking, we use loop1:2,3 and loop2:0,1
  // for provoking, we use loop1:2,3 and loop2:0,1
  V4.set(loop2Vi + 3, loop2Vi + 2, loop1Vi + 2, loop1Vi + 3, q0);
  V4.set(loop2Vi + 2, loop2Vi + 1, loop1Vi + 1, loop1Vi + 2, q1);
  V4.set(loop1Vi + 1, loop2Vi + 1, loop2Vi + 0, loop1Vi + 0, q2);
  V4.set(loop1Vi + 0, loop2Vi + 0, loop2Vi + 3, loop1Vi + 3, q3);
}

export function setEndQuadIdxs(loopVi: number, q: V4, facingDown: boolean) {
  // for provoking, we use loop 0 or 3
  // prettier-ignore
  if (facingDown)
    V4.set(loopVi + 3, loopVi + 2, loopVi + 1, loopVi + 0, q);
  else
    V4.set(loopVi + 0, loopVi + 1, loopVi + 2, loopVi + 3, q);
}

export interface TimberBuilder {
  width: number;
  depth: number;
  mesh: RawMesh;
  cursor: mat4;
  addSplinteredEnd: (lastLoopEndVi: number, numJags: number) => void;
  addLoopVerts: () => void;
  addSideQuads: () => void;
  addEndQuad: (facingDown: boolean) => void;
  setCursor: (newCursor: mat4) => void;
}

export function createTimberBuilder(mesh: RawMesh): TimberBuilder {
  // TODO(@darzu): Z_UP!! check this over
  // TODO(@darzu): have a system for building wood?

  // const W = 0.5; // width
  // const D = 0.2; // depth

  const cursor: mat4 = mat4.create();

  // NOTE: Assumes +y is forward by default
  const b = {
    width: 0.2, // x-axis
    depth: 0.2, // z-axis
    mesh,
    cursor,
    addSplinteredEnd,
    addLoopVerts,
    addSideQuads,
    addEndQuad,
    setCursor,
  };

  return b;

  function setCursor(newCursor: mat4) {
    mat4.copy(cursor, newCursor);
  }

  function addSplinteredEnd(lastLoopEndVi: number, numJags: number) {
    console.log("timberBuilder:addSplinteredEnd");
    const vi = mesh.pos.length;

    const v0 = V(0, 0, b.depth);
    const v1 = V(0, 0, -b.depth);
    V3.tMat4(v0, cursor, v0);
    V3.tMat4(v1, cursor, v1);
    mesh.pos.push(v0, v1);

    const v_tm = vi + 0;
    const v_tbr = lastLoopEndVi + -4;
    const v_tbl = lastLoopEndVi + -1;
    const v_bbr = lastLoopEndVi + -3;
    const v_bbl = lastLoopEndVi + -2;
    // +D side
    mesh.tri.push(V(v_tm, v_tbl, v_tbr));
    // -D side
    mesh.tri.push(V(v_tm + 1, v_bbr, v_bbl));

    let v_tlast = v_tbl;
    let v_blast = v_bbl;

    // const numJags = 5;
    const xStep = (b.width * 2) / numJags;
    let lastY = 0;
    let lastX = -b.width;
    for (let i = 0; i <= numJags; i++) {
      const x = i * xStep - b.width + jitter(0.05);
      let y = lastY;
      while (Math.abs(y - lastY) < 0.1)
        // TODO(@darzu): HACK to make sure it's not too even
        y = i % 2 === 0 ? 0.7 + jitter(0.6) : 0.2 + jitter(0.1);
      let d = b.depth; // + jitter(0.1);

      // TODO(@darzu): HACK! This ensures that adjacent "teeth" in the splinter
      //    are properly manifold/convex/something-something
      let cross_last_this = V2.cross([lastX, lastY], [x, y], __temp1);
      let maxLoop = 10;
      while (cross_last_this[2] > 0 && maxLoop > 0) {
        if (x < 0) y += 0.1;
        else y -= 0.1;
        V2.cross([lastX, lastY], [x, y], cross_last_this);
        maxLoop--;
      }
      if (VERBOSE_LOG && cross_last_this[2] > 0)
        console.warn(`splinter non-manifold!`);

      // +D side
      const vtj = V(x, y, d);
      V3.tMat4(vtj, cursor, vtj);
      const vtji = mesh.pos.length;
      mesh.pos.push(vtj);
      mesh.tri.push(V(v_tm, vtji, v_tlast));

      // -D side
      const vbj = V(x, y, -d);
      V3.tMat4(vbj, cursor, vbj);
      mesh.pos.push(vbj);
      mesh.tri.push(V(v_tm + 1, v_blast, vtji + 1));

      // D to -D quad
      mesh.quad.push(V(v_blast, v_tlast, vtji, vtji + 1));

      v_tlast = vtji;
      v_blast = vtji + 1;

      lastX = x;
      lastY = y;
    }
    // +D side
    mesh.tri.push(V(v_tm, v_tbr, v_tlast));
    // -D side
    mesh.tri.push(V(v_tm + 1, v_blast, v_bbr));

    // D to -D quad
    mesh.quad.push(V(v_blast, v_tlast, v_tbr, v_bbr));
  }

  // NOTE: for provoking vertices,
  //  indexes 0, 1 of a loop are for stuff behind (end cap, previous sides)
  //  indexes 2, 3 of a loop are for stuff ahead (next sides, end cap)
  function addSideQuads() {
    const loop2Idx = mesh.pos.length - 4;
    const loop1Idx = mesh.pos.length - 4 - 4;

    const q0 = V4.mk();
    const q1 = V4.mk();
    const q2 = V4.mk();
    const q3 = V4.mk();

    setSideQuadIdxs(loop1Idx, loop2Idx, q0, q1, q2, q3);

    mesh.quad.push(q0, q1, q2, q3);
  }

  function addEndQuad(facingDown: boolean) {
    const lastLoopIdx = mesh.pos.length - 4;
    const q = V4.mk();
    setEndQuadIdxs(lastLoopIdx, q, facingDown);
    mesh.quad.push(q);
  }

  function addLoopVerts() {
    // TODO(@darzu): ensure this agrees with the width/depth calculation in addBoard
    const v0 = V(b.width, 0, b.depth);
    const v1 = V(b.width, 0, -b.depth);
    const v2 = V(-b.width, 0, -b.depth);
    const v3 = V(-b.width, 0, b.depth);
    V3.tMat4(v0, cursor, v0);
    V3.tMat4(v1, cursor, v1);
    V3.tMat4(v2, cursor, v2);
    V3.tMat4(v3, cursor, v3);
    mesh.pos.push(v0, v1, v2, v3);
  }
}

export function reserveSplinterSpace(wood: WoodState, maxSplinters: number) {
  // console.log("reserveSplinterSpace");
  // console.log(meshStats(wood.mesh));
  const vertOffset = wood.mesh.pos.length;
  const quadOffset = wood.mesh.quad.length;
  const triOffset = wood.mesh.tri.length;
  range(maxSplinters * _vertsPerSplinter).forEach((_) =>
    wood.mesh.pos.push(V3.mk())
  );
  range(maxSplinters * _trisPerSplinter).forEach((_) =>
    wood.mesh.tri.push(V3.mk())
  );
  range(maxSplinters * _quadsPerSplinter).forEach((_) =>
    wood.mesh.quad.push(V4.mk())
  );
  const newFaces = maxSplinters * (_quadsPerSplinter + _trisPerSplinter);
  range(newFaces).forEach((_) => {
    wood.mesh.surfaceIds!.push(wood.mesh.surfaceIds!.length);
    wood.mesh.colors.push(V3.clone(BLACK));
  });

  wood.splinterState = {
    maxNumSplinters: maxSplinters,
    splinterIdxPool: createIdxPool(maxSplinters),
    vertOffset,
    quadOffset,
    triOffset,
    // generation: 1,
  };
  // console.log(meshStats(wood.mesh));
}

export function debugBoardSystem(m: RawMesh): RawMesh {
  const before = performance.now();
  const boards = getBoardsFromMesh(m);
  console.dir(boards);
  const after = performance.now();
  console.log(`debugBoardSystem: ${(after - before).toFixed(2)}ms`);
  return m;
}

export function getBoardsFromMesh(m: RawMesh): WoodState {
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
  // const newTris: V3[] = [];

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
  function createBoard(startQi: number): BoardState | undefined {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    const startLoop = V4.clone(m.quad[startQi]); // as [VI, VI, VI, VI];
    startLoop.sort((a, b) => a - b); // TODO(@darzu): HACK?

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

      // TODO(@darzu): IML
      const localAABB = createAABB();
      for (let s of allSegments) mergeAABBs(localAABB, localAABB, s.localAABB);
      return {
        segments: allSegments,
        localAABB,
      };
    }

    return undefined;

    function addBoardSegment(
      lastLoop: V4, // [VI, VI, VI, VI],
      isFirstLoop: boolean = false
    ): SegState[] | undefined {
      // TODO(@darzu): using too many temps!
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
      const nextLoop = V4.clone(nextLoop_ as [VI, VI, VI, VI]);
      nextLoop.sort((a, b) => a - b); // TODO(@darzu): HACK?

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
      segQis.sort((a, b) => a - b); // TODO(@darzu): HACK?

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
      const aabb = getAABBFromPositions(
        createAABB(),
        vertIdxs.map((vi) => m.pos[vi])
      );
      const lastMid = centroid(...[...lastLoop].map((vi) => m.pos[vi]));
      const nextMid = centroid(...[...nextLoop].map((vi) => m.pos[vi]));
      const mid = createLine(lastMid, nextMid);
      const areaNorms = segQis.map(getQiAreaNorm);
      const len1 = V3.dist(m.pos[lastLoop[1]], m.pos[lastLoop[0]]);
      const len2 = V3.dist(m.pos[lastLoop[3]], m.pos[lastLoop[0]]);
      const width = Math.max(len1, len2) * 0.5;
      const depth = Math.min(len1, len2) * 0.5;
      let seg: SegState;

      function getQiAreaNorm(qi: number) {
        // TODO(@darzu): PERF. Using too many temps!
        // TODO(@darzu): i hate doing this vec4->number[] conversion just to get map.. wth
        const ps = [...m.quad[qi]].map((vi) => m.pos[vi]);
        // NOTE: assumes segments are parallelograms
        const ab = V3.sub(ps[1], ps[0], __temp1);
        const ac = V3.sub(ps[3], ps[0], __temp2);
        const areaNorm = V3.cross(ab, ac, V3.mk());
        return areaNorm;
      }

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
          const sideQuads = V4.clone(
            segQis.filter((qi) => qi !== endQuad) as [QI, QI, QI, QI]
          );
          seg = {
            localAABB: aabb,
            midLine: mid,
            areaNorms,
            width,
            depth,
            vertLastLoopIdxs: lastLoop,
            vertNextLoopIdxs: nextLoop,
            quadSideIdxs: sideQuads,
            quadBackIdx: isFirstLoop ? endQuad : undefined,
            quadFrontIdx: !isFirstLoop ? endQuad : undefined,
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
          midLine: mid,
          areaNorms,
          width,
          depth,
          vertLastLoopIdxs: lastLoop,
          vertNextLoopIdxs: nextLoop,
          quadSideIdxs: V4.clone(segQis as [QI, QI, QI, QI]),
        };
      }

      // continue
      // TODO(@darzu): perf. tail call optimization?
      const nextSegs = addBoardSegment(nextLoop);
      if (!nextSegs) return undefined;
      else return [seg, ...nextSegs];
    }
  }

  const qEndCanidates = [...qIsMaybeEnd.values()];
  qEndCanidates.sort((a, b) => a - b);
  const boards: BoardState[] = [];
  for (let qi of qEndCanidates) {
    if (!structureQis.has(qi)) {
      const b = createBoard(qi);
      if (b) boards.push(b);
    }
  }

  // TODO(@darzu): group boards better
  const group: BoardGroupState = {
    name: "all",
    boards,
  };

  // const newQuads: vec4[] = [];
  // const newTri: V3[] = [];
  // const newColors: V3[] = [];
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

  const woodenState: WoodState = {
    mesh: m,
    groups: [group],
    usedVertIdxs: structureVis,
    usedQuadIdxs: structureQis,
  };

  return woodenState;
}

// TODO(@darzu): share code with wood repair?
export function resetWoodState(w: WoodState) {
  w.groups.forEach((g) => {
    g.boards.forEach((b) => {
      b.segments.forEach((s) => {
        // TODO(@darzu): extract for repair
        // TODO(@darzu): need enough info to reconstruct the mesh!
        if (s.quadBackIdx) {
          setEndQuadIdxs(
            s.vertLastLoopIdxs[0],
            w.mesh.quad[s.quadBackIdx],
            true
          );
        }
        if (s.quadFrontIdx) {
          setEndQuadIdxs(
            s.vertNextLoopIdxs[0],
            w.mesh.quad[s.quadFrontIdx],
            false
          );
        }
        assertDbg(
          s.vertLastLoopIdxs[0] < s.vertNextLoopIdxs[0],
          `Loops out of order`
        );
        setSideQuadIdxs(
          s.vertLastLoopIdxs[0],
          s.vertNextLoopIdxs[0],
          w.mesh.quad[s.quadSideIdxs[0]],
          w.mesh.quad[s.quadSideIdxs[1]],
          w.mesh.quad[s.quadSideIdxs[2]],
          w.mesh.quad[s.quadSideIdxs[3]]
        );
      });
    });
  });
  if (w.splinterState) {
    w.splinterState.splinterIdxPool.reset();
    for (
      let qi = w.splinterState.quadOffset;
      qi <
      w.splinterState.quadOffset +
        w.splinterState.maxNumSplinters * _quadsPerSplinter;
      qi++
    ) {
      V4.zero(w.mesh.quad[qi]);
    }
    for (
      let ti = w.splinterState.triOffset;
      ti <
      w.splinterState.triOffset +
        w.splinterState.maxNumSplinters * _trisPerSplinter;
      ti++
    ) {
      V3.zero(w.mesh.tri[ti]);
    }
  }
}

export function verifyUnsharedProvokingForWood(
  m: RawMesh,
  woodState: WoodState
): asserts m is RawMesh & { usesProvoking: true } {
  if (DBG_ASSERT) {
    const provokingVis = new Set<number>();
    for (let g of woodState.groups) {
      for (let b of g.boards) {
        for (let seg of b.segments) {
          for (let qi of [
            seg.quadBackIdx,
            seg.quadFrontIdx,
            ...seg.quadSideIdxs,
          ]) {
            if (!qi) continue;
            const pVi = m.quad[qi][0];
            assert(
              !provokingVis.has(pVi),
              `Shared provoking vert found in quad ${qi} (vi: ${pVi}) for ${m.dbgName}`
            );
            provokingVis.add(pVi);
          }
        }
      }
    }
  }
  (m as Mesh).usesProvoking = true;
}

export function unshareProvokingForWood(m: RawMesh, woodState: WoodState) {
  // TODO(@darzu): verify this actually works. We should pre-split the mesh
  //  into islands (which will speed up getBoardsFromMesh by a lot), and then
  //  verify each island is unshared.
  const provokingVis = new Set<number>();
  let bIdx = 0;
  for (let g of woodState.groups) {
    for (let b of g.boards) {
      // for (let b of [woodState.boards[60]]) {
      // first, do ends
      for (let seg of b.segments) {
        for (let qi of [seg.quadBackIdx, seg.quadFrontIdx]) {
          if (!qi) continue;
          const done = unshareProvokingForBoardQuad(m.quad[qi], qi);
          if (!done)
            console.error(`invalid board ${bIdx}! End cap can't unshare`);
          // console.log(`end: ${m.quad[qi]}`);
        }
      }
      for (let seg of b.segments) {
        for (let qi of seg.quadSideIdxs) {
          const done = unshareProvokingForBoardQuad(m.quad[qi], qi, [
            ...seg.vertLastLoopIdxs,
          ]);
          // if (done) console.log(`side: ${m.quad[qi]}`);
          if (!done) {
            const done2 = unshareProvokingForBoardQuad(m.quad[qi], qi);
            // if (done2) console.log(`side(2): ${m.quad[qi]}`);
            if (!done2) {
              console.error(
                `invalid board ${bIdx}; unable to unshare provoking`
              );
            }
          }
        }
      }
      bIdx++;
    }
  }
  function unshareProvokingForBoardQuad(
    [i0, i1, i2, i3]: V4,
    qi: number,
    preferVis?: number[]
  ) {
    if ((!preferVis || preferVis.includes(i0)) && !provokingVis.has(i0)) {
      provokingVis.add(i0);
      m.quad[qi] = V4.clone([i0, i1, i2, i3]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i1)) &&
      !provokingVis.has(i1)
    ) {
      provokingVis.add(i1);
      m.quad[qi] = V4.clone([i1, i2, i3, i0]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i2)) &&
      !provokingVis.has(i2)
    ) {
      provokingVis.add(i2);
      m.quad[qi] = V4.clone([i2, i3, i0, i1]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i3)) &&
      !provokingVis.has(i3)
    ) {
      provokingVis.add(i3);
      m.quad[qi] = V4.clone([i3, i0, i1, i2]);
      return true;
    } else {
      return false;
    }
  }
}

export function createWoodHealth(w: WoodState): WoodHealth {
  if (TRACK_MAX_BOARD_SEG_IDX) {
    const maxBoardIdx = w.groups.reduce((p, n) => p + n.boards.length, 0);
    let maxSegIdx = -1;
    for (let g of w.groups) {
      for (let b of g.boards) {
        maxSegIdx = Math.max(maxSegIdx, b.segments.length);
      }
    }
    console.log(`maxBoardIdx: ${maxBoardIdx}`);
    console.log(`maxSegIdx: ${maxSegIdx}`);
  }

  const groups: BoardGroupHealth[] = w.groups.map((g) => {
    const boards: BoardHealth[] = g.boards.map((b) => {
      let lastSeg = b.segments.reduce((p, n) => {
        const h: SegHealth = {
          prev: p,
          health: 1.0,
          broken: false,
        };
        return h;
      }, undefined as SegHealth | undefined);
      if (!lastSeg) return [] as SegHealth[];
      // patch up "next" ptrs
      while (lastSeg.prev) {
        lastSeg.prev.next = lastSeg;
        lastSeg = lastSeg.prev;
      }
      let nextSeg: SegHealth | undefined = lastSeg;
      const segHealths: SegHealth[] = [];
      while (nextSeg) {
        segHealths.push(nextSeg);
        nextSeg = nextSeg.next;
      }
      // console.dir(segHealths);
      return segHealths;
    });
    return {
      boards,
    };
  });

  return {
    groups,
  };
}

export function resetWoodHealth(wh: WoodHealth) {
  wh.groups.forEach((g) => {
    g.boards.forEach((b) =>
      b.forEach((s) => {
        s.health = 1.0;
        s.broken = false;
        s.splinterTopIdx = undefined;
        s.splinterBotIdx = undefined;
      })
    );
  });
}
