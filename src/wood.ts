import { ColorDef } from "./color-ecs.js";
import { parseHex, parseRGB, toFRGB, toOKLAB, toV3 } from "./color/color.js";
import { EM, Entity, EntityManager } from "./entity-manager.js";
import {
  AllMeshSymbols,
  AssetsDef,
  BLACK,
  mkTimberSplinterEnd,
  mkTimberSplinterFree,
} from "./game/assets.js";
import { BulletDef } from "./game/bullet.js";
import { GravityDef } from "./game/gravity.js";
import { mat4, quat, vec2, vec3, vec4 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { align, jitter } from "./math.js";
import { MusicDef } from "./music.js";
import {
  AABB,
  copyAABB,
  copyLine,
  createAABB,
  createLine,
  doesOverlapAABB,
  emptyLine,
  getAABBFromPositions,
  getLineEnd,
  getLineMid,
  Line,
  lineSphereIntersections,
  mergeAABBs,
  Sphere,
  transformAABB,
  transformLine,
} from "./physics/broadphase.js";
import { ColliderDef } from "./physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "./physics/motion.js";
import { PhysicsResultsDef, WorldFrameDef } from "./physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "./physics/transform.js";
import {
  getQuadMeshEdges,
  mergeMeshes,
  Mesh,
  meshStats,
  normalizeMesh,
  RawMesh,
} from "./render/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RenderDataStdDef,
  RendererDef,
} from "./render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "./temp-pool.js";
import { assert, createIntervalTracker } from "./util.js";
import { never, range } from "./util.js";
import {
  centroid,
  quatFromUpForward,
  randNormalVec3,
  vec3Dbg,
  vec4RotateLeft,
} from "./utils-3d.js";
import { createSplinterPool, SplinterPool } from "./wood-splinters.js";

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
*/

export const WoodStateDef = EM.defineComponent("woodState", (s: WoodState) => {
  return s;
});

export type WoodAssets = Partial<{
  [P in AllMeshSymbols]: WoodState;
}>;

export const WoodAssetsDef = EM.defineComponent(
  "woodAssets",
  (registry: WoodAssets = {}) => registry
);

