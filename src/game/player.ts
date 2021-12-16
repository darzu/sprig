// player controller component and system

import { quat, vec3 } from "../gl-matrix.js";
import { Inputs, InputsDef } from "../inputs.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { ColorDef } from "./game.js";
import { spawnBullet } from "./bullet.js";
import { FinishedDef } from "../build.js";
import { CameraView, CameraViewDef, RenderableDef } from "../renderer.js";
import {
  Position,
  PositionDef,
  Rotation,
  RotationDef,
  WorldTransformDef,
} from "../transform.js";
import { PhysicsResults, PhysicsResultsDef } from "../phys_esc.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
} from "../net/components.js";
import { AABBCollider, ColliderDef } from "../collider.js";
import { Ray, RayHit } from "../phys_broadphase.js";
import { tempVec } from "../temp-pool.js";
import { Mesh } from "../mesh-pool.js";
import { Assets, AssetsDef } from "./assets.js";
import { LinearVelocity, LinearVelocityDef } from "../motion.js";
import { MotionSmoothingDef } from "../smoothing.js";

export const PlayerEntDef = EM.defineComponent("player", (gravity?: number) => {
  return {
    jumpSpeed: 0.003,
    gravity: gravity ?? 0.1,
    // hat stuff
    // TODO(@darzu): better abstraction
    hat: 0,
    tool: 0,
    interacting: false,
    dropping: false,
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
}

export type CameraMode = "perspective" | "ortho";

export const CameraDef = EM.defineComponent("camera", () => {
  return {
    rotation: quat.create(),
    location: vec3.create(),
    perspectiveMode: "perspective" as CameraMode,
  };
});
export type CameraProps = Component<typeof CameraDef>;

export function registerStepPlayers(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, PositionDef, RotationDef, LinearVelocityDef, AuthorityDef],
    [
      PhysicsTimerDef,
      CameraDef,
      InputsDef,
      MeDef,
      PhysicsResultsDef,
      CameraViewDef,
    ],
    (objs, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++) stepPlayers(objs, res);
    },
    "stepPlayers"
  );
}

function stepPlayers(
  players: PlayerObj[],
  resources: {
    physicsTimer: Timer;
    camera: CameraProps;
    inputs: Inputs;
    physicsResults: PhysicsResults;
    cameraView: CameraView;
    me: Me;
  }
) {
  const {
    physicsTimer: { period: dt },
    inputs,
    camera,
    physicsResults: { checkRay },
    cameraView,
  } = resources;

  //console.log(`${players.length} players, ${hats.length} hats`);

  for (let p of players) {
    if (p.authority.pid !== resources.me.pid) continue;
    // fall with gravity
    // TODO(@darzu): what r the units of gravity here?
    p.linearVelocity[1] -= (p.player.gravity / 1000) * dt;

    // move player
    let vel = vec3.fromValues(0, 0, 0);
    let playerSpeed = 0.001;
    let n = playerSpeed * dt;
    if (inputs.keyDowns["a"]) {
      vec3.add(vel, vel, vec3.fromValues(-n, 0, 0));
    }
    if (inputs.keyDowns["d"]) {
      vec3.add(vel, vel, vec3.fromValues(n, 0, 0));
    }
    if (inputs.keyDowns["w"]) {
      vec3.add(vel, vel, vec3.fromValues(0, 0, -n));
    }
    if (inputs.keyDowns["s"]) {
      vec3.add(vel, vel, vec3.fromValues(0, 0, n));
    }

    // TODO(@darzu): rework to use phsyiscs colliders
    if (inputs.keyClicks["e"]) {
      p.player.interacting = true;
    } else {
      p.player.interacting = false;
    }
    p.player.dropping = (inputs.keyClicks["q"] || 0) > 0;
    // if (inputs.keyDowns["shift"]) {
    //   vec3.add(vel, vel, vec3.fromValues(0, n, 0));
    // }
    // if (inputs.keyDowns["c"]) {
    //   vec3.add(vel, vel, vec3.fromValues(0, -n, 0));
    // }
    if (inputs.keyClicks[" "]) {
      p.linearVelocity[1] = p.player.jumpSpeed * dt;
    }

    vec3.transformQuat(vel, vel, p.rotation);

    // vec3.add(player.linearVelocity, player.linearVelocity, vel);

    // x and z from local movement
    p.linearVelocity[0] = vel[0];
    p.linearVelocity[2] = vel[2];

    quat.rotateY(p.rotation, p.rotation, -inputs.mouseMovX * 0.001);
    quat.rotateX(camera.rotation, camera.rotation, -inputs.mouseMovY * 0.001);

    let facingDir = vec3.fromValues(0, 0, -1);
    facingDir = vec3.transformQuat(facingDir, facingDir, p.rotation);

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
      spawnBullet(EM, vec3.clone(p.position), linearVelocity, angularVelocity);
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
            p.position,
            vec3.fromValues(x, y, 0)
          );
          const linearVelocity = vec3.scale(vec3.create(), bullet_axis, 0.005);
          vec3.add(linearVelocity, linearVelocity, p.linearVelocity);
          const angularVelocity = vec3.scale(vec3.create(), bullet_axis, 0.01);
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
          p.position,
          vec3.scale(tempVec(), facingDir, 3.0)
        ),
        dir: facingDir,
      };
      playerShootRay(r);
    }

    function playerShootRay(r: Ray) {
      // check for hits
      const hits = checkRay(r);
      // TODO(@darzu): this seems pretty hacky and cross cutting
      hits.sort((a, b) => a.dist - b.dist);
      const firstHit: RayHit | undefined = hits[0];
      if (firstHit) {
        // increase green
        const e = EM.findEntity(firstHit.id, [ColorDef]);
        if (e) {
          e.color[1] += 0.1;
        }
      }

      // draw our ray
      const rayDist = firstHit?.dist || 1000;
      const color: vec3 = firstHit ? [0, 1, 0] : [1, 0, 0];
      const endPoint = vec3.add(
        vec3.create(),
        r.org,
        vec3.scale(tempVec(), r.dir, rayDist)
      );
      drawLine(EM, r.org, endPoint, color);
    }
  }
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
  em.addComponent(id, WorldTransformDef);
}

function createPlayer(
  em: EntityManager,
  e: Entity & { playerConstruct: PlayerConstruct },
  pid: number,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.playerConstruct;
  if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.location);
  if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef);
  if (!LinearVelocityDef.isOn(e)) em.addComponent(e.id, LinearVelocityDef);
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0, 0.2, 0]);
  if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, assets.cube.mesh);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
  if (!PlayerEntDef.isOn(e)) em.addComponent(e.id, PlayerEntDef);
  if (!ColliderDef.isOn(e)) {
    const collider = em.addComponent(e.id, ColliderDef);
    collider.shape = "AABB";
    collider.solid = true;
    (collider as AABBCollider).aabb = assets.cube.aabb;
  }
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(PlayerConstructDef.id);
    sync.dynamicComponents.push(PositionDef.id);
    sync.dynamicComponents.push(RotationDef.id);
    sync.dynamicComponents.push(LinearVelocityDef.id);
  }
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildPlayersSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerConstructDef],
    [MeDef, AssetsDef],
    (players, res) => {
      for (let p of players) createPlayer(em, p, res.me.pid, res.assets);
    },
    "buildPlayers"
  );
}
