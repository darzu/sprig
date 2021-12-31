// player controller component and system

import { quat, vec2, vec3 } from "../gl-matrix.js";
import { Inputs, InputsDef } from "../inputs.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { ColorDef } from "./game.js";
import { spawnBullet } from "./bullet.js";
import { FinishedDef } from "../build.js";
import { CameraView, CameraViewDef, RenderableDef } from "../renderer.js";
import {
  Frame,
  PhysicsParent,
  PhysicsParentDef,
  Position,
  PositionDef,
  Rotation,
  RotationDef,
} from "../physics/transform.js";
import {
  PhysicsResults,
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
} from "../net/components.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import { Ray, RayHit } from "../physics/broadphase.js";
import { tempQuat, tempVec } from "../temp-pool.js";
import { Mesh } from "../mesh-pool.js";
import { Assets, AssetsDef } from "./assets.js";
import { LinearVelocity, LinearVelocityDef } from "../physics/motion.js";
import { MotionSmoothingDef } from "../smoothing.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { ModelerDef, screenPosToRay } from "./modeler.js";
import { PhysicsDbgDef } from "../physics/phys-debug.js";

export const PlayerEntDef = EM.defineComponent("player", (gravity?: number) => {
  return {
    mode: "jumping" as "jumping" | "flying",
    jumpSpeed: 0.003,
    gravity: gravity ?? 0.1,
    // hat stuff
    // TODO(@darzu): better abstraction
    hat: 0,
    tool: 0,
    interacting: false,
    dropping: false,
    targetCursor: -1,
    targetEnt: -1,
  };
});
export type PlayerEnt = Component<typeof PlayerEntDef>;

export const PlayerConstructDef = EM.defineComponent(
  "playerConstruct",
  (loc?: vec3) => {
    return {
      location: loc ?? vec3.create(),
    };
  }
);
export type PlayerConstruct = Component<typeof PlayerConstructDef>;

EM.registerSerializerPair(
  PlayerConstructDef,
  (c, writer) => {
    writer.writeVec3(c.location);
  },
  (c, reader) => {
    reader.readVec3(c.location);
  }
);

interface PlayerObj {
  id: number;
  player: PlayerEnt;
  position: Position;
  rotation: Rotation;
  linearVelocity: LinearVelocity;
  authority: Authority;
  physicsParent: PhysicsParent;
  world: Frame;
}

export type PerspectiveMode = "perspective" | "ortho";
export type CameraMode = "thirdPerson" | "thirdPersonOverShoulder";

export const CameraDef = EM.defineComponent("camera", () => {
  return {
    rotation: quat.rotateX(
      quat.create(),
      quat.identity(tempQuat()),
      -Math.PI / 8
    ),
    offset: vec3.create(),
    cameraMode: "thirdPersonOverShoulder" as CameraMode,
    perspectiveMode: "perspective" as PerspectiveMode,
  };
});
export type CameraProps = Component<typeof CameraDef>;