onInit((em) => {
  em.registerSystem(
    [WoodStateDef, WoodHealthDef, WorldFrameDef, RenderableDef],
    [PhysicsResultsDef, RendererDef],
    (es, res) => {
      const { collidesWith } = res.physicsResults;

      const ballAABBWorld = createAABB();
      const segAABBWorld = createAABB();
      const boardAABBWorld = createAABB();
      const worldLine = emptyLine();

      const before = performance.now();

      let segAABBHits = 0;
      let segMidHits = 0;
      let overlapChecks = 0;

      const DBG_COLOR = false;

      for (let w of es) {
        // console.log(`checking wood!`);
        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.readonlyMesh!; // TODO(@darzu): again, shouldn't be modifying "readonlyXXXX"
        const hits = collidesWith.get(w.id);
        if (hits) {
          const balls = hits
            .map((h) =>
              em.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef])
            )
            .filter((b) => {
              // TODO(@darzu): check authority and team
              return b && b.bullet.health > 0;
            });
          for (let _ball of balls) {
            const ball = _ball!;
            // TODO(@darzu): move a bunch of the below into physic system features!
            assert(ball.collider.shape === "AABB");
            copyAABB(ballAABBWorld, ball.collider.aabb);
            transformAABB(ballAABBWorld, ball.world.transform);
            // TODO(@darzu): this sphere should live elsewhere..
            const worldSphere: Sphere = {
              org: ball.world.position,
              rad: (ballAABBWorld.max[0] - ballAABBWorld.min[0]) * 0.5,
            };

            w.woodState.boards.forEach((board, boardIdx) => {
              if (ball.bullet.health <= 0) return;

              // does the ball hit the board?
              copyAABB(boardAABBWorld, board.localAABB);
              transformAABB(boardAABBWorld, w.world.transform);
              overlapChecks++;
              if (!doesOverlapAABB(ballAABBWorld, boardAABBWorld)) return;

              board.segments.forEach((seg, segIdx) => {
                if (ball.bullet.health <= 0) return;

                // does the ball hit the segment?
                copyAABB(segAABBWorld, seg.localAABB);
                transformAABB(segAABBWorld, w.world.transform);
                overlapChecks++;
                if (doesOverlapAABB(ballAABBWorld, segAABBWorld)) {
                  segAABBHits += 1;
                  for (let qi of seg.quadSideIdxs) {
                    if (DBG_COLOR && mesh.colors[qi][1] < 1) {
                      // dont change green to red
                      mesh.colors[qi] = [1, 0, 0];
                    }
                  }

                  // does the ball hit the middle of the segment?
                  copyLine(worldLine, seg.midLine);
                  transformLine(worldLine, w.world.transform);
                  const midHits = lineSphereIntersections(
                    worldLine,
                    worldSphere
                  );
                  if (midHits) {
                    // console.log(`mid hit: ${midHits}`);
                    segMidHits += 1;
                    if (DBG_COLOR)
                      for (let qi of seg.quadSideIdxs) {
                        mesh.colors[qi] = [0, 1, 0];
                      }
                    // TODO(@darzu): cannon ball health stuff!
                    const woodHealth = w.woodHealth.boards[boardIdx][segIdx];
                    const dmg =
                      Math.min(woodHealth.health, ball.bullet.health) + 0.001;
                    woodHealth.health -= dmg;
                    ball.bullet.health -= dmg;

                    // TODO(@darzu): HUGE HACK to detect hitting a pirate ship
                    if (
                      dmg > 0 &&
                      mesh.dbgName === "pirateShip" &&
                      ball.bullet.team === 1
                    ) {
                      assert(PhysicsParentDef.isOn(w));
                      for (let fn of _destroyPirateShipFns)
                        fn(w.physicsParent.id, w);
                    } else if (ball.bullet.team === 2) {
                      const music = EM.getResource(MusicDef);
                      if (music)
                        music.playChords([2, 3], "minor", 0.2, 5.0, -2);
                    }
                  }
                }
              });
            });
          }
        }
        if (DBG_COLOR && (segAABBHits > 0 || segMidHits > 0)) {
          // TODO(@darzu): really need sub-mesh updateMesh
          // res.renderer.renderer.stdPool.updateMeshVertices(meshHandle, mesh);
          // res.renderer.renderer.updateMeshIndices(meshHandle, mesh);
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
        // console.log(
        //   `runWooden: ${(after - before).toFixed(
        //     2
        //   )}ms, aabb hits: ${segAABBHits}, line hits: ${segMidHits}, aabbChecks: ${overlapChecks}`
        // );
      }
    },
    "runWooden"
  );
});

type DestroyPirateShipFn = (id: number, timber: Entity) => void;
const _destroyPirateShipFns: DestroyPirateShipFn[] = [];
export function registerDestroyPirateHandler(fn: DestroyPirateShipFn) {
  _destroyPirateShipFns.push(fn);
}

export const SplinterParticleDef = EM.defineComponent("splinter", () => {
  return {};
});

const splinterPools = new Map<string, SplinterPool>();

export let _numSplinterEnds = 0;

let _ONCE = true;

