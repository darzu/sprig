import { EM, Entity, EntityW, Component } from "../ecs/entity-manager.js";
import { TimeDef } from "../time/time.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { jitter } from "../utils/math.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  Position,
  PositionDef,
  Rotation,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { aabbCenter } from "../physics/aabb.js";
import { AllMeshes, AllMeshesDef } from "../meshes/mesh-list.js";
import { GameMesh } from "../meshes/mesh-loader.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { BulletDef, fireBullet } from "../cannons/bullet.js";
import { DeletedDef, OnDeleteDef } from "../ecs/delete.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { HsShipLocalDef } from "./hyperspace-ship.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { raiseBulletEnemyShip } from "../cannons/bullet-collision.js";
import { HSGameStateDef, HyperspaceGameState } from "./hyperspace-gamestate.js";
import { cloneMesh, scaleMesh3 } from "../meshes/mesh.js";
import { UVShipDef } from "./uv-ship.js";
import { UVDirDef, UVPosDef } from "../ocean/ocean.js";
import { ColorDef } from "../color/color-ecs.js";
import { AudioDef, Music } from "../audio/audio.js";
import { Phase } from "../ecs/sys-phase.js";

export const EnemyCrewDef = EM.defineComponent("enemyCrew", () => {
  return {
    leftLegId: 0,
    rightLegId: 0,
  };
});

export type EnemyCrew = Component<typeof EnemyCrewDef>;

export function createEnemyCrew(
  allMeshes: AllMeshes,
  parent: number,
  pos: V3
): EntityW<[typeof EnemyCrewDef]> {
  const e = EM.new();
  EM.set(e, EnemyCrewDef);
  EM.set(e, PositionDef, pos);
  EM.set(e, RotationDef, quat.create());
  const torso = cloneMesh(allMeshes.cube.mesh);
  scaleMesh3(torso, V(0.75, 0.75, 0.4));
  EM.set(e, RenderableConstructDef, torso);
  EM.set(e, ColorDef, V(0.2, 0.0, 0));
  EM.set(e, PhysicsParentDef, parent);

  function makeLeg(x: number): Entity {
    const l = EM.new();
    EM.set(l, PositionDef, V(x, -1.75, 0));
    EM.set(l, RenderableConstructDef, allMeshes.cube.proto);
    EM.set(l, ScaleDef, V(0.1, 1.0, 0.1));
    EM.set(l, ColorDef, V(0.05, 0.05, 0.05));
    EM.set(l, PhysicsParentDef, e.id);
    return l;
  }
  e.enemyCrew.leftLegId = makeLeg(-0.5).id;
  e.enemyCrew.rightLegId = makeLeg(0.5).id;
  return e;
}

