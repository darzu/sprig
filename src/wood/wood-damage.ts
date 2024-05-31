import { AudioDef } from "../audio/audio.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { BulletDef } from "../cannons/bullet.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16, colorToStr } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { Entity } from "../ecs/em-entities.js";
import { Phase } from "../ecs/sys-phase.js";
import { VERBOSE_LOG } from "../flags.js";
import { V4, V3, quat } from "../matrix/sprig-matrix.js";
import { meshStats } from "../meshes/mesh.js";
import { GravityDef } from "../motion/gravity.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { eventWizard } from "../net/events.js";
import {
  createAABB,
  copyAABB,
  transformAABB,
  doesOverlapAABB,
  cloneAABB,
} from "../physics/aabb.js";
import {
  emptyLine,
  Sphere,
  copyLine,
  transformLine,
  lineSphereIntersections,
  getLineMid,
} from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import {
  WorldFrameDef,
  PhysicsResultsDef,
  PhysicsStateDef,
} from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { meshPoolPtr } from "../render/pipelines/std-scene.js";
import { RenderableDef, RendererDef } from "../render/renderer-ecs.js";
import { sketchAABB, sketchLine, sketchLine2 } from "../utils/sketch.js";
import { assert } from "../utils/util-no-import.js";
import { dbgOnce, createIntervalTracker } from "../utils/util.js";
import { randNormalVec3, vec3Dbg } from "../utils/utils-3d.js";
import { SplinterPoolsDef, SplinterPool } from "./wood-splinters.js";
import {
  WoodStateDef,
  WoodHealthDef,
  addSplinterEndToSegment,
  getSegmentRotation,
  removeSplinterEnd,
  _quadsPerSplinter,
  _trisPerSplinter,
  _vertsPerSplinter,
} from "./wood-builder.js";

const DBG_WOOD_DMG = true;

export let _dbgNumSplinterEnds = 0;

// TODO(@darzu): SUPER HACK
type DestroyPirateShipFn = (id: number, timber: Entity) => void;
const _destroyPirateShipFns: DestroyPirateShipFn[] = [];
export function registerDestroyPirateHandler(fn: DestroyPirateShipFn) {
  _destroyPirateShipFns.push(fn);
}

interface BoardSegHit {
  groupIdx: number;
  boardIdx: number;
  segIdx: number;
  dmg: number;
}

const raiseDmgWood = eventWizard(
  "dmg-wood",
  [[WoodHealthDef]] as const,
  ([wood], hits: BoardSegHit[]) => {
    if (DBG_WOOD_DMG)
      console.log(`dmg-wood against ${wood.id} w/ ${hits.length} hits`);
    for (let { groupIdx, boardIdx, segIdx, dmg } of hits) {
      wood.woodHealth.groups[groupIdx].boards[boardIdx][segIdx].health -= dmg;

      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("woodbreak", res.soundSet["woodbreak.mp3"], 0.02);
      });

      // // TODO(@darzu): HUGE HACK to detect hitting a pirate ship
      // if (dmg > 0 && mesh.dbgName === "pirateShip" && ball.bullet.team === 1) {
      //   assert(PhysicsParentDef.isOn(w));
      //   for (let fn of _destroyPirateShipFns) fn(w.physicsParent.id, w);
      // } else if (ball.bullet.team === 2) {
      //   //const music = EM.getResource(AudioDef);
      //   // if (music)
      //   //   music.playChords([2, 3], "minor", 0.2, 1.0, -2);
      // }
    }
  },
  {
    legalEvent: ([wood], hits: BoardSegHit[]) => {
      assert(hits.length < 0xff /*uint 8*/);
      assert(wood.woodHealth.groups.length < 0xff /*uint 8*/);
      assert(wood.woodHealth.groups[0].boards.length < 0xff /*uint 8*/);
      // NOTE: doesn't thoroughly enforce anything but segments need to fit in uint8 too
      assert(wood.woodHealth.groups[0].boards[0].length < 0xff /*uint 8*/);
      return true;
    },
    serializeExtra: (buf, hits: BoardSegHit[]) => {
      buf.writeUint8(hits.length);
      for (let { groupIdx, boardIdx, segIdx, dmg } of hits) {
        buf.writeUint8(groupIdx);
        buf.writeUint8(boardIdx);
        buf.writeUint8(segIdx);
        const dmgAsU8 = dmg * 0xff;
        buf.writeUint8(dmgAsU8); // TODO(@darzu): have a unorm serialze type?
      }
    },
    deserializeExtra: (buf) => {
      const len = buf.readUint8();
      const hits: BoardSegHit[] = [];
      for (let i = 0; i < len; i++) {
        const groupIdx = buf.readUint8();
        const boardIdx = buf.readUint8();
        const segIdx = buf.readUint8();
        const dmgAsU8 = buf.readUint8();
        const dmg = dmgAsU8 / 0xff;
        hits.push({ groupIdx, boardIdx, segIdx, dmg });
      }
      return hits;
    },
  }
);