onInit((em: EntityManager) => {
  em.registerSystem(
    [WoodStateDef, WorldFrameDef, WoodHealthDef, RenderableDef, ColorDef],
    [RendererDef],
    async (es, res) => {
      // TODO(@darzu):
      for (let w of es) {
        // TODO(@darzu): track start and end offsets for each
        let splinterIndUpdated: number[] = [];
        let segQuadIndUpdated: { min: number; max: number }[] = [];

        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.readonlyMesh!;

        if (_ONCE && mesh.dbgName?.includes("home")) {
          // console.log(`mesh: ${meshStats(mesh)}`);
          // console.log(`woodMesh: ${meshStats(w.woodState.mesh)}`);
          // if (meshHandle.triNum !== mesh.tri.length) {
          //   console.log("mesh.pos.length");
          //   console.log(meshHandle.triNum);
          //   console.log(mesh.tri.length);
          // }
          console.dir(meshHandle);
          console.dir(mesh);
          console.log(meshStats(mesh));
          _ONCE = false;
        }

        w.woodState.boards.forEach((board, bIdx) => {
          let pool: SplinterPool | undefined = undefined;
          board.segments.forEach((seg, sIdx) => {
            const h = w.woodHealth.boards[bIdx][sIdx];
            if (!h.broken && h.health <= 0) {
              h.broken = true;
              // TODO(@darzu): how to unhide?
              // TODO(@darzu): probably a more efficient way to do this..
              let qMin = Infinity;
              let qMax = -Infinity;
              for (let qi of [...seg.quadSideIdxs, ...seg.quadEndIdxs]) {
                const q = mesh.quad[qi];
                vec4.set(q, 0, 0, 0, 0);
                qMin = Math.min(qMin, qi);
                qMax = Math.max(qMax, qi);
              }
              // todo something is wrong with seg quads here!!
              // console.log(`seg quad: ${qMin} ${qMax}`);
              segQuadIndUpdated.push({ min: qMin, max: qMax });

              // get the board's pool
              if (!pool) {
                const poolKey: string = `w${seg.width.toFixed(
                  1
                )}_d${seg.depth.toFixed(1)}_c${vec3Dbg(w.color)}`;
                if (!splinterPools.has(poolKey)) {
                  console.log(`new splinter pool!: ${poolKey}`);
                  pool = createSplinterPool(
                    seg.width,
                    seg.depth,
                    1,
                    vec3.clone(w.color),
                    40
                  );
                  splinterPools.set(poolKey, pool);
                } else {
                  pool = splinterPools.get(poolKey)!;
                }
              }

              // create flying splinter (from pool)
              {
                const splinter = pool.getNext();
                vec3.copy(splinter.color, w.color);
                const pos = getLineMid(vec3.create(), seg.midLine);
                vec3.transformMat4(pos, pos, w.world.transform);
                EM.ensureComponentOn(splinter, PositionDef);
                vec3.copy(splinter.position, pos);
                const rot = getSegmentRotation(seg, false);
                quat.mul(rot, rot, w.world.rotation); // TODO(@darzu): !VERIFY! this works
                EM.ensureComponentOn(splinter, RotationDef);
                quat.copy(splinter.rotation, rot);
                const spin = randNormalVec3(vec3.create());
                const vel = vec3.clone(spin);
                vec3.scale(spin, spin, 0.01);
                em.ensureComponentOn(splinter, AngularVelocityDef);
                vec3.copy(splinter.angularVelocity, spin);
                vec3.scale(vel, vel, 0.01);
                em.ensureComponentOn(splinter, LinearVelocityDef);
                vec3.copy(splinter.linearVelocity, spin);
                em.ensureComponentOn(splinter, GravityDef);
                vec3.copy(splinter.gravity, [0, -3, 0]);
              }

              if (h.prev && !h.prev.broken) {
                // create end caps

                if (w.woodState.splinterState) {
                  const splinterGen = w.woodState.splinterState.generation;
                  const splinterIdx = addSplinterEnd(seg, w.woodState, false);
                  h.splinterBotIdx = splinterIdx;
                  h.splinterBotGeneration = splinterGen;
                  _numSplinterEnds++;
                  splinterIndUpdated.push(splinterIdx);
                }
              }

              if (h.next && !h.next.broken) {
                if (w.woodState.splinterState) {
                  const splinterGen = w.woodState.splinterState.generation;
                  const splinterIdx = addSplinterEnd(seg, w.woodState, true);
                  h.splinterTopIdx = splinterIdx;
                  h.splinterTopGeneration = splinterGen;
                  _numSplinterEnds++;
                  splinterIndUpdated.push(splinterIdx);
                }
              }

              if (
                h.next?.splinterBotIdx !== undefined &&
                w.woodState.splinterState
              ) {
                // TODO(@darzu): ugly
                // TODO(@darzu): this generation stuff seems somewhat broken
                // if (
                //   h.splinterBotGeneration ===
                //     w.woodState.splinterState.generation ||
                //   (h.splinterBotGeneration ===
                //     w.woodState.splinterState.generation - 1 &&
                //     w.woodState.splinterState.nextSplinterIdx <=
                //       h.next.splinterBotIdx)
                // ) {
                removeSplinterEnd(h.next.splinterBotIdx, w.woodState);
                // } else {
                //   // console.log(`skipping removal b/c generation mismatch!`);
                // }
                splinterIndUpdated.push(h.next.splinterBotIdx);
                h.next.splinterBotIdx = undefined;
                h.next.splinterBotGeneration = undefined;
                _numSplinterEnds--;
              }

              if (
                h.prev?.splinterTopIdx !== undefined &&
                w.woodState.splinterState
              ) {
                // if (
                //   h.splinterTopGeneration ===
                //     w.woodState.splinterState.generation ||
                //   (h.splinterTopGeneration ===
                //     w.woodState.splinterState.generation - 1 &&
                //     w.woodState.splinterState.nextSplinterIdx <=
                //       h.prev.splinterTopIdx)
                // ) {
                removeSplinterEnd(h.prev.splinterTopIdx, w.woodState);
                // } else {
                //   // console.log(`skipping removal b/c generation mismatch!`);
                // }
                splinterIndUpdated.push(h.prev.splinterTopIdx);
                h.prev.splinterTopIdx = undefined;
                h.prev.splinterTopGeneration = undefined;
                _numSplinterEnds--;
              }
            }
          });
        });

        const ws = w.woodState;
        if (
          ws.splinterState &&
          (splinterIndUpdated.length || segQuadIndUpdated.length)
        ) {
          const triIntervals = createIntervalTracker(100);
          const quadIntervals = createIntervalTracker(100);
          const vertIntervals = createIntervalTracker(100);

          for (let spI of splinterIndUpdated) {
            const tMin = ws.splinterState.triOffset + spI * _trisPerSplinter;
            const tMax = tMin + _trisPerSplinter;
            triIntervals.addRange(tMin, tMax);

            const qMin = ws.splinterState.quadOffset + spI * _quadsPerSplinter;
            const qMax = qMin + _quadsPerSplinter;
            quadIntervals.addRange(qMin, qMax);

            const vMin = ws.splinterState.vertOffset + spI * _vertsPerSplinter;
            const vMax = vMin + _vertsPerSplinter;
            vertIntervals.addRange(vMin, vMax);
          }

          for (let { min, max } of segQuadIndUpdated) {
            quadIntervals.addRange(min, max);
          }

          triIntervals.finishInterval();
          quadIntervals.finishInterval();
          vertIntervals.finishInterval();

          console.dir(triIntervals.intervals);
          console.dir(quadIntervals.intervals);
          console.dir(vertIntervals.intervals);

          for (let { min, max } of triIntervals.intervals)
            res.renderer.renderer.stdPool.updateMeshTriangles(
              meshHandle,
              mesh,
              min,
              max - min + 1
            );

          for (let { min, max } of quadIntervals.intervals) {
            console.log(`updating quads: ${min} ${max}`);
            res.renderer.renderer.stdPool.updateMeshQuads(
              meshHandle,
              mesh,
              min,
              max - min + 1
            );
          }

          for (let { min, max } of vertIntervals.intervals)
            res.renderer.renderer.stdPool.updateMeshVertices(
              meshHandle,
              mesh,
              min,
              max - min + 1
            );
        }
      }
    },
    "woodHealth"
  );
});