export const { EnemyShipPropsDef, EnemyShipLocalDef, createEnemyShip } =
  defineNetEntityHelper({
    name: "enemyShip",
    defaultProps: () => {
      return {
        uvLoc: V(0, 0),
        speed: 0.0,
        wheelSpeed: 0.0,
        uvDir: V(1, 0),
        parent: 0,
      };
    },
    updateProps: (
      p,
      uvLoc?: V2.InputT,
      speed?: number,
      wheelSpeed?: number,
      uvDir?: V2.InputT,
      parent?: number
    ) => {
      if (uvLoc) V2.copy(p.uvLoc, uvLoc);
      if (speed !== undefined) p.speed = speed;
      if (wheelSpeed !== undefined) p.wheelSpeed = wheelSpeed;
      if (uvDir) V2.copy(p.uvDir, uvDir);
      if (parent !== undefined) p.parent = parent;
      return p;
    },
    serializeProps: (c, buf) => {
      buf.writeVec2(c.uvLoc);
      buf.writeVec2(c.uvDir);
      buf.writeFloat32(c.speed);
      buf.writeFloat32(c.wheelSpeed);
      buf.writeUint32(c.parent);
    },
    deserializeProps: (c, buf) => {
      buf.readVec2(c.uvLoc);
      buf.readVec2(c.uvDir);
      c.speed = buf.readFloat32();
      c.wheelSpeed = buf.readFloat32();
      c.parent = buf.readUint32();
    },
    defaultLocal: () => {
      return {
        fireDelay: 2000,
        fireRate: 3000,
        // fireDelay: 0,
        // fireRate: 500,
        fireZoneId: 0,
        childCannonId: 0,
        childEnemyId: 0,
      };
    },
    // TODO(@darzu): probably sync UV pos/dir
    dynamicComponents: [PositionDef, RotationDef],
    buildResources: [AllMeshesDef, MeDef],
    build: (e, res) => {
      EM.set(e, UVShipDef);
      e.uvship.speed = e.enemyShipProps.speed;

      EM.set(e, ColorDef, ENEMY_SHIP_COLOR);
      EM.set(e, MotionSmoothingDef);
      EM.set(e, RenderableConstructDef, res.allMeshes.cubeRaft.mesh);

      EM.set(e, UVPosDef);
      V2.copy(e.uvPos, e.enemyShipProps.uvLoc);
      EM.set(e, UVDirDef);
      V2.copy(e.uvDir, e.enemyShipProps.uvDir);

      EM.set(e, PhysicsParentDef, e.enemyShipProps.parent);

      // fire zone is local, not synced
      // TODO(@darzu): fire zone should probably be host-only
      const fireZone = EM.new();
      const fireZoneSize = 40;
      EM.set(fireZone, ColliderDef, {
        solid: false,
        shape: "AABB",
        aabb: {
          min: V(-2, -2, -fireZoneSize),
          max: V(2, 2, fireZoneSize),
        },
      });
      EM.set(fireZone, PhysicsParentDef, e.id);
      EM.set(fireZone, PositionDef, V(0, 0, -fireZoneSize));
      EM.set(fireZone, FireZoneDef);
      e.enemyShipLocal.fireZoneId = fireZone.id;

      EM.set(e, OnDeleteDef, () => {
        EM.ensureComponent(e.enemyShipLocal.fireZoneId, DeletedDef);

        const cannon = EM.findEntity(e.enemyShipLocal.childCannonId, [])!;
        EM.set(cannon, DeletedDef);

        const enemy = EM.findEntity(e.enemyShipLocal.childEnemyId, [
          WorldFrameDef,
          PositionDef,
          RotationDef,
          EnemyCrewDef,
        ]);
        if (enemy) {
          EM.set(enemy, LifetimeDef, 4000);
          EM.ensureComponent(enemy.enemyCrew.leftLegId, LifetimeDef, 4000);
          EM.ensureComponent(enemy.enemyCrew.rightLegId, LifetimeDef, 4000);
          EM.removeComponent(enemy.id, PhysicsParentDef);
          V3.copy(enemy.position, enemy.world.position);
          quat.copy(enemy.rotation, enemy.world.rotation);
          EM.set(enemy, LinearVelocityDef, V(0, -0.002, 0));
        }
      });

      EM.set(e, ColliderDef, {
        shape: "AABB",
        // TODO(@darzu):
        solid: false,
        // solid: true,
        aabb: res.allMeshes.cubeRaft.aabb,
      });

      const cannon = EM.new();
      EM.set(cannon, RenderableConstructDef, res.allMeshes.cannon.proto);
      EM.set(cannon, PhysicsParentDef, e.id);
      EM.set(cannon, PositionDef, V(0, 2, 0));

      const cannonRot = quat.create();
      const pitch = Math.PI * 0.08;
      // quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
      // quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
      quat.rotateX(cannonRot, pitch, cannonRot);
      EM.set(cannon, RotationDef, cannonRot);
      e.enemyShipLocal.childCannonId = cannon.id;

      // child enemy
      const en = createEnemyCrew(res.allMeshes, e.id, V(2, 3, 0));
      e.enemyShipLocal.childEnemyId = en.id;
      if (e.authority.pid === res.me.pid) {
        // destroy after 1 minute
        EM.set(e, LifetimeDef, 1000 * 60);
      }
    },
  });

export const ENEMY_SHIP_COLOR: V3 = V(0.2, 0.1, 0.05);

export const raiseBreakEnemyShip = eventWizard(
  "break-enemyShip",
  [[EnemyShipLocalDef, PositionDef, RotationDef]] as const,
  ([enemyShip]) => {
    const res = EM.getResources([AllMeshesDef, AudioDef])!;
    breakEnemyShip(enemyShip, res.allMeshes.boat_broken, res.music);
  }
);

