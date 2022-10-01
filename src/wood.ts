import { toFRGB, toOKLAB, toV3 } from "./color/color.js";
import { EM, EntityManager } from "./entity-manager.js";
import { AllMeshSymbols } from "./game/assets.js";
import { BulletDef } from "./game/bullet.js";
import { mat4, vec2, vec3, vec4 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { jitter } from "./math.js";
import {
  AABB,
  copyAABB,
  copyLine,
  createAABB,
  createLine,
  doesOverlapAABB,
  emptyLine,
  getAABBFromPositions,
  Line,
  lineSphereIntersections,
  Sphere,
  transformAABB,
  transformLine,
} from "./physics/broadphase.js";
import { ColliderDef } from "./physics/collider.js";
import { PhysicsResultsDef, WorldFrameDef } from "./physics/nonintersection.js";
import { getQuadMeshEdges, Mesh, RawMesh } from "./render/mesh.js";
import { RenderableDef, RendererDef } from "./render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "./temp-pool.js";
import { assert } from "./test.js";
import { never, range } from "./util.js";
import { centroid, vec3Dbg } from "./utils-3d.js";

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
    [WoodenStateDef, WorldFrameDef, RenderableDef],
    [PhysicsResultsDef, RendererDef],
    (es, res) => {
      const { collidesWith } = res.physicsResults;

      const ballAABBWorld = createAABB();
      const segAABBWorld = createAABB();
      const worldLine = emptyLine();

      const before = performance.now();

      let segAABBHits = 0;
      let segMidHits = 0;
      let overlapChecks = 0;

      for (let wooden of es) {
        const meshHandle = wooden.renderable.meshHandle;
        const mesh = meshHandle.readonlyMesh!; // TODO(@darzu): again, shouldn't be modifying "readonlyXXXX"
        const hits = collidesWith.get(wooden.id);
        if (hits) {
          const balls = hits
            .map((h) =>
              em.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef])
            )
            .filter((b) => {
              // TODO(@darzu): check authority and team
              return b;
            });
          for (let ball of balls) {
            // TODO(@darzu): move a bunch of the below into physic system features!
            assert(ball?.collider.shape === "AABB");
            copyAABB(ballAABBWorld, ball.collider.aabb);
            transformAABB(ballAABBWorld, ball.world.transform);
            // TODO(@darzu): this sphere should live elsewhere..
            const worldSphere: Sphere = {
              org: ball.world.position,
              rad: (ballAABBWorld.max[0] - ballAABBWorld.min[0]) * 0.5,
            };

            for (let board of wooden.woodenState.boards) {
              for (let seg of board) {
                // TODO(@darzu):
                copyAABB(segAABBWorld, seg.localAABB);
                transformAABB(segAABBWorld, wooden.world.transform);
                overlapChecks++;
                if (doesOverlapAABB(ballAABBWorld, segAABBWorld)) {
                  // TODO(@darzu): hack, turn boards red on AABB hit
                  segAABBHits += 1;
                  for (let qi of seg.quadSideIdxs) {
                    if (mesh.colors[qi][1] < 1) {
                      // dont change green to red
                      mesh.colors[qi] = [1, 0, 0];
                    }
                  }

                  copyLine(worldLine, seg.midLine);
                  transformLine(worldLine, wooden.world.transform);
                  const midHits = lineSphereIntersections(
                    worldLine,
                    worldSphere
                  );
                  if (midHits) {
                    // console.log(`mid hit: ${midHits}`);
                    segMidHits += 1;
                    for (let qi of seg.quadSideIdxs) {
                      mesh.colors[qi] = [0, 1, 0];
                    }
                    hideSegment(seg, mesh);
                  }
                }
              }
            }
          }
        }
        if (segAABBHits > 0 || segMidHits > 0) {
          // TODO(@darzu): really need sub-mesh updateMesh
          res.renderer.renderer.updateMeshVertices(meshHandle, mesh);
          res.renderer.renderer.updateMeshIndices(meshHandle, mesh);
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

      const after = performance.now();

      if (segAABBHits > 1) {
        console.log(
          `runWooden: ${(after - before).toFixed(
            2
          )}ms, aabb hits: ${segAABBHits}, line hits: ${segMidHits}, aabbChecks: ${overlapChecks}`
        );
      }
    },
    "runWooden"
  );
});