function getSegmentRotation(seg: BoardSeg, top: boolean) {
  let segNorm = vec3.create();
  let biggestArea2 = 0;
  for (let v of seg.areaNorms) {
    const a = vec3.sqrLen(v);
    if (a > biggestArea2) {
      biggestArea2 = a;
      vec3.copy(segNorm, v);
    }
  }

  const endNorm = vec3.copy(tempVec3(), seg.midLine.ray.dir);
  if (top) {
    vec3.negate(endNorm, endNorm);
  }

  const rot = quat.create();
  quatFromUpForward(rot, endNorm, segNorm);
  return rot;
}

// TODO(@darzu): POOL THESE SPLINTER ENDS!

let _tempSplinterMesh: RawMesh = createEmptyMesh("splinterEnd");

function removeSplinterEnd(splinterIdx: number, wood: WoodState) {
  // TODO(@darzu): only do this if the splinter is free!!!!
  assert(wood.splinterState);
  const sIdx = splinterIdx;
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;

  for (let i = 0; i < _trisPerSplinter; i++) {
    vec3.zero(wood.mesh.tri[triIdx + i]);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    vec4.zero(wood.mesh.quad[quadIdx + i]);
  }
}

function addSplinterEnd(seg: BoardSeg, wood: WoodState, top: boolean): number {
  assert(wood.splinterState, "!wood.splinterState");
  const W = seg.width;
  const D = seg.depth;
  const pos = vec3.copy(tempVec3(), seg.midLine.ray.org);
  if (top) {
    getLineEnd(pos, seg.midLine);
  }

  _tempSplinterMesh.pos.length = 0;
  _tempSplinterMesh.quad.length = 0;
  _tempSplinterMesh.tri.length = 0;

  const rot = getSegmentRotation(seg, top);
  // TODO(@darzu): put these into a pool
  // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  const cursor = mat4.fromRotationTranslation(mat4.create(), rot, pos);
  {
    const b = createTimberBuilder(_tempSplinterMesh);
    b.width = W;
    b.depth = D;

    b.setCursor(cursor);
    b.addLoopVerts();
    // TODO(@darzu): HACK. We're "snapping" the splinter loop and segment loops
    //    together via distance; we should be able to do this in a more analytic way
    const snapDistSqr = Math.pow(0.2 * 0.5, 2);
    const loop = (
      top ? seg.vertNextLoopIdxs : seg.vertLastLoopIdxs
    ) as number[];
    for (let vi = b.mesh.pos.length - 4; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      for (let lp of loop.map((vi2) => wood.mesh.pos[vi2])) {
        if (vec3.sqrDist(p, lp) < snapDistSqr) {
          vec3.copy(p, lp);
          break;
        }
      }
    }
    b.addEndQuad(true);

    b.setCursor(cursor);
    mat4.translate(b.cursor, b.cursor, [0, 0.1, 0]);
    b.addSplinteredEnd(b.mesh.pos.length, 5);

    // TODO(@darzu): triangle vs quad coloring doesn't work
    // b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    // b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
  }
  // TODO(@darzu): don't alloc all this mesh stuff!!
  const splinterMesh = normalizeMesh(_tempSplinterMesh);

  // copy mesh into main mesh
  const sIdx = wood.splinterState.nextSplinterIdx;
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;
  // console.log(`copying to: ${vertIdx} ${triIdx} ${quadIdx}`);

  for (let i = 0; i < _vertsPerSplinter; i++) {
    vec3.copy(wood.mesh.pos[vertIdx + i], splinterMesh.pos[i]);
  }
  for (let i = 0; i < _trisPerSplinter; i++) {
    splinterMesh.tri[i][0] += vertIdx;
    splinterMesh.tri[i][1] += vertIdx;
    splinterMesh.tri[i][2] += vertIdx;
    vec3.copy(wood.mesh.tri[triIdx + i], splinterMesh.tri[i]);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    splinterMesh.quad[i][0] += vertIdx;
    splinterMesh.quad[i][1] += vertIdx;
    splinterMesh.quad[i][2] += vertIdx;
    splinterMesh.quad[i][3] += vertIdx;
    vec4.copy(wood.mesh.quad[quadIdx + i], splinterMesh.quad[i]);
  }

  // advance the pool prt
  wood.splinterState.nextSplinterIdx += 1;
  if (
    wood.splinterState.nextSplinterIdx >= wood.splinterState.maxNumSplinters
  ) {
    wood.splinterState.nextSplinterIdx = 0;
    wood.splinterState.generation++;
    // console.log(`splinter gen: ${wood.splinterState.generation}`);
  }

  return sIdx;
  // return splinter;
}

