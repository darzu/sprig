// player controller component and system

import { quat, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { EM, Entity, EntityManager, EntityW } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { ColorDef } from "../color.js";
import { FinishedDef } from "../build.js";
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
import { copyAABB, createAABB, Ray } from "../physics/broadphase.js";
import { tempVec3 } from "../temp-pool.js";
import { cloneMesh, scaleMesh3 } from "../render/mesh.js";
import { AssetsDef } from "./assets.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { ModelerDef } from "./modeler.js";
import { DeletedDef } from "../delete.js";
import { PlayerShipLocalDef } from "./player-ship.js";
import {
  CameraDef,
  CameraFollowDef,
  setCameraFollowPosition,
} from "../camera.js";
import { defineSerializableComponent } from "../em_helpers.js";
import { ControllableDef } from "./controllable.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { drawLine } from "../utils-game.js";
import { GameState, GameStateDef } from "./gamestate.js";
import { DevConsoleDef } from "../console.js";
import { max } from "../math.js";
import { AnimateToDef, EASE_OUTQUAD } from "../animate-to.js";
import { vec3Dbg } from "../utils-3d.js";

// TODO(@darzu): it'd be great if these could hook into some sort of
//    dev mode you could toggle at runtime.

export function createPlayer(em: EntityManager) {
  // console.log("create player!");
  const e = em.newEntity();
  em.addComponent(e.id, PlayerPropsDef, vec3.fromValues(0, 100, 0));
  em.addSingletonComponent(LocalPlayerDef, e.id);
}

export const PlayerDef = EM.defineComponent("player", () => {
  return {
    // hat stuff
    // TODO(@darzu): better abstraction
    hat: 0,
    tool: 0,
    interacting: false,
    clicking: false,
    manning: false,
    dropping: false,
    leftLegId: 0,
    rightLegId: 0,
    facingDir: vec3.create(),
    lookingForShip: true,
    // disabled noodle limbs
    // leftFootWorldPos: [0, 0, 0] as vec3,
    // rightFootWorldPos: [0, 0, 0] as vec3,
  };
});

// Resource pointing at the local player
export const LocalPlayerDef = EM.defineComponent(
  "localPlayer",
  (playerId?: number) => ({
    playerId: playerId || 0,
  })
);

export const PlayerPropsDef = defineSerializableComponent(
  EM,
  "playerProps",
  (loc?: vec3) => {
    return {
      location: loc ?? vec3.create(),
    };
  },
  (c, writer) => {
    writer.writeVec3(c.location);
  },
  (c, reader) => {
    reader.readVec3(c.location);
  }
);

export function registerPlayerSystems(em: EntityManager) {
  em.registerSystem(
    [PlayerPropsDef],
    [MeDef, AssetsDef],
    (players, res) => {
      for (let e of players) {
        if (FinishedDef.isOn(e)) continue;
        const props = e.playerProps;
        if (!PositionDef.isOn(e))
          em.addComponent(e.id, PositionDef, props.location);
        if (!RotationDef.isOn(e))
          em.addComponent(
            e.id,
            RotationDef,
            quat.rotateY(quat.create(), quat.IDENTITY, Math.PI)
          );
        if (!LinearVelocityDef.isOn(e))
          em.addComponent(e.id, LinearVelocityDef);
        if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0, 0.2, 0]);
        if (!MotionSmoothingDef.isOn(e))
          em.addComponent(e.id, MotionSmoothingDef);
        if (!RenderableConstructDef.isOn(e)) {
          const m = cloneMesh(res.assets.cube.mesh);
          scaleMesh3(m, [0.75, 0.75, 0.4]);
          em.addComponent(e.id, RenderableConstructDef, m);
        }
        em.ensureComponentOn(e, AuthorityDef, res.me.pid);
        if (!PlayerDef.isOn(e)) {
          em.ensureComponentOn(e, PlayerDef);

          // create legs
          function makeLeg(x: number): Entity {
            const l = em.newEntity();
            em.ensureComponentOn(l, PositionDef, [x, -1.5, 0]);
            em.ensureComponentOn(
              l,
              RenderableConstructDef,
              res.assets.cube.proto
            );
            em.ensureComponentOn(l, ScaleDef, [0.15, 0.75, 0.15]);
            em.ensureComponentOn(l, ColorDef, [0.05, 0.05, 0.05]);
            em.ensureComponentOn(l, PhysicsParentDef, e.id);
            return l;
          }
          e.player.leftLegId = makeLeg(-0.5).id;
          e.player.rightLegId = makeLeg(0.5).id;
        }
        if (!ColliderDef.isOn(e)) {
          const collider = em.addComponent(e.id, ColliderDef);
          collider.shape = "AABB";
          collider.solid = true;
          const playerAABB = copyAABB(createAABB(), res.assets.cube.aabb);
          vec3.add(playerAABB.min, playerAABB.min, [0, -1, 0]);
          (collider as AABBCollider).aabb = playerAABB;
        }
        if (!SyncDef.isOn(e)) {
          em.ensureComponentOn(e, SyncDef, [
            PositionDef.id,
            RotationDef.id,
            // TODO(@darzu): maybe sync this via events instead
            PhysicsParentDef.id,
          ]);
          e.sync.fullComponents = [PlayerPropsDef.id];
        }
        em.ensureComponent(e.id, PhysicsParentDef);

        em.ensureComponentOn(e, ControllableDef);
        em.ensureComponentOn(e, CameraFollowDef, 1);
        setCameraFollowPosition(e, "thirdPersonOverShoulder");

        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildPlayers"
  );

  em.registerSystem(
    [PlayerDef, WorldFrameDef],
    [GlobalCursor3dDef],
    (players, res) => {
      for (let p of players) {
        const facingDir = p.player.facingDir;
        vec3.copy(facingDir, [0, 0, -1]);
        vec3.transformQuat(facingDir, facingDir, p.world.rotation);

        // use cursor for facingDir if possible
        const cursor = res.globalCursor3d.cursor();
        if (cursor) {
          vec3.sub(facingDir, cursor.world.position, p.world.position);
          vec3.normalize(facingDir, facingDir);
        }
      }
    },
    "playerFacingDir"
  );

  em.registerSystem(
    [
      PlayerDef,
      PositionDef,
      RotationDef,
      LinearVelocityDef,
      AuthorityDef,
      PhysicsParentDef,
      WorldFrameDef,
      ControllableDef,
    ],
    [
      TimeDef,
      CameraDef,
      InputsDef,
      MeDef,
      PhysicsResultsDef,
      ModelerDef,
      GlobalCursor3dDef,
      GameStateDef,
    ],
    (players, res) => {
      const cheat = !!em.getResource(DevConsoleDef)?.showConsole;
      const {
        time: { dt },
        inputs,
        camera,
        physicsResults: { checkRay },
      } = res;
      // console.log("stepPlayers");
      //console.log(`${players.length} players, ${hats.length} hats`);

      for (let p of players) {
        if (p.authority.pid !== res.me.pid) continue;

        // determine modes
        p.controllable.modes.canSprint = true;

        if (p.player.manning) {
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

        if (res.gameState.state === GameState.GAMEOVER) {
          p.controllable.modes.canFly = true;
        }
        if (p.controllable.modes.canFly) {
          p.controllable.modes.canFall = false;
          p.controllable.modes.canJump = false;
        } else if (cheat) {
          p.controllable.modes.canFall = true;
          p.controllable.modes.canJump = true;
        }

        const cursor = res.globalCursor3d.cursor();
        if (cursor) {
          if (RenderableDef.isOn(cursor)) cursor.renderable.enabled = cheat;
        }

        // TODO(@darzu): rework to use phsyiscs colliders
        if (inputs.keyClicks["e"]) {
          p.player.interacting = true;
        } else {
          p.player.interacting = false;
        }
        if (inputs.lclick) {
          p.player.clicking = true;
        } else {
          p.player.clicking = false;
        }

        p.player.dropping = (inputs.keyClicks["q"] || 0) > 0;

        let facingDir = p.player.facingDir;

        // add bullet on lclick
        if (cheat && inputs.lclick) {
          const linearVelocity = vec3.scale(vec3.create(), facingDir, 0.02);
          // TODO(@darzu): adds player motion
          // bulletMotion.linearVelocity = vec3.add(
          //   bulletMotion.linearVelocity,
          //   bulletMotion.linearVelocity,
          //   player.linearVelocity
          // );
          const angularVelocity = vec3.scale(vec3.create(), facingDir, 0.01);
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
              let bullet_axis = vec3.fromValues(0, 0, -1);
              bullet_axis = vec3.transformQuat(
                bullet_axis,
                bullet_axis,
                p.rotation
              );
              const position = vec3.add(
                vec3.create(),
                p.world.position,
                vec3.fromValues(x, y, 0)
              );
              const linearVelocity = vec3.scale(
                vec3.create(),
                bullet_axis,
                0.005
              );
              vec3.add(linearVelocity, linearVelocity, p.linearVelocity);
              const angularVelocity = vec3.scale(
                vec3.create(),
                bullet_axis,
                0.01
              );
              // spawnBullet(EM, position, linearVelocity, angularVelocity);
            }
          }
        }

        // shoot a ray
        if (cheat && inputs.keyClicks["r"]) {
          // create our ray
          const r: Ray = {
            org: vec3.add(
              vec3.create(),
              p.world.position,
              vec3.scale(
                tempVec3(),
                vec3.multiply(tempVec3(), facingDir, p.world.scale),
                3.0
              )
            ),
            dir: facingDir,
          };
          playerShootRay(r);
        }

        // change physics parent
        if (cheat && inputs.keyClicks["t"]) {
          const targetId = em.getResource(GlobalCursor3dDef)?.cursor()
            ?.cursor3d.hitId;
          if (targetId) {
            p.physicsParent.id = targetId;
            const targetEnt = em.findEntity(targetId, [ColliderDef]);
            if (targetEnt) {
              vec3.copy(p.position, [0, 0, 0]);
              if (targetEnt.collider.shape === "AABB") {
                // move above the obj
                p.position[1] = targetEnt.collider.aabb.max[1] + 3;
              }
            }
            vec3.copy(p.linearVelocity, vec3.ZEROS);
          } else {
            // unparent
            p.physicsParent.id = 0;
          }
        }

        // delete object
        if (cheat && res.inputs.keyClicks["backspace"]) {
          const targetId = em.getResource(GlobalCursor3dDef)?.cursor()
            ?.cursor3d.hitId;
          if (targetId) em.ensureComponent(targetId, DeletedDef);
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
          const color: vec3 = doesHit ? [0, 1, 0] : [1, 0, 0];
          const endPoint = vec3.add(
            vec3.create(),
            r.org,
            vec3.scale(tempVec3(), r.dir, rayDist)
          );
          drawLine(r.org, endPoint, color);
        }
      }
    },
    "stepPlayers"
  );

  em.registerSystem(
    [
      PlayerDef,
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
        if (!p.player.lookingForShip) continue;

        const parent = em.findEntity(p.physicsParent.id, [ColliderDef]);
        if (!parent) {
          const ship = em.filterEntities([
            ColliderDef,
            PlayerShipLocalDef,
            PositionDef,
          ])[0];
          if (ship) {
            p.physicsParent.id = ship.id;
            // vec3.copy(p.position, [0, 10, res.me.pid * 4 - 16]);
            // console.log("found ship!");
            p.player.lookingForShip = false;
            const maxYFn: (c: Collider) => number = (c) =>
              c.shape === "Multi"
                ? Math.max(...c.children.map((c2) => maxYFn(c2)))
                : c.shape === "AABB"
                ? c.aabb.max[1]
                : -Infinity;
            const shipY = maxYFn(ship.collider);
            const pFeetToMid = -(p.collider as AABBCollider).aabb.min[1];

            const evenPlayer = res.me.pid % 2 === 0;

            const endPos: vec3 = [
              3.5 * (evenPlayer ? 1 : -1),
              shipY + pFeetToMid + 1,
              Math.floor((res.me.pid - 1) / 2) * 4 - 10,
            ];
            const startPos = vec3.add(
              // tempVec3(),
              vec3.create(),
              endPos,
              [0, 200, 0]
            );
            // console.log("player animateTo:");
            // console.log(vec3Dbg(startPos));
            // console.log(vec3Dbg(endPos));
            // console.dir(startPos);
            // console.dir(endPos);
            p.cameraFollow.yawOffset = 0.0;
            p.cameraFollow.pitchOffset = -0.75;
            quat.copy(p.rotation, [0.0, 1.0, 0.0, 0.0]);
            vec3.zero(p.linearVelocity);

            // TODO(@darzu): uncomment to animate player entry
            // em.ensureComponentOn(p, AnimateToDef, {
            //   startPos,
            //   endPos,
            //   durationMs: 2000,
            //   easeFn: EASE_OUTQUAD,
            // });
            vec3.copy(p.position, endPos);
          }
        }
      }
    },
    "playerLookingForShip"
  );
}