export function createTimberBuilder() {
  // TODO(@darzu): have a system for building wood?

  const W = 0.5; // width
  const D = 0.2; // depth

  let mesh: RawMesh = {
    dbgName: "timber_rib",
    pos: [],
    tri: [],
    quad: [],
    colors: [],
  };

  const cursor: mat4 = mat4.create();

  return {
    width: W,
    depth: D,
    mesh,
    cursor,
    addSplinteredEnd,
    addLoopVerts,
    addSideQuads,
    addEndQuad,
  };

  function addSplinteredEnd() {
    const vi = mesh.pos.length;

    const v0 = vec3.fromValues(0, 0, D);
    const v1 = vec3.fromValues(0, 0, -D);
    vec3.transformMat4(v0, v0, cursor);
    vec3.transformMat4(v1, v1, cursor);
    mesh.pos.push(v0, v1);

    const v_tm = vi + 0;
    const v_tbr = vi + -4;
    const v_tbl = vi + -1;
    const v_bbr = vi + -3;
    const v_bbl = vi + -2;
    // +D side
    mesh.tri.push([v_tm, v_tbl, v_tbr]);
    // -D side
    mesh.tri.push([v_tm + 1, v_bbr, v_bbl]);

    let v_tlast = v_tbl;
    let v_blast = v_bbl;

    const numJags = 5;
    const xStep = (W * 2) / numJags;
    let lastY = 0;
    let lastX = -W;
    for (let i = 0; i <= numJags; i++) {
      const x = i * xStep - W;
      let y = i % 2 === 0 ? 0.4 + jitter(0.3) : 0.2 + jitter(0.1);

      // TODO(@darzu): HACK! This ensures that adjacent "teeth" in the splinter
      //    are properly manifold/convex/something-something
      let cross_last_this = vec2.cross(tempVec3(), [lastX, lastY], [x, y]);
      let maxLoop = 10;
      while (cross_last_this[2] > 0 && maxLoop > 0) {
        if (x < 0) y += 0.1;
        else y -= 0.1;
        vec2.cross(cross_last_this, [lastX, lastY], [x, y]);
        maxLoop--;
      }
      // if (cross_last_this[2] > 0) console.log(`cross_last_this[2] > 0`);

      // +D side
      const vtj = vec3.fromValues(x, y, D);
      vec3.transformMat4(vtj, vtj, cursor);
      const vtji = mesh.pos.length;
      mesh.pos.push(vtj);
      mesh.tri.push([v_tm, vtji, v_tlast]);

      // -D side
      const vbj = vec3.fromValues(x, y, -D);
      vec3.transformMat4(vbj, vbj, cursor);
      mesh.pos.push(vbj);
      mesh.tri.push([v_tm + 1, v_blast, vtji + 1]);

      // D to -D quad
      mesh.quad.push([v_blast, v_tlast, vtji, vtji + 1]);

      v_tlast = vtji;
      v_blast = vtji + 1;

      lastX = x;
      lastY = y;
    }
    // +D side
    mesh.tri.push([v_tm, v_tbr, v_tlast]);
    // -D side
    mesh.tri.push([v_tm + 1, v_blast, v_bbr]);

    // D to -D quad
    mesh.quad.push([v_blast, v_tlast, v_tbr, v_bbr]);
  }

  function addSideQuads() {
    const loop1Idx = mesh.pos.length - 1;
    const loop2Idx = mesh.pos.length - 1 - 4;

    // TODO(@darzu): handle rotation and provoking
    for (let i = 0; i > -4; i--) {
      const i2 = (i - 1) % 4;
      // console.log(`i: ${i}, i2: ${i2}`);
      mesh.quad.push([
        loop2Idx + i,
        loop1Idx + i,
        loop1Idx + i2,
        loop2Idx + i2,
      ]);
    }
  }

  function addEndQuad(facingDown: boolean) {
    // TODO(@darzu): take a "flipped" param
    // TODO(@darzu): handle provoking verts
    const lastIdx = mesh.pos.length - 1;
    const q: vec4 = facingDown
      ? [lastIdx, lastIdx - 1, lastIdx - 2, lastIdx - 3]
      : [lastIdx - 3, lastIdx - 2, lastIdx - 1, lastIdx];
    mesh.quad.push(q);
  }

  function addLoopVerts() {
    const v0 = vec3.fromValues(W, 0, D);
    const v1 = vec3.fromValues(W, 0, -D);
    const v2 = vec3.fromValues(-W, 0, -D);
    const v3 = vec3.fromValues(-W, 0, D);
    vec3.transformMat4(v0, v0, cursor);
    vec3.transformMat4(v1, v1, cursor);
    vec3.transformMat4(v2, v2, cursor);
    vec3.transformMat4(v3, v3, cursor);
    mesh.pos.push(v0, v1, v2, v3);
  }
}