function createSplinterEnd(
  seg: BoardSeg,
  boardMesh: Mesh,
  top: boolean,
  W: number,
  D: number
) {
  const pos = vec3.copy(tempVec3(), seg.midLine.ray.org);
  if (top) {
    getLineEnd(pos, seg.midLine);
  }

  const rot = getSegmentRotation(seg, top);
  // TODO(@darzu): put these into a pool
  const splinter = EM.newEntity();
  // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  const cursor = mat4.fromRotationTranslation(mat4.create(), rot, pos);
  let _splinterMesh: RawMesh = createEmptyMesh("splinterEnd");
  {
    const b = createTimberBuilder(_splinterMesh);
    b.width = W;
    b.depth = D;

    b.setCursor(cursor);
    b.addLoopVerts();
    // TODO(@darzu): HACK. We're "snapping" the splinter loop and segment loops
    //    together via distance; we should be able to do this in a more analytic way
    const snapDistSqr = Math.pow(0.2 * 0.5, 2);
    const loop = (
      top ? seg.vertNextLoopIdxs : seg.vertLastLoopIdxs
    ) as number[];
    for (let vi = b.mesh.pos.length - 4; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      for (let lp of loop.map((vi2) => boardMesh.pos[vi2])) {
        if (vec3.sqrDist(p, lp) < snapDistSqr) {
          vec3.copy(p, lp);
          break;
        }
      }
    }
    b.addEndQuad(true);

    b.setCursor(cursor);
    mat4.translate(b.cursor, b.cursor, [0, 0.1, 0]);
    b.addSplinteredEnd(b.mesh.pos.length, 5);

    // TODO(@darzu): triangle vs quad coloring doesn't work
    b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
  }
  const splinterMesh = normalizeMesh(_splinterMesh);
  EM.ensureComponentOn(splinter, RenderableConstructDef, splinterMesh);
  EM.ensureComponentOn(splinter, ColorDef, [
    Math.random(),
    Math.random(),
    Math.random(),
  ]);
  EM.ensureComponentOn(splinter, PositionDef);
  EM.ensureComponentOn(splinter, RotationDef);
  EM.ensureComponentOn(splinter, WorldFrameDef);
  return splinter;
}