export function registerStepPlayers(em: EntityManager) {
  em.registerSystem(
    [
      PlayerEntDef,
      PositionDef,
      RotationDef,
      LinearVelocityDef,
      AuthorityDef,
      PhysicsParentDef,
      WorldFrameDef,
    ],
    [
      PhysicsTimerDef,
      CameraDef,
      InputsDef,
      MeDef,
      PhysicsResultsDef,
      CameraViewDef,
      ModelerDef,
    ],
    (players, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++) {
        const {
          physicsTimer: { period: dt },
          inputs,
          camera,
          physicsResults: { checkRay },
          cameraView,
        } = res;
        //console.log(`${players.length} players, ${hats.length} hats`);

        for (let p of players) {
          if (p.authority.pid !== res.me.pid) continue;

          if (inputs.keyClicks["f"])
            p.player.mode = p.player.mode === "jumping" ? "flying" : "jumping";

          // fall with gravity
          if (p.player.mode === "jumping") {
            // TODO(@darzu): what r the units of gravity here?
            p.linearVelocity[1] -= (p.player.gravity / 1000) * dt;
          } else {
            p.linearVelocity[1] = 0;
          }

          // move player
          let vel = vec3.fromValues(0, 0, 0);
          let playerSpeed = 0.001;
          if (inputs.keyDowns["shift"]) playerSpeed *= 3;
          let trans = playerSpeed * dt;
          if (inputs.keyDowns["a"]) {
            vec3.add(vel, vel, vec3.fromValues(-trans, 0, 0));
          }
          if (inputs.keyDowns["d"]) {
            vec3.add(vel, vel, vec3.fromValues(trans, 0, 0));
          }
          if (inputs.keyDowns["w"]) {
            vec3.add(vel, vel, vec3.fromValues(0, 0, -trans));
          }
          if (inputs.keyDowns["s"]) {
            vec3.add(vel, vel, vec3.fromValues(0, 0, trans));
          }

          if (p.player.mode === "jumping") {
            if (inputs.keyClicks[" "]) {
              p.linearVelocity[1] = p.player.jumpSpeed * dt;
            }
          } else {
            if (inputs.keyDowns[" "]) {
              vec3.add(vel, vel, vec3.fromValues(0, trans, 0));
            } else if (inputs.keyDowns["c"]) {
              vec3.add(vel, vel, vec3.fromValues(0, -trans, 0));
            }
          }

          vec3.transformQuat(vel, vel, p.rotation);

          // vec3.add(player.linearVelocity, player.linearVelocity, vel);

          // x and z from local movement
          p.linearVelocity[0] = vel[0];
          p.linearVelocity[2] = vel[2];
          if (p.player.mode === "flying") p.linearVelocity[1] = vel[1];

          // TODO(@darzu): rework to use phsyiscs colliders
          if (inputs.keyClicks["e"]) {
            p.player.interacting = true;
          } else {
            p.player.interacting = false;
          }
          p.player.dropping = (inputs.keyClicks["q"] || 0) > 0;

          // TODO(@darzu): we need a better way, maybe some sort of stack,
          //    to hand off mouse etc between systems
          if (res.modeler.mode === "") {
            quat.rotateY(p.rotation, p.rotation, -inputs.mouseMovX * 0.001);
            quat.rotateX(
              camera.rotation,
              camera.rotation,
              -inputs.mouseMovY * 0.001
            );
          }

          let facingDir = vec3.fromValues(0, 0, -1);
          vec3.transformQuat(facingDir, facingDir, p.world.rotation);

          const targetCursor = EM.findEntity(p.player.targetCursor, [
            WorldFrameDef,
          ]);
          if (targetCursor) {
            vec3.sub(facingDir, targetCursor.world.position, p.world.position);
            vec3.normalize(facingDir, facingDir);
          }

          // add bullet on lclick
          if (inputs.lclick) {
            const linearVelocity = vec3.scale(vec3.create(), facingDir, 0.02);
            // TODO(@darzu): adds player motion
            // bulletMotion.linearVelocity = vec3.add(
            //   bulletMotion.linearVelocity,
            //   bulletMotion.linearVelocity,
            //   player.linearVelocity
            // );
            const angularVelocity = vec3.scale(vec3.create(), facingDir, 0.01);
            spawnBullet(
              EM,
              vec3.clone(p.world.position),
              linearVelocity,
              angularVelocity
            );
            // TODO: figure out a better way to do this
            inputs.lclick = false;
          }
          if (inputs.rclick) {
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
                spawnBullet(EM, position, linearVelocity, angularVelocity);
              }
            }
          }

          // shoot a ray
          if (inputs.keyClicks["r"]) {
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
          if (inputs.keyClicks["t"]) {
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
            drawLine(EM, r.org, endPoint, color);
          }
        }
      }
    },
    "stepPlayers"
  );

  em.registerSystem(
    [PlayerEntDef, PositionDef, RotationDef, AuthorityDef],
    [
      CameraViewDef,
      CameraDef,
      GlobalCursor3dDef,
      MeDef,
      PhysicsResultsDef,
      InputsDef,
    ],
    (players, res) => {
      const p = players.filter((p) => p.authority.pid === res.me.pid)[0];
      const c = em.findEntity(res.globalCursor3d.entityId, [
        PositionDef,
        RenderableDef,
        ColorDef,
      ]);
      if (p && c) {
        if (res.camera.cameraMode !== "thirdPersonOverShoulder") {
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
}

// TODO(@darzu): move this helper elsewhere?
export function drawLine(
  em: EntityManager,
  start: vec3,
  end: vec3,
  color: vec3
) {
  const { id } = em.newEntity();
  em.addComponent(id, ColorDef, color);
  const m: Mesh = {
    pos: [start, end],
    tri: [],
    colors: [],
    lines: [[0, 1]],
    usesProvoking: true,
  };
  em.addComponent(id, RenderableDef, m);
  em.addComponent(id, WorldFrameDef);
}

export let __lastPlayerId = 0;

export function registerBuildPlayersSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerConstructDef],
    [MeDef, AssetsDef],
    (players, res) => {
      for (let e of players) {
        if (FinishedDef.isOn(e)) continue;
        __lastPlayerId = e.id; // TODO(@darzu): debugging
        const props = e.playerConstruct;
        if (!PositionDef.isOn(e))
          em.addComponent(e.id, PositionDef, props.location);
        if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef);
        if (!LinearVelocityDef.isOn(e))
          em.addComponent(e.id, LinearVelocityDef);
        if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0, 0.2, 0]);
        if (!MotionSmoothingDef.isOn(e))
          em.addComponent(e.id, MotionSmoothingDef);
        if (!RenderableDef.isOn(e))
          em.addComponent(e.id, RenderableDef, res.assets.cube.mesh);
        if (!AuthorityDef.isOn(e))
          em.addComponent(e.id, AuthorityDef, res.me.pid);
        if (!PlayerEntDef.isOn(e)) em.addComponent(e.id, PlayerEntDef);
        if (!ColliderDef.isOn(e)) {
          const collider = em.addComponent(e.id, ColliderDef);
          collider.shape = "AABB";
          collider.solid = true;
          (collider as AABBCollider).aabb = res.assets.cube.aabb;
        }
        if (!SyncDef.isOn(e)) {
          em.addComponent(
            e.id,
            SyncDef,
            [PlayerConstructDef.id],
            [
              PositionDef.id,
              RotationDef.id,
              LinearVelocityDef.id,
              // TODO(@darzu): maybe sync this via events instead
              PhysicsParentDef.id,
            ]
          );
        }
        em.ensureComponent(e.id, PhysicsParentDef);
        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildPlayers"
  );
}
