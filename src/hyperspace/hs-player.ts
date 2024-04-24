// player controller component and system

// player controller component and system
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { TimeDef } from "../time/time.js";
import { ColorDef } from "../color/color-ecs.js";
import { FinishedDef } from "../ecs/em-helpers.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { AABBCollider, Collider, ColliderDef } from "../physics/collider.js";
import { Ray } from "../physics/broadphase.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { cloneMesh, scaleMesh3 } from "../meshes/mesh.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import { ModelerDef } from "../meshes/modeler.js";
import { DeletedDef } from "../ecs/delete.js";
import {
  CameraDef,
  CameraFollowDef,
  setCameraFollowPosition,
} from "../camera/camera.js";
import { defineSerializableComponent } from "../ecs/em-helpers.js";
import { ControllableDef } from "../input/controllable.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { drawLine } from "../utils/utils-game.js";
import { DevConsoleDef } from "../debug/console.js";
import { max } from "../utils/math.js";
import { AnimateToDef } from "../animation/animate-to.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { HsShipLocalDef } from "./hyperspace-ship.js";
import { Phase } from "../ecs/sys-phase.js";
import { CanManDef } from "../turret/turret.js";

// TODO(@darzu): it'd be great if these could hook into some sort of
//    dev mode you could toggle at runtime.

export function createHsPlayer() {
  // console.log("create player!");
  const e = EM.new();
  EM.set(e, PlayerHsPropsDef, V(0, 100, 0));
  EM.addResource(LocalPlayerEntityDef, e.id);
  return e;
}

export const HsPlayerDef = EM.defineComponent("hsPlayer", () => {
  return {
    // hat stuff
    // TODO(@darzu): better abstraction
    hat: 0,
    tool: 0,
    interacting: false,
    clicking: false,
    // manning: false,
    dropping: false,
    leftLegId: 0,
    rightLegId: 0,
    facingDir: V3.mk(),
    // TODO(@darzu): HACK. hyperspace game specific
    lookingForShip: true,
    // TODO(@darzu): HACK. LD51 game specific
    holdingBall: 0,
    // disabled noodle limbs
    // leftFootWorldPos: [0, 0, 0] as V3,
    // rightFootWorldPos: [0, 0, 0] as V3,
  };
});

// Resource pointing at the local player
export const LocalPlayerEntityDef = EM.defineResource(
  "localPlayerEnt",
  (playerId?: number) => ({
    playerId: playerId || 0,
  })
);

export const PlayerHsPropsDef = defineSerializableComponent(
  "hsPlayerProps",
  () => ({ location: V3.mk() }),
  (p, loc?: V3) => {
    if (loc) V3.copy(p.location, loc);
    return p;
  },
  (c, writer) => {
    writer.writeVec3(c.location);
  },
  (c, reader) => {
    reader.readVec3(c.location);
  }
);