export function createEmptyMesh(dbgName: string) {
  let mesh: RawMesh = {
    dbgName,
    pos: [],
    tri: [],
    quad: [],
    colors: [],
  };
  return mesh;
}

export type TimberBuilder = ReturnType<typeof createTimberBuilder>;
export function createTimberBuilder(mesh: RawMesh) {
  // TODO(@darzu): have a system for building wood?

  // const W = 0.5; // width
  // const D = 0.2; // depth

  const cursor: mat4 = mat4.create();

  const b = {
    width: 0.2,
    depth: 0.2,
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
    const vi = mesh.pos.length;

    const v0 = vec3.fromValues(0, 0, b.depth);
    const v1 = vec3.fromValues(0, 0, -b.depth);
    vec3.transformMat4(v0, v0, cursor);
    vec3.transformMat4(v1, v1, cursor);
    mesh.pos.push(v0, v1);

    const v_tm = vi + 0;
    const v_tbr = lastLoopEndVi + -4;
    const v_tbl = lastLoopEndVi + -1;
    const v_bbr = lastLoopEndVi + -3;
    const v_bbl = lastLoopEndVi + -2;
    // +D side
    mesh.tri.push([v_tm, v_tbl, v_tbr]);
    // -D side
    mesh.tri.push([v_tm + 1, v_bbr, v_bbl]);

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
      let cross_last_this = vec2.cross(tempVec3(), [lastX, lastY], [x, y]);
      let maxLoop = 10;
      while (cross_last_this[2] > 0 && maxLoop > 0) {
        if (x < 0) y += 0.1;
        else y -= 0.1;
        vec2.cross(cross_last_this, [lastX, lastY], [x, y]);
        maxLoop--;
      }
      if (cross_last_this[2] > 0) console.warn(`non-manifold!`);

      // +D side
      const vtj = vec3.fromValues(x, y, d);
      vec3.transformMat4(vtj, vtj, cursor);
      const vtji = mesh.pos.length;
      mesh.pos.push(vtj);
      mesh.tri.push([v_tm, vtji, v_tlast]);

      // -D side
      const vbj = vec3.fromValues(x, y, -d);
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
    const v0 = vec3.fromValues(b.width, 0, b.depth);
    const v1 = vec3.fromValues(b.width, 0, -b.depth);
    const v2 = vec3.fromValues(-b.width, 0, -b.depth);
    const v3 = vec3.fromValues(-b.width, 0, b.depth);
    vec3.transformMat4(v0, v0, cursor);
    vec3.transformMat4(v1, v1, cursor);
    vec3.transformMat4(v2, v2, cursor);
    vec3.transformMat4(v3, v3, cursor);
    mesh.pos.push(v0, v1, v2, v3);
  }
}

interface OBB {
  // TODO(@darzu): 3 axis + lengths
}

// each board has an AABB, OBB,
interface BoardSeg {
  localAABB: AABB;
  midLine: Line;
  areaNorms: vec3[];
  width: number;
  depth: number;
  vertLastLoopIdxs: vec4; // TODO(@darzu): always 4?
  vertNextLoopIdxs: vec4; // TODO(@darzu): always 4?
  quadSideIdxs: number[]; // TODO(@darzu): alway 4?
  quadEndIdxs: number[]; // TODO(@darzu): always 0,1,2?
}
interface Board {
  segments: BoardSeg[];
  localAABB: AABB;
}