function hideSegment(seg: BoardSeg, m: RawMesh) {
  // TODO(@darzu): how to unhide?
  // TODO(@darzu): probably a more efficient way to do this..
  for (let qi of [...seg.quadSideIdxs, ...seg.quadEndIdxs]) {
    const q = m.quad[qi];
    vec4.set(q, 0, 0, 0, 0);
  }
}

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
          // console.log(`incr: ${incr}`);
          for (let seg of b) {
            for (let qi of [...seg.quadSideIdxs, ...seg.quadEndIdxs]) {
              vec3.copy(m.colors[qi], color);
            }
            vec3.scale(color, color, incr);
          }
        });
        res.renderer.renderer.updateMeshVertices(e.renderable.meshHandle, m);
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
  midLine: Line;
  vertLastLoopIdxs: number[]; // TODO(@darzu): always 4?
  vertNextLoopIdxs: number[]; // TODO(@darzu): always 4?
  quadSideIdxs: number[]; // TODO(@darzu): alway 4?
  quadEndIdxs: number[]; // TODO(@darzu): always 0,1,2?

  // TODO(@darzu): move gameplay elsewhere!
  // gameplay:
  alive: boolean;
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
      const lastMid = centroid([...lastLoop].map((vi) => m.pos[vi]));
      const nextMid = centroid([...nextLoop].map((vi) => m.pos[vi]));
      const mid = createLine(lastMid, nextMid);
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
            midLine: mid,
            vertLastLoopIdxs: [...lastLoop],
            vertNextLoopIdxs: [...nextLoop],
            quadSideIdxs: sideQuads,
            quadEndIdxs: [endQuad],
            alive: true,
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
          vertLastLoopIdxs: [...lastLoop],
          vertNextLoopIdxs: [...nextLoop],
          quadSideIdxs: segQis,
          quadEndIdxs: [],
          alive: true,
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

export function unshareProvokingForWood(m: RawMesh, woodState: WoodenState) {
  // TODO(@darzu): verify this actually works. We should pre-split the mesh
  //  into islands (which will speed up getBoardsFromMesh by a lot), and then
  //  verify each island is unshared.
  const provokingVis = new Set<number>();
  let bIdx = 0;
  for (let b of woodState.boards) {
    // for (let b of [woodState.boards[60]]) {
    // first, do ends
    for (let seg of b) {
      for (let qi of seg.quadEndIdxs) {
        const done = unshareProvokingForBoardQuad(m.quad[qi], qi);
        if (!done)
          console.error(`invalid board ${bIdx}! End cap can't unshare`);
        // console.log(`end: ${m.quad[qi]}`);
      }
    }
    for (let seg of b) {
      for (let qi of seg.quadSideIdxs) {
        const done = unshareProvokingForBoardQuad(
          m.quad[qi],
          qi,
          seg.vertLastLoopIdxs
        );
        // if (done) console.log(`side: ${m.quad[qi]}`);
        if (!done) {
          const done2 = unshareProvokingForBoardQuad(m.quad[qi], qi);
          // if (done2) console.log(`side(2): ${m.quad[qi]}`);
          if (!done2) {
            console.error(`invalid board ${bIdx}; unable to unshare provoking`);
          }
        }
      }
    }
    bIdx++;
  }
  function unshareProvokingForBoardQuad(
    [i0, i1, i2, i3]: vec4,
    qi: number,
    preferVis?: number[]
  ) {
    if ((!preferVis || preferVis.includes(i0)) && !provokingVis.has(i0)) {
      provokingVis.add(i0);
      m.quad[qi] = [i0, i1, i2, i3];
      return true;
    } else if (
      (!preferVis || preferVis.includes(i1)) &&
      !provokingVis.has(i1)
    ) {
      provokingVis.add(i1);
      m.quad[qi] = [i1, i2, i3, i0];
      return true;
    } else if (
      (!preferVis || preferVis.includes(i2)) &&
      !provokingVis.has(i2)
    ) {
      provokingVis.add(i2);
      m.quad[qi] = [i2, i3, i0, i1];
      return true;
    } else if (
      (!preferVis || preferVis.includes(i3)) &&
      !provokingVis.has(i3)
    ) {
      provokingVis.add(i3);
      m.quad[qi] = [i3, i0, i1, i2];
      return true;
    } else {
      return false;
    }
  }
}