EM.addEagerInit([WoodStateDef], [], [], () => {
  EM.addSystem(
    "woodDetectCollisions",
    Phase.GAME_WORLD,
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
        if (!PhysicsStateDef.isOn(w)) continue;

        // console.log(`checking wood!`);
        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.mesh!; // TODO(@darzu): again, shouldn't be modifying "readonlyXXXX"
        const hits = collidesWith.get(w.id);
        if (hits) {
          let boardSegHits: BoardSegHit[] = []; // TODO(@darzu): PERF. reuse for better memory?
          const balls = hits
            .map((h) =>
              EM.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef])
            )
            .filter((b) => {
              // TODO(@darzu): check authority and team
              return b && b.bullet.health > 0;
            });

          if (balls.length) {
            if (DBG_WOOD_DMG) {
              w._phys.colliders.forEach((col, idx) => {
                sketchAABB(cloneAABB(col.aabb), {
                  key: `woodOuterAABB_${idx}`,
                  color: ENDESGA16.yellow,
                });
              });
            }
          }

          for (let _ball of balls) {
            const ball = _ball!;
            // console.log(`hit: ${ball.id}`);
            // TODO(@darzu): move a bunch of the below into physic system features!
            assert(ball.collider.shape === "AABB");
            copyAABB(ballAABBWorld, ball.collider.aabb); // TODO(@darzu): PERF. used physics state aabb
            transformAABB(ballAABBWorld, ball.world.transform);
            // TODO(@darzu): PERF! We should probably translate ball into wood space not both into world space!
            // TODO(@darzu): this sphere should live elsewhere..
            const worldSphere: Sphere = {
              org: ball.world.position,
              rad: (ballAABBWorld.max[0] - ballAABBWorld.min[0]) * 0.4,
            };

            if (DBG_WOOD_DMG) {
              sketchAABB(cloneAABB(ballAABBWorld), {
                key: `ballHit_${ball.id}`,
                color: ENDESGA16.red,
              });
            }

            // TODO(@darzu): PERF. Use AABBs in the groups!
            w.woodState.groups.forEach((group, groupIdx) => {
              group.boards.forEach((board, boardIdx) => {
                if (ball.bullet.health <= 0) return;

                // does the ball hit the board?
                copyAABB(boardAABBWorld, board.localAABB);
                transformAABB(boardAABBWorld, w.world.transform);
                overlapChecks++;
                if (!doesOverlapAABB(ballAABBWorld, boardAABBWorld)) return;

                if (DBG_WOOD_DMG) {
                  sketchAABB(cloneAABB(boardAABBWorld), {
                    key: `boardHit_${groupIdx}_${boardIdx}`,
                    color: ENDESGA16.darkRed,
                  });
                }

                board.segments.forEach((seg, segIdx) => {
                  if (ball.bullet.health <= 0) return;

                  // does the ball hit the segment?
                  copyAABB(segAABBWorld, seg.localAABB);
                  transformAABB(segAABBWorld, w.world.transform);
                  overlapChecks++;
                  if (!doesOverlapAABB(ballAABBWorld, segAABBWorld)) return;

                  if (DBG_WOOD_DMG) {
                    sketchAABB(cloneAABB(boardAABBWorld), {
                      key: `segAABBHit_${groupIdx}_${boardIdx}_${segIdx}`,
                      color: ENDESGA16.yellow,
                    });
                  }

                  segAABBHits += 1;
                  // for (let qi of seg.quadSideIdxs) {
                  //   if (DBG_COLOR && mesh.colors[qi][1] < 1) {
                  //     // dont change green to red
                  //     mesh.colors[qi] = [1, 0, 0];
                  //   }
                  // }

                  // does the ball hit the middle of the segment?
                  copyLine(worldLine, seg.midLine);
                  transformLine(worldLine, w.world.transform);
                  const midHits = lineSphereIntersections(
                    worldLine,
                    worldSphere
                  );
                  if (!midHits) return;

                  if (DBG_WOOD_DMG) {
                    sketchLine2(worldLine, {
                      key: `segMidHit_${groupIdx}_${boardIdx}_${segIdx}`,
                      color: ENDESGA16.red,
                    });
                  }

                  // console.log(`mid hit: ${midHits}`);
                  segMidHits += 1;
                  // if (DBG_COLOR)
                  //   for (let qi of seg.quadSideIdxs) {
                  //     mesh.colors[qi] = [0, 1, 0];
                  //   }
                  // TODO(@darzu): cannon ball health stuff!

                  // determine dmg
                  const woodHealth =
                    w.woodHealth.groups[groupIdx].boards[boardIdx][segIdx];
                  const dmg =
                    Math.min(woodHealth.health, ball.bullet.health) + 0.001;

                  // dmg the ball
                  ball.bullet.health -= dmg;

                  // dmg the wood
                  boardSegHits.push({ groupIdx, boardIdx, segIdx, dmg });
                });
              });
            });
          }

          if (boardSegHits.length) {
            raiseDmgWood(w, boardSegHits);
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
    }
  );

  EM.addSystem(
    "woodApplyDamageAndSplinter",
    Phase.GAME_WORLD,
    [WoodStateDef, WorldFrameDef, WoodHealthDef, RenderableDef],
    [RendererDef, SplinterPoolsDef],
    (es, res) => {
      const stdPool = res.renderer.renderer.getCyResource(meshPoolPtr)!;

      for (let w of es) {
        let splinterIndUpdated: number[] = [];
        let segQuadIndUpdated: { min: number; max: number }[] = [];

        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.mesh!;

        w.woodState.groups.forEach((group, gIdx) => {
          group.boards.forEach((board, bIdx) => {
            let pool: SplinterPool | undefined = undefined;
            board.segments.forEach((seg, sIdx) => {
              const h = w.woodHealth.groups[gIdx].boards[bIdx][sIdx];
              if (!h.broken && h.health <= 0) {
                if (DBG_WOOD_DMG)
                  console.log(
                    `breaking ${w.id}:"${group.name}":${bIdx}:${sIdx}`
                  );

                h.broken = true;
                // TODO(@darzu): how to unhide?
                // TODO(@darzu): probably a more efficient way to do this..
                let qMin = Infinity;
                let qMax = -Infinity;
                for (let qi of [
                  ...seg.quadSideIdxs,
                  // TODO(@darzu): PERF. how performant is the below?
                  ...(seg.quadBackIdx ? [seg.quadBackIdx] : []),
                  ...(seg.quadFrontIdx ? [seg.quadFrontIdx] : []),
                ]) {
                  const q = mesh.quad[qi];
                  V4.set(0, 0, 0, 0, q);
                  qMin = Math.min(qMin, qi);
                  qMax = Math.max(qMax, qi);
                }
                // todo something is wrong with seg quads here!!
                // console.log(`seg quad: ${qMin} ${qMax}`);
                segQuadIndUpdated.push({ min: qMin, max: qMax });

                // get the board's pool
                if (!pool) {
                  pool = res.splinterPools.getOrCreatePool(seg);
                }

                // create flying splinter (from pool)
                // TODO(@darzu): MOVE into wood-splinters.ts ?
                {
                  const qi = seg.quadSideIdxs[0];
                  const quadColor = mesh.colors[qi];
                  const splinter = pool.getNext();
                  if (RenderableDef.isOn(splinter))
                    splinter.renderable.hidden = false;
                  // set entity color
                  if (ColorDef.isOn(w)) V3.copy(splinter.color, w.color);
                  else V3.zero(splinter.color);
                  // set mesh color
                  // console.log(`splinterColor: ${colorToStr(quadColor)}`);
                  V3.add(splinter.color, quadColor, splinter.color);
                  // set position
                  const pos = getLineMid(V3.mk(), seg.midLine);
                  V3.tMat4(pos, w.world.transform, pos);
                  EM.set(splinter, PositionDef, pos);
                  // const rot = getSegmentRotation(seg, false);
                  const rot = quat.copy(quat.tmp(), seg.midRotation);
                  quat.mul(rot, w.world.rotation, rot); // TODO(@darzu): !VERIFY! this works
                  EM.set(splinter, RotationDef, rot);
                  const spin = randNormalVec3(V3.mk());
                  const vel = V3.clone(spin);
                  V3.scale(spin, 0.01, spin);
                  EM.set(splinter, AngularVelocityDef, spin);
                  V3.scale(vel, 0.01, vel);
                  EM.set(splinter, LinearVelocityDef, spin);
                  EM.set(splinter, GravityDef, [0, 0, -3 * 0.00001]);
                }

                if (h.prev && !h.prev.broken) {
                  // create end caps
                  assert(w.woodState.splinterState);
                  // const splinterGen = w.woodState.splinterState.generation;
                  const splinterIdx = addSplinterEndToSegment(
                    seg,
                    w.woodState,
                    false
                  );
                  if (splinterIdx !== undefined) {
                    h.splinterBotIdx = splinterIdx;
                    // h.splinterBotGeneration = splinterGen;
                    _dbgNumSplinterEnds++;
                    splinterIndUpdated.push(splinterIdx);
                  }
                }

                if (h.next && !h.next.broken) {
                  assert(w.woodState.splinterState);
                  // const splinterGen = w.woodState.splinterState.generation;
                  const splinterIdx = addSplinterEndToSegment(
                    seg,
                    w.woodState,
                    true
                  );
                  if (splinterIdx !== undefined) {
                    h.splinterTopIdx = splinterIdx;
                    // h.splinterTopGeneration = splinterGen;
                    _dbgNumSplinterEnds++;
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
                  w.woodState.splinterState.splinterIdxPool.free(
                    h.next.splinterBotIdx
                  );
                  h.next.splinterBotIdx = undefined;
                  // h.next.splinterBotGeneration = undefined;
                  _dbgNumSplinterEnds--;
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
                  w.woodState.splinterState.splinterIdxPool.free(
                    h.prev.splinterTopIdx
                  );
                  h.prev.splinterTopIdx = undefined;
                  // h.prev.splinterTopGeneration = undefined;
                  _dbgNumSplinterEnds--;
                }
              }
            });
          });
        });

        const ws = w.woodState;
        if (
          ws.splinterState &&
          (splinterIndUpdated.length || segQuadIndUpdated.length)
        ) {
          // TODO(@darzu): probably just create these trackers above? Persist them
          //    frame to frame.
          const triIntervals = createIntervalTracker(100);
          const quadIntervals = createIntervalTracker(100);
          const vertIntervals = createIntervalTracker(100);

          for (let spI of splinterIndUpdated) {
            const tMin = ws.splinterState.triOffset + spI * _trisPerSplinter;
            const tMax = tMin + _trisPerSplinter - 1;
            triIntervals.addRange(tMin, tMax);

            const qMin = ws.splinterState.quadOffset + spI * _quadsPerSplinter;
            const qMax = qMin + _quadsPerSplinter - 1;
            quadIntervals.addRange(qMin, qMax);

            const vMin = ws.splinterState.vertOffset + spI * _vertsPerSplinter;
            const vMax = vMin + _vertsPerSplinter - 1;
            vertIntervals.addRange(vMin, vMax);
          }

          for (let { min, max } of segQuadIndUpdated)
            quadIntervals.addRange(min, max);

          triIntervals.finishInterval();
          quadIntervals.finishInterval();
          vertIntervals.finishInterval();

          for (let { min, max } of triIntervals.intervals)
            stdPool.updateMeshTriInds(meshHandle, mesh, min, max - min + 1);

          for (let { min, max } of quadIntervals.intervals)
            stdPool.updateMeshQuadInds(meshHandle, mesh, min, max - min + 1);

          for (let { min, max } of vertIntervals.intervals)
            stdPool.updateMeshVertices(meshHandle, mesh, min, max - min + 1);
        }
      }
    }
  );
});