// v24, t16, q8
// TODO(@darzu): reduce to v18, t16, q8
const _vertsPerSplinter = 24;
const _trisPerSplinter = 16;
const _quadsPerSplinter = 8;
interface WoodSplinterState {
  maxNumSplinters: number;
  nextSplinterIdx: number;
  vertOffset: number;
  quadOffset: number;
  triOffset: number;
  generation: number;
}

interface WoodState {
  mesh: RawMesh;
  usedVertIdxs: Set<number>;
  usedQuadIdxs: Set<number>;
  boards: Board[];

  splinterState?: WoodSplinterState;
}

export function reserveSplinterSpace(wood: WoodState, maxSplinters: number) {
  // console.log("reserveSplinterSpace");
  // console.log(meshStats(wood.mesh));
  const vertOffset = wood.mesh.pos.length;
  const quadOffset = wood.mesh.quad.length;
  const triOffset = wood.mesh.tri.length;
  range(maxSplinters * _vertsPerSplinter).forEach((_) =>
    wood.mesh.pos.push(vec3.create())
  );
  range(maxSplinters * _trisPerSplinter).forEach((_) =>
    wood.mesh.tri.push(vec3.create())
  );
  range(maxSplinters * _quadsPerSplinter).forEach((_) =>
    wood.mesh.quad.push(vec4.create())
  );
  const newFaces = maxSplinters * (_quadsPerSplinter + _trisPerSplinter);
  range(newFaces).forEach((_) => {
    wood.mesh.surfaceIds!.push(wood.mesh.surfaceIds!.length);
    wood.mesh.colors.push(vec3.clone(BLACK));
  });

  wood.splinterState = {
    maxNumSplinters: maxSplinters,
    nextSplinterIdx: 0,
    vertOffset,
    quadOffset,
    triOffset,
    generation: 1,
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

const TRACK_INVALID_BOARDS = false;

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
      const areaNorms = segQis.map((qi) => {
        const ps = (m.quad[qi] as number[]).map((vi) => m.pos[vi]);
        // NOTE: assumes segments are parallelograms
        const ab = vec3.subtract(tempVec3(), ps[1], ps[0]);
        const ac = vec3.subtract(tempVec3(), ps[3], ps[0]);
        const areaNorm = vec3.cross(vec3.create(), ab, ac);
        // console.log(`vec3.len(areaNorm): ${vec3.len(areaNorm)}`);
        return areaNorm;
      });
      const len1 = vec3.dist(m.pos[lastLoop[1]], m.pos[lastLoop[0]]);
      const len2 = vec3.dist(m.pos[lastLoop[3]], m.pos[lastLoop[0]]);
      const width = Math.max(len1, len2) * 0.5;
      const depth = Math.min(len1, len2) * 0.5;
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
            areaNorms,
            width,
            depth,
            vertLastLoopIdxs: lastLoop,
            vertNextLoopIdxs: nextLoop,
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
          midLine: mid,
          areaNorms,
          width,
          depth,
          vertLastLoopIdxs: lastLoop,
          vertNextLoopIdxs: nextLoop,
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

  const woodenState: WoodState = {
    mesh: m,
    boards,
    usedVertIdxs: structureVis,
    usedQuadIdxs: structureQis,
  };

  return woodenState;
}

export function unshareProvokingForWood(m: RawMesh, woodState: WoodState) {
  // TODO(@darzu): verify this actually works. We should pre-split the mesh
  //  into islands (which will speed up getBoardsFromMesh by a lot), and then
  //  verify each island is unshared.
  const provokingVis = new Set<number>();
  let bIdx = 0;
  for (let b of woodState.boards) {
    // for (let b of [woodState.boards[60]]) {
    // first, do ends
    for (let seg of b.segments) {
      for (let qi of seg.quadEndIdxs) {
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

export const WoodHealthDef = EM.defineComponent(
  "woodHealth",
  (s: WoodHealth) => {
    return s;
  }
);

interface SegHealth {
  prev?: SegHealth;
  next?: SegHealth;
  health: number;
  broken: boolean;
  splinterTopIdx?: number;
  splinterBotIdx?: number;
  splinterTopGeneration?: number;
  splinterBotGeneration?: number;
}
type BoardHealth = SegHealth[];
interface WoodHealth {
  boards: BoardHealth[];
}

export function createWoodHealth(w: WoodState) {
  // TODO(@darzu):
  return {
    boards: w.boards.map((b) => {
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
    }),
  };
}