EM.addEagerInit([PlayerHsPropsDef], [], [], () => {
  EM.addSystem(
    "buildHsPlayers",
    Phase.PRE_GAME_WORLD,
    [PlayerHsPropsDef],
    [MeDef, AllMeshesDef],
    (players, res) => {
      for (let e of players) {
        if (FinishedDef.isOn(e)) continue;
        const props = e.hsPlayerProps;
        EM.set(e, PositionDef, props.location);
        EM.set(
          e,
          RotationDef,
          // TODO(@darzu): Z_UP rotateY
          quat.rotY(quat.IDENTITY, Math.PI, quat.mk())
        );
        EM.set(e, LinearVelocityDef);
        // console.log("making player!");
        EM.set(e, ColorDef, V(0, 0.2, 0));
        EM.set(e, MotionSmoothingDef);
        // console.log("creating rend");
        const m = cloneMesh(res.allMeshes.cube.mesh);
        scaleMesh3(m, V(0.75, 0.75, 0.4));
        EM.set(e, RenderableConstructDef, m);
        EM.set(e, AuthorityDef, res.me.pid);
        EM.set(e, HsPlayerDef);

        // create legs
        function makeLeg(x: number): Entity {
          const l = EM.new();
          EM.set(l, PositionDef, V(x, -1.5, 0));
          EM.set(l, RenderableConstructDef, res.allMeshes.cube.proto);
          EM.set(l, ScaleDef, V(0.15, 0.75, 0.15));
          EM.set(l, ColorDef, V(0.05, 0.05, 0.05));
          EM.set(l, PhysicsParentDef, e.id);
          return l;
        }
        e.hsPlayer.leftLegId = makeLeg(-0.5).id;
        e.hsPlayer.rightLegId = makeLeg(0.5).id;
        const aabb = copyAABB(createAABB(), res.allMeshes.cube.aabb);
        V3.add(aabb.min, [0, -1, 0], aabb.min);
        EM.set(e, ColliderDef, {
          shape: "AABB",
          solid: true,
          aabb,
        });
        EM.set(e, SyncDef, [
          PositionDef.id,
          RotationDef.id,
          // TODO(@darzu): maybe sync this via events instead
          PhysicsParentDef.id,
        ]);
        e.sync.fullComponents = [PlayerHsPropsDef.id];
        EM.set(e, PhysicsParentDef);

        EM.set(e, ControllableDef);
        EM.set(e, CameraFollowDef, 1);
        setCameraFollowPosition(e, "thirdPersonOverShoulder");

        EM.set(e, FinishedDef);
      }
    }
  );

  EM.addSystem(
    "hsPlayerFacingDir",
    Phase.GAME_PLAYERS,
    [HsPlayerDef, WorldFrameDef],
    [GlobalCursor3dDef],
    (players, res) => {
      for (let p of players) {
        const facingDir = p.hsPlayer.facingDir;
        V3.copy(facingDir, [0, 0, -1]);
        V3.tQuat(facingDir, p.world.rotation, facingDir);

        // use cursor for facingDir if possible
        const cursor = res.globalCursor3d.cursor();
        if (cursor) {
          V3.sub(cursor.world.position, p.world.position, facingDir);
          V3.norm(facingDir, facingDir);
        }
      }
    }
  );

  EM.addSystem(
    "stepHsPlayers",
    Phase.GAME_PLAYERS,
    [
      HsPlayerDef,
      PositionDef,
      RotationDef,
      LinearVelocityDef,
      AuthorityDef,
      PhysicsParentDef,
      WorldFrameDef,
      ControllableDef,
      CanManDef,
    ],
    [TimeDef, CameraDef, InputsDef, MeDef, PhysicsResultsDef],
    (players, res) => {
      const cheat = !!EM.getResource(DevConsoleDef)?.showConsole;
      const {
        time: { dt },
        inputs,
        camera,
        physicsResults: { checkRay },
      } = res;
      // console.log("stepHsPlayers");
      //console.log(`${players.length} players, ${hats.length} hats`);

      for (let p of players) {
        if (p.authority.pid !== res.me.pid) continue;

        // determine modes
        p.controllable.modes.canSprint = true;

        if (p.canMan.manning) {
          p.controllable.modes.canMove = false;
          p.controllable.modes.canPitch = false;
          p.controllable.modes.canYaw = false;
        } else {
          p.controllable.modes.canMove = true;
          p.controllable.modes.canPitch = true;
          p.controllable.modes.canYaw = true;
        }

        if (!cheat) {
          p.controllable.modes.canFall = true;
          p.controllable.modes.canFly = false;
          p.controllable.modes.canJump = false;
        }

        if (cheat && inputs.keyClicks["f"]) {
          p.controllable.modes.canFly = !p.controllable.modes.canFly;
        }

        // if (res.hsGameState.state === GameState.GAMEOVER) {
        //   p.controllable.modes.canFly = true;
        // }
        if (p.controllable.modes.canFly) {
          p.controllable.modes.canFall = false;
          p.controllable.modes.canJump = false;
        } else if (cheat) {
          p.controllable.modes.canFall = true;
          p.controllable.modes.canJump = true;
        }

        // TODO(@darzu): dbg cursor?
        // const cursor = res.globalCursor3d.cursor();
        // if (cursor) {
        //   if (RenderableDef.isOn(cursor)) cursor.renderable.enabled = cheat;
        // }

        // TODO(@darzu): rework to use phsyiscs colliders
        if (inputs.keyClicks["e"]) {
          p.hsPlayer.interacting = true;
        } else {
          p.hsPlayer.interacting = false;
        }
        if (inputs.lclick) {
          p.hsPlayer.clicking = true;
        } else {
          p.hsPlayer.clicking = false;
        }

        p.hsPlayer.dropping = (inputs.keyClicks["q"] || 0) > 0;

        let facingDir = p.hsPlayer.facingDir;

        // add bullet on lclick
        if (cheat && inputs.lclick) {
          const linearVelocity = V3.scale(facingDir, 0.02, V3.mk());
          // TODO(@darzu): adds player motion
          // bulletMotion.linearVelocity = vec3.add(
          //   bulletMotion.linearVelocity,
          //   bulletMotion.linearVelocity,
          //   player.linearVelocity
          // );
          const angularVelocity = V3.scale(facingDir, 0.01, V3.mk());
          // spawnBullet(
          //   EM,
          //   vec3.clone(p.world.position),
          //   linearVelocity,
          //   angularVelocity
          // );
          // TODO: figure out a better way to do this
          inputs.lclick = false;
        }
        if (cheat && inputs.rclick) {
          const SPREAD = 5;
          const GAP = 1.0;
          for (let xi = 0; xi <= SPREAD; xi++) {
            for (let yi = 0; yi <= SPREAD; yi++) {
              const x = (xi - SPREAD / 2) * GAP;
              const y = (yi - SPREAD / 2) * GAP;
              let bullet_axis = V(0, 0, -1);
              bullet_axis = V3.tQuat(bullet_axis, p.rotation, bullet_axis);
              const position = V3.add(p.world.position, V(x, y, 0), V3.mk());
              const linearVelocity = V3.scale(bullet_axis, 0.005, V3.mk());
              V3.add(linearVelocity, p.linearVelocity, linearVelocity);
              const angularVelocity = V3.scale(bullet_axis, 0.01, V3.mk());
              // spawnBullet( position, linearVelocity, angularVelocity);
            }
          }
        }

        // shoot a ray
        if (cheat && inputs.keyClicks["r"]) {
          // create our ray
          const r: Ray = {
            org: V3.add(
              p.world.position,
              V3.scale(V3.mul(facingDir, p.world.scale), 3.0),
              V3.mk()
            ),
            dir: facingDir,
          };
          playerShootRay(r);
        }

        // change physics parent
        if (cheat && inputs.keyClicks["t"]) {
          const targetId =
            EM.getResource(GlobalCursor3dDef)?.cursor()?.cursor3d.hitId;
          if (targetId) {
            p.physicsParent.id = targetId;
            const targetEnt = EM.findEntity(targetId, [ColliderDef]);
            if (targetEnt) {
              V3.copy(p.position, [0, 0, 0]);
              if (targetEnt.collider.shape === "AABB") {
                // move above the obj
                p.position[2] = targetEnt.collider.aabb.max[2] + 3;
              }
            }
            V3.copy(p.linearVelocity, V3.ZEROS);
          } else {
            // unparent
            p.physicsParent.id = 0;
          }
        }

        // delete object
        if (cheat && res.inputs.keyClicks["backspace"]) {
          const targetId =
            EM.getResource(GlobalCursor3dDef)?.cursor()?.cursor3d.hitId;
          if (targetId) EM.ensureComponent(targetId, DeletedDef);
        }

        function playerShootRay(r: Ray) {
          // check for hits
          const hits = checkRay(r);
          const firstHit = hits.reduce((p, n) => (n.dist < p.dist ? n : p), {
            dist: Infinity,
            id: -1,
          });
          const doesHit = firstHit.id !== -1;

          if (doesHit) {
            // increase green
            const e = EM.findEntity(firstHit.id, [ColorDef]);
            if (e) {
              e.color[1] += 0.1;
            }
          }

          // draw our ray
          const rayDist = doesHit ? firstHit.dist : 1000;
          const color: V3 = doesHit ? V(0, 1, 0) : V(1, 0, 0);
          const endPoint = V3.add(r.org, V3.scale(r.dir, rayDist), V3.mk());
          drawLine(r.org, endPoint, color);
        }
      }
    }
  );

  EM.addSystem(
    "hsPlayerLookingForShip",
    Phase.GAME_WORLD,
    [
      HsPlayerDef,
      AuthorityDef,
      PositionDef,
      LinearVelocityDef,
      PhysicsParentDef,
      ColliderDef,
      CameraFollowDef,
      RotationDef,
    ],
    [PhysicsResultsDef, MeDef],
    (players, res) => {
      for (let p of players) {
        if (p.authority.pid !== res.me.pid) continue;
        if (!p.hsPlayer.lookingForShip) continue;

        const parent = EM.findEntity(p.physicsParent.id, [ColliderDef]);
        if (!parent) {
          const ship = EM.filterEntities_uncached([
            ColliderDef,
            HsShipLocalDef,
            PositionDef,
          ])[0];
          if (ship) {
            p.physicsParent.id = ship.id;
            // vec3.copy(p.position, [0, 10, res.me.pid * 4 - 16]);
            // console.log("found ship!");
            p.hsPlayer.lookingForShip = false;
            const maxYFn: (c: Collider) => number = (c) =>
              c.shape === "Multi"
                ? Math.max(...c.children.map((c2) => maxYFn(c2)))
                : c.shape === "AABB"
                ? c.aabb.max[1]
                : -Infinity;
            const shipY = maxYFn(ship.collider);
            const pFeetToMid = -(p.collider as AABBCollider).aabb.min[1];

            const evenPlayer = res.me.pid % 2 === 0;

            const endPos: V3 = V3.clone([
              3.5 * (evenPlayer ? 1 : -1),
              shipY + pFeetToMid + 1,
              Math.floor((res.me.pid - 1) / 2) * 4 - 10,
            ]);
            const startPos = V3.add(
              endPos,
              [0, 200, 0],
              // V3.tmp(),
              V3.mk()
            );
            // console.log("player animateTo:");
            // console.log(vec3Dbg(startPos));
            // console.log(vec3Dbg(endPos));
            // console.dir(startPos);
            // console.dir(endPos);
            p.cameraFollow.yawOffset = 0.0;
            p.cameraFollow.pitchOffset = -0.75;
            quat.copy(p.rotation, [0.0, 1.0, 0.0, 0.0]);
            V3.zero(p.linearVelocity);

            // TODO(@darzu): uncomment to animate player entry
            // EM.set(p, AnimateToDef, {
            //   startPos,
            //   endPos,
            //   durationMs: 2000,
            //   easeFn: EASE_OUTQUAD,
            // });
            V3.copy(p.position, endPos);
          }
        }
      }
    }
  );
});