export function registerEnemyShipSystems() {
  EM.addSystem(
    "stepEnemyShips",
    Phase.GAME_WORLD,
    [EnemyShipLocalDef, EnemyShipPropsDef, UVDirDef, UVShipDef, AuthorityDef],
    [TimeDef, MeDef],
    (enemyShips, res) => {
      for (let o of enemyShips) {
        if (o.authority.pid !== res.me.pid) continue;

        const radYaw = o.enemyShipProps.wheelSpeed * res.time.dt;
        // o.enemyShipProps.uvDir += rad;
        // TODO(@darzu):  * 0.02

        // o.enemyShipProps.uvDir += rad;
        // TODO(@darzu):  * 0.02
        V2.rotate(o.uvDir, V2.ZEROS, radYaw, o.uvDir);
      }
    }
  );

  EM.addSystem(
    "enemyShipsFire",
    Phase.GAME_WORLD,
    [EnemyShipLocalDef, AuthorityDef],
    [TimeDef, MeDef, PhysicsResultsDef],
    (enemyShips, res) => {
      for (let o of enemyShips) {
        if (o.authority.pid !== res.me.pid) continue;

        // TODO(@darzu): COUNT DOWN FIREZONE
        const hits = res.physicsResults.collidesWith.get(
          o.enemyShipLocal.fireZoneId
        );
        const seesPlayer = hits?.some(
          (h) => !!EM.findEntity(h, [HsShipLocalDef])
        );
        if (seesPlayer) {
          o.enemyShipLocal.fireDelay -= res.time.dt;
          // console.log(o.enemyShip.fireDelay);
        }

        if (o.enemyShipLocal.fireDelay < 0) {
          o.enemyShipLocal.fireDelay += o.enemyShipLocal.fireRate;

          const cannon = EM.findEntity(o.enemyShipLocal.childCannonId, [
            WorldFrameDef,
          ]);
          if (cannon) {
            // const rot = quat.create();
            // quat.rotateY(rot, cannon.world.rotation, Math.PI * 0.5);
            const bulletSpeed = jitter(0.025) + 0.075;
            fireBullet(
              2,
              cannon.world.position,
              cannon.world.rotation,
              bulletSpeed,
              // TODO(@darzu): what stats here?
              0.02,
              6 * 0.00001,
              10,
              V3.FWD
            );
          }
        }
      }
    }
  );

  EM.addSystem(
    "breakEnemyShips",
    Phase.GAME_WORLD,
    [EnemyShipLocalDef, PositionDef, RotationDef],
    [PhysicsResultsDef, AllMeshesDef, AudioDef, MeDef, DetectedEventsDef],
    (objs, res) => {
      for (let enemyShip of objs) {
        const hits = res.physicsResults.collidesWith.get(enemyShip.id);
        if (hits) {
          const balls = hits
            .map((h) => EM.findEntity(h, [BulletDef, AuthorityDef]))
            .filter((b) => {
              return b && b.bullet.team === 1 && b.authority.pid === res.me.pid;
            });
          if (balls.length) {
            raiseBulletEnemyShip(balls[0]!, enemyShip);
          }

          const ships = hits.filter((h) => EM.findEntity(h, [HsShipLocalDef]));
          if (ships.length) {
            raiseBreakEnemyShip(enemyShip);
          }
        }
      }
    }
  );
}

export function breakEnemyShip(
  enemyShip: Entity & { position: Position; rotation: Rotation },
  enemyShipParts: GameMesh[],
  music: Music
) {
  EM.set(enemyShip, DeletedDef);

  // TODO(@darzu): AUDIO. unify old and new audio system
  //music.playChords([3], "minor", 2.0, 5.0, -1);

  for (let part of enemyShipParts) {
    const pe = EM.new();
    // TODO(@darzu): use some sort of chunks particle system, we don't
    //  need entity ids for these.
    EM.set(pe, RenderableConstructDef, part.proto);
    EM.set(pe, ColorDef, ENEMY_SHIP_COLOR);
    EM.set(pe, RotationDef, quat.clone(enemyShip.rotation));
    EM.set(pe, PositionDef, V3.clone(enemyShip.position));
    // EM.set(pe, ColliderDef, {
    //   shape: "AABB",
    //   solid: false,
    //   aabb: part.aabb,
    // });
    const com = aabbCenter(V3.mk(), part.aabb);
    V3.tQuat(com, enemyShip.rotation, com);
    // vec3.add(com, com, enemyShip.position);
    // vec3.transformQuat(com, com, enemyShip.rotation);
    const vel = com;
    // const vel = vec3.sub(vec3.create(), com, enemyShip.position);
    // const vel = vec3.sub(vec3.create(), com, enemyShip.position);
    V3.norm(vel, vel);
    V3.add(vel, [0, -0.6, 0], vel);
    V3.scale(vel, 0.005, vel);
    EM.set(pe, LinearVelocityDef, vel);
    const spin = V(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
    V3.norm(spin, spin);
    V3.scale(spin, 0.001, spin);
    EM.set(pe, AngularVelocityDef, spin);
    EM.set(pe, LifetimeDef, 2000);
  }
}

export const FireZoneDef = EM.defineComponent("firezone", () => {});

export function spawnEnemyShip(
  loc: V2,
  parentId: number,
  uvDir: V2
): EntityW<[typeof EnemyShipPropsDef]> {
  return createEnemyShip(
    loc,
    0.0002 + jitter(0.0001),
    jitter(0.00005),
    uvDir,
    parentId
  );
}
