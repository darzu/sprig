// player controller component and system

import { quat, vec2, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import {
  Component,
  EM,
  Entity,
  EntityManager,
  EntityW,
} from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";
import { ColorDef } from "../color.js";
import { FinishedDef } from "../build.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
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
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { copyAABB, createAABB, Ray, RayHit } from "../physics/broadphase.js";
import { tempVec } from "../temp-pool.js";
import { Mesh, scaleMesh3 } from "../render/mesh-pool.js";
import { AssetsDef } from "./assets.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { getCursor, GlobalCursor3dDef } from "./cursor.js";
import { ModelerDef, screenPosToRay } from "./modeler.js";
import { DeletedDef } from "../delete.js";
import { ShipLocalDef } from "./ship.js";
import {
  CameraDef,
  CameraFollowDef,
  CameraViewDef,
  setCameraFollowPosition,
} from "../camera.js";
import { defineSerializableComponent } from "../em_helpers.js";

// TODO(@darzu): it'd be great if these could hook into some sort of
//    dev mode you could toggle at runtime.
export const CHEAT = false;

export function createPlayer(em: EntityManager) {
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
    targetCursor: -1,
    targetEnt: -1,
    leftLegId: 0,
    rightLegId: 0,
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

/*
names:
playable

controllable:
  WASD / left stick -> xz movement
  Space / A -> jump
  Space / A -> fly up
  c / B -> fly down
  Shift / left stick press -> speed up

  camera: behind, over-shoulder, first person, rts
  cursor (when over-shoulder)

  e / X -> interact
  click / trigger -> shoot

  debug:
  r -> ray
  t -> re-parent
  backspace -> delete obj
*/

export const ControllableDef = EM.defineComponent("controllable", () => {
  return {
    speed: 0.0005,
    sprintMul: 3,
    gravity: 0.1,
    jumpSpeed: 0.003,
    turnSpeed: 0.001,
    cursorId: 0,
    worldFacingDir: vec3.create(),
    modes: {
      canFall: true,
      canFly: true,
      canSprint: true,
      canJump: true,
      canTurn: true,
      canMove: true,
    },
  };
});

export function registerControllableSystems(em: EntityManager) {
  const steerVel = vec3.create();

  em.registerSystem(
    [ControllableDef, LinearVelocityDef, RotationDef, WorldFrameDef],
    [InputsDef, PhysicsTimerDef],
    (controllables, res) => {
      const dt = res.physicsTimer.period * res.physicsTimer.steps;

      for (let c of controllables) {
        vec3.zero(steerVel);
        const modes = c.controllable.modes;

        let speed = c.controllable.speed * dt;

        if (modes.canSprint)
          if (res.inputs.keyDowns["shift"]) speed *= c.controllable.sprintMul;

        if (modes.canMove) {
          if (res.inputs.keyDowns["a"]) steerVel[0] -= speed;
          if (res.inputs.keyDowns["d"]) steerVel[0] += speed;
          if (res.inputs.keyDowns["w"]) steerVel[2] -= speed;
          if (res.inputs.keyDowns["s"]) steerVel[2] += speed;

          if (modes.canFly) {
            if (res.inputs.keyDowns[" "]) steerVel[1] += speed;
            if (res.inputs.keyDowns["c"]) steerVel[1] -= speed;
          }
        }

        if (modes.canFall)
          c.linearVelocity[1] -= (c.controllable.gravity / 1000) * dt;

        if (modes.canJump)
          if (res.inputs.keyClicks[" "])
            c.linearVelocity[1] = c.controllable.jumpSpeed * dt;

        // apply our steering velocity
        vec3.transformQuat(steerVel, steerVel, c.rotation);
        c.linearVelocity[0] = steerVel[0];
        c.linearVelocity[2] = steerVel[2];
        if (modes.canFly) c.linearVelocity[1] = steerVel[1];

        if (modes.canTurn)
          quat.rotateY(
            c.rotation,
            c.rotation,
            -res.inputs.mouseMovX * c.controllable.turnSpeed
          );
      }
    },
    "controllableInput"
  );

  em.registerSystem(
    [ControllableDef, WorldFrameDef],
    [],
    (controllables, res) => {
      for (let c of controllables) {
        let facingDir = c.controllable.worldFacingDir;
        vec3.copy(facingDir, [0, 0, -1]);
        vec3.transformQuat(facingDir, facingDir, c.world.rotation);

        // use cursor for facingDir if possible
        const targetCursor = EM.findEntity(c.controllable.cursorId, [
          WorldFrameDef,
        ]);
        if (targetCursor) {
          vec3.sub(facingDir, targetCursor.world.position, c.world.position);
          vec3.normalize(facingDir, facingDir);
        }

        c.controllable.worldFacingDir;
      }
    },
    "controllableFacingDir"
  );

  em.registerSystem(
    [ControllableDef, CameraFollowDef],
    [InputsDef, PhysicsTimerDef],
    (controllables, res) => {
      for (let c of controllables) {
        if (c.controllable.modes.canTurn)
          quat.rotateX(
            c.cameraFollow.rotationOffset,
            c.cameraFollow.rotationOffset,
            -res.inputs.mouseMovY * c.controllable.turnSpeed
          );
      }
    },
    "controllableCameraFollow"
  );
}

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
          const m = scaleMesh3(res.assets.cube.mesh, [0.75, 0.75, 0.4]);
          em.addComponent(e.id, RenderableConstructDef, m);
        }
        if (!AuthorityDef.isOn(e))
          em.addComponent(e.id, AuthorityDef, res.me.pid);
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
      PhysicsTimerDef,
      CameraDef,
      InputsDef,
      MeDef,
      PhysicsResultsDef,
      ModelerDef,
    ],
    (players, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++) {
        const {
          physicsTimer: { period: dt },
          inputs,
          camera,
          physicsResults: { checkRay },
        } = res;
        //console.log(`${players.length} players, ${hats.length} hats`);

        for (let p of players) {
          if (p.authority.pid !== res.me.pid) continue;

          // determine modes
          p.controllable.modes.canSprint = true;

          if (p.player.manning) {
            p.controllable.modes.canMove = false;
            p.controllable.modes.canTurn = false;
          } else {
            p.controllable.modes.canMove = true;
            p.controllable.modes.canTurn = true;
          }

          if (!CHEAT) {
            p.controllable.modes.canFall = true;
            p.controllable.modes.canFly = false;
            p.controllable.modes.canJump = false;
          }

          if (CHEAT && inputs.keyClicks["f"]) {
            p.controllable.modes.canFly = !p.controllable.modes.canFly;
          }

          if (p.controllable.modes.canFly) {
            p.controllable.modes.canFall = false;
            p.controllable.modes.canJump = false;
          } else if (CHEAT) {
            p.controllable.modes.canFall = true;
            p.controllable.modes.canJump = true;
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

          let facingDir = p.controllable.worldFacingDir;

          // add bullet on lclick
          if (CHEAT && inputs.lclick) {
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
          if (CHEAT && inputs.rclick) {
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
          if (CHEAT && inputs.keyClicks["r"]) {
            // create our ray
            const r: Ray = {
              org: vec3.add(
                vec3.create(),
                p.world.position,
                vec3.scale(
                  tempVec(),
                  vec3.multiply(tempVec(), facingDir, p.world.scale),
                  3.0
                )
              ),
              dir: facingDir,
            };
            playerShootRay(r);
          }

          // change physics parent
          if (CHEAT && inputs.keyClicks["t"]) {
            const targetEnt = EM.findEntity(p.player.targetEnt, [ColliderDef]);
            if (targetEnt) {
              p.physicsParent.id = targetEnt.id;
              vec3.copy(p.position, [0, 0, 0]);
              if (targetEnt.collider.shape === "AABB") {
                // move above the obj
                p.position[1] = targetEnt.collider.aabb.max[1] + 3;
              }
              vec3.copy(p.linearVelocity, vec3.ZEROS);
            } else {
              // unparent
              p.physicsParent.id = 0;
            }
          }

          // delete object
          if (
            CHEAT &&
            res.inputs.keyClicks["backspace"] &&
            p.player.targetEnt > 0
          ) {
            em.ensureComponent(p.player.targetEnt, DeletedDef);
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
              vec3.scale(tempVec(), r.dir, rayDist)
            );
            // drawLine(EM, r.org, endPoint, color);
          }
        }
      }
    },
    "stepPlayers"
  );

  em.registerSystem(
    [PlayerDef, PositionDef, RotationDef, AuthorityDef, CameraFollowDef],
    [CameraViewDef, GlobalCursor3dDef, MeDef, PhysicsResultsDef, InputsDef],
    (players, res) => {
      const p = players.filter((p) => p.authority.pid === res.me.pid)[0];
      const c = getCursor(em, [PositionDef, RenderableDef, ColorDef]);
      if (p && c) {
        const overShoulder = p.cameraFollow.positionOffset[0] !== 0;
        if (!overShoulder) {
          // hide the cursor
          c.renderable.enabled = false;
          // target nothing
          p.player.targetCursor = -1;
          p.player.targetEnt = -1;
        } else {
          // show the cursor
          c.renderable.enabled = true;

          // target the cursor
          p.player.targetCursor = c.id;

          // shoot a ray from screen center to figure out where to put the cursor
          const screenMid: vec2 = [
            res.cameraView.width * 0.5,
            res.cameraView.height * 0.4,
          ];
          const r = screenPosToRay(screenMid, res.cameraView);
          let cursorDistance = 100;

          // if we hit something with that ray, put the cursor there
          const hits = res.physicsResults.checkRay(r);
          let nearestHit: RayHit = { dist: Infinity, id: -1 };
          if (hits.length) {
            nearestHit = hits.reduce(
              (p, n) => (n.dist < p.dist ? n : p),
              nearestHit
            );
            cursorDistance = nearestHit.dist;
            vec3.copy(c.color, [0, 1, 0]);

            // remember what we hit
            p.player.targetEnt = nearestHit.id;
          } else {
            vec3.copy(c.color, [0, 1, 1]);
          }

          // place the cursor
          vec3.add(
            c.position,
            r.org,
            vec3.scale(tempVec(), r.dir, cursorDistance)
          );
        }
      }
    },
    "playerCursorUpdate"
  );

  em.registerSystem(
    [PlayerDef, AuthorityDef, PositionDef, LinearVelocityDef],
    [PhysicsResultsDef, MeDef],
    (players, res) => {
      for (let p of players) {
        if (p.authority.pid !== res.me.pid) continue;

        function changeParent(parent: EntityW<[typeof ColliderDef]>) {
          // already on this ship
          if (PhysicsParentDef.isOn(p))
            if (p.physicsParent.id === parent.id) return;

          console.log(`new parent: ${parent.id}`);

          em.ensureComponentOn(p, PhysicsParentDef);

          p.physicsParent.id = parent.id;
          vec3.copy(p.position, [0, 0, 0]);
          if (parent.collider.shape === "AABB") {
            // move above the obj
            p.position[1] = parent.collider.aabb.max[1] + 3;
          }
          vec3.copy(p.linearVelocity, vec3.ZEROS);
        }

        const shipHits = res.physicsResults.collidesWith
          .get(p.id)
          ?.map((h) => em.findEntity(h, [ShipLocalDef, ColliderDef]));

        if (shipHits && shipHits.length && shipHits[0]) {
          const ship = shipHits[0];
          changeParent(ship);
          continue;
        }

        // TODO(@darzu): trying to reparent to the ground, doesnt work
        // const groundHits = res.physicsResults.collidesWith
        //   .get(p.id)
        //   ?.map((h) => em.findEntity(h, [GroundDef, ColliderDef]));

        // if (groundHits && groundHits.length && groundHits[0]) {
        //   const ground = groundHits[0];
        //   changeParent(ground);
        //   continue;
        // }
      }
    },
    "playerOnShip"
  );
}
