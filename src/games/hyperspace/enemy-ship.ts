import {
  EM,
  EntityManager,
  Entity,
  EntityW,
  Component,
} from "../../entity-manager.js";
import { TimeDef } from "../../time.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../../sprig-matrix.js";
import { jitter } from "../../math.js";
import { RenderableConstructDef } from "../../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  Position,
  PositionDef,
  Rotation,
  RotationDef,
  ScaleDef,
} from "../../physics/transform.js";
import { ColliderDef } from "../../physics/collider.js";
import { AuthorityDef, MeDef } from "../../net/components.js";
import { aabbCenter } from "../../physics/broadphase.js";
import { Assets, AssetsDef, GameMesh } from "../../assets.js";
import { AngularVelocityDef, LinearVelocityDef } from "../../physics/motion.js";
import { MotionSmoothingDef } from "../../motion-smoothing.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../../physics/nonintersection.js";
import { BulletDef, fireBullet } from "../bullet.js";
import { DeletedDef, OnDeleteDef } from "../../delete.js";
import { LifetimeDef } from "../lifetime.js";
import { PlayerShipLocalDef } from "./player-ship.js";
import { defineNetEntityHelper } from "../../em_helpers.js";
import { DetectedEventsDef, eventWizard } from "../../net/events.js";
import { raiseBulletEnemyShip } from "../bullet-collision.js";
import { GameStateDef, GameState } from "./gamestate.js";
import { cloneMesh, scaleMesh3 } from "../../render/mesh.js";
import { UVShipDef } from "./uv-ship.js";
import { UVDirDef, UVPosDef } from "./ocean.js";
import { ColorDef } from "../../color-ecs.js";
import { AudioDef, Music } from "../../audio.js";

export const EnemyCrewDef = EM.defineComponent("enemyCrew", () => {
  return {
    leftLegId: 0,
    rightLegId: 0,
  };
});

export type EnemyCrew = Component<typeof EnemyCrewDef>;

export function createEnemyCrew(
  em: EntityManager,
  assets: Assets,
  parent: number,
  pos: vec3
): EntityW<[typeof EnemyCrewDef]> {
  const e = em.new();
  em.ensureComponentOn(e, EnemyCrewDef);
  em.ensureComponentOn(e, PositionDef, pos);
  em.ensureComponentOn(e, RotationDef, quat.create());
  const torso = cloneMesh(assets.cube.mesh);
  scaleMesh3(torso, V(0.75, 0.75, 0.4));
  em.ensureComponentOn(e, RenderableConstructDef, torso);
  em.ensureComponentOn(e, ColorDef, V(0.2, 0.0, 0));
  em.ensureComponentOn(e, PhysicsParentDef, parent);

  function makeLeg(x: number): Entity {
    const l = em.new();
    em.ensureComponentOn(l, PositionDef, V(x, -1.75, 0));
    em.ensureComponentOn(l, RenderableConstructDef, assets.cube.proto);
    em.ensureComponentOn(l, ScaleDef, V(0.1, 1.0, 0.1));
    em.ensureComponentOn(l, ColorDef, V(0.05, 0.05, 0.05));
    em.ensureComponentOn(l, PhysicsParentDef, e.id);
    return l;
  }
  e.enemyCrew.leftLegId = makeLeg(-0.5).id;
  e.enemyCrew.rightLegId = makeLeg(0.5).id;
  return e;
}

export const { EnemyShipPropsDef, EnemyShipLocalDef, createEnemyShip } =
  defineNetEntityHelper(EM, {
    name: "enemyShip",
    defaultProps: (
      uvLoc?: vec2,
      speed?: number,
      wheelSpeed?: number,
      uvDir?: vec2,
      parent?: number
    ) => {
      return {
        uvLoc: uvLoc ?? vec2.fromValues(0, 0),
        speed: speed ?? 0.0,
        wheelSpeed: wheelSpeed ?? 0.0,
        uvDir: uvDir ?? vec2.fromValues(1, 0),
        parent: parent ?? 0,
      };
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
    buildResources: [AssetsDef, MeDef],
    build: (e, res) => {
      const em: EntityManager = EM;

      em.ensureComponentOn(e, UVShipDef);
      e.uvship.speed = e.enemyShipProps.speed;

      em.ensureComponentOn(e, ColorDef, ENEMY_SHIP_COLOR);
      em.ensureComponentOn(e, MotionSmoothingDef);
      em.ensureComponentOn(
        e,
        RenderableConstructDef,
        res.assets.enemyShip.mesh
      );

      em.ensureComponentOn(e, UVPosDef);
      vec2.copy(e.uvPos, e.enemyShipProps.uvLoc);
      em.ensureComponentOn(e, UVDirDef);
      vec2.copy(e.uvDir, e.enemyShipProps.uvDir);

      em.ensureComponentOn(e, PhysicsParentDef, e.enemyShipProps.parent);

      // fire zone is local, not synced
      // TODO(@darzu): fire zone should probably be host-only
      const fireZone = em.new();
      const fireZoneSize = 40;
      em.ensureComponentOn(fireZone, ColliderDef, {
        solid: false,
        shape: "AABB",
        aabb: {
          min: V(-2, -2, -fireZoneSize),
          max: V(2, 2, fireZoneSize),
        },
      });
      em.ensureComponentOn(fireZone, PhysicsParentDef, e.id);
      em.ensureComponentOn(fireZone, PositionDef, V(0, 0, -fireZoneSize));
      em.ensureComponentOn(fireZone, FireZoneDef);
      e.enemyShipLocal.fireZoneId = fireZone.id;

      em.ensureComponentOn(e, OnDeleteDef, () => {
        em.ensureComponent(e.enemyShipLocal.fireZoneId, DeletedDef);

        const cannon = em.findEntity(e.enemyShipLocal.childCannonId, [])!;
        em.ensureComponentOn(cannon, DeletedDef);

        const enemy = em.findEntity(e.enemyShipLocal.childEnemyId, [
          WorldFrameDef,
          PositionDef,
          RotationDef,
          EnemyCrewDef,
        ]);
        if (enemy) {
          em.ensureComponent(enemy.id, LifetimeDef, 4000);
          em.ensureComponent(enemy.enemyCrew.leftLegId, LifetimeDef, 4000);
          em.ensureComponent(enemy.enemyCrew.rightLegId, LifetimeDef, 4000);
          em.removeComponent(enemy.id, PhysicsParentDef);
          vec3.copy(enemy.position, enemy.world.position);
          quat.copy(enemy.rotation, enemy.world.rotation);
          em.ensureComponentOn(enemy, LinearVelocityDef, V(0, -0.002, 0));
        }
      });

      em.ensureComponentOn(e, ColliderDef, {
        shape: "AABB",
        // TODO(@darzu):
        solid: false,
        // solid: true,
        aabb: res.assets.enemyShip.aabb,
      });

      const cannon = em.new();
      em.ensureComponentOn(
        cannon,
        RenderableConstructDef,
        res.assets.cannon.proto
      );
      em.ensureComponentOn(cannon, PhysicsParentDef, e.id);
      em.ensureComponentOn(cannon, PositionDef, V(0, 2, 0));

      const cannonRot = quat.create();
      const pitch = Math.PI * 0.08;
      // quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
      // quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
      quat.rotateX(cannonRot, pitch, cannonRot);
      em.ensureComponentOn(cannon, RotationDef, cannonRot);
      e.enemyShipLocal.childCannonId = cannon.id;

      // child enemy
      const en = createEnemyCrew(em, res.assets, e.id, V(2, 3, 0));
      e.enemyShipLocal.childEnemyId = en.id;
      if (e.authority.pid === res.me.pid) {
        // destroy after 1 minute
        em.ensureComponentOn(e, LifetimeDef, 1000 * 60);
      }
    },
  });

export const ENEMY_SHIP_COLOR: vec3 = V(0.2, 0.1, 0.05);

export const raiseBreakEnemyShip = eventWizard(
  "break-enemyShip",
  [[EnemyShipLocalDef, PositionDef, RotationDef]] as const,
  ([enemyShip]) => {
    const res = EM.getResources([AssetsDef, AudioDef])!;
    breakEnemyShip(EM, enemyShip, res.assets.boat_broken, res.music);
  }
);

export function registerEnemyShipSystems(em: EntityManager) {
  em.registerSystem(
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
        vec2.rotate(o.uvDir, vec2.ZEROS, radYaw, o.uvDir);
      }
    },
    "stepEnemyShips"
  );

  em.registerSystem(
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
          (h) => !!em.findEntity(h, [PlayerShipLocalDef])
        );
        if (seesPlayer) {
          o.enemyShipLocal.fireDelay -= res.time.dt;
          // console.log(o.enemyShip.fireDelay);
        }

        if (o.enemyShipLocal.fireDelay < 0) {
          o.enemyShipLocal.fireDelay += o.enemyShipLocal.fireRate;

          const cannon = em.findEntity(o.enemyShipLocal.childCannonId, [
            WorldFrameDef,
          ]);
          if (cannon) {
            // const rot = quat.create();
            // quat.rotateY(rot, cannon.world.rotation, Math.PI * 0.5);
            const bulletSpeed = jitter(0.025) + 0.075;
            fireBullet(
              em,
              2,
              cannon.world.position,
              cannon.world.rotation,
              bulletSpeed,
              // TODO(@darzu): what stats here?
              0.02,
              6,
              10
            );
          }
        }
      }
    },
    "enemyShipsFire"
  );

  em.registerSystem(
    [EnemyShipLocalDef, PositionDef, RotationDef],
    [PhysicsResultsDef, AssetsDef, AudioDef, MeDef, DetectedEventsDef],
    (objs, res) => {
      for (let enemyShip of objs) {
        const hits = res.physicsResults.collidesWith.get(enemyShip.id);
        if (hits) {
          const balls = hits
            .map((h) => em.findEntity(h, [BulletDef, AuthorityDef]))
            .filter((b) => {
              return b && b.bullet.team === 1 && b.authority.pid === res.me.pid;
            });
          if (balls.length) {
            raiseBulletEnemyShip(balls[0]!, enemyShip);
          }

          const ships = hits.filter((h) =>
            em.findEntity(h, [PlayerShipLocalDef])
          );
          if (ships.length) {
            raiseBreakEnemyShip(enemyShip);
          }
        }
      }
    },
    "breakEnemyShips"
  );
}

export function breakEnemyShip(
  em: EntityManager,
  enemyShip: Entity & { position: Position; rotation: Rotation },
  enemyShipParts: GameMesh[],
  music: Music
) {
  em.ensureComponentOn(enemyShip, DeletedDef);

  music.playChords([3], "minor", 2.0, 5.0, -1);

  for (let part of enemyShipParts) {
    const pe = em.new();
    // TODO(@darzu): use some sort of chunks particle system, we don't
    //  need entity ids for these.
    em.ensureComponentOn(pe, RenderableConstructDef, part.proto);
    em.ensureComponentOn(pe, ColorDef, ENEMY_SHIP_COLOR);
    em.ensureComponentOn(pe, RotationDef, quat.clone(enemyShip.rotation));
    em.ensureComponentOn(pe, PositionDef, vec3.clone(enemyShip.position));
    // em.ensureComponentOn(pe, ColliderDef, {
    //   shape: "AABB",
    //   solid: false,
    //   aabb: part.aabb,
    // });
    const com = aabbCenter(vec3.create(), part.aabb);
    vec3.transformQuat(com, enemyShip.rotation, com);
    // vec3.add(com, com, enemyShip.position);
    // vec3.transformQuat(com, com, enemyShip.rotation);
    const vel = com;
    // const vel = vec3.sub(vec3.create(), com, enemyShip.position);
    // const vel = vec3.sub(vec3.create(), com, enemyShip.position);
    vec3.normalize(vel, vel);
    vec3.add(vel, [0, -0.6, 0], vel);
    vec3.scale(vel, 0.005, vel);
    em.ensureComponentOn(pe, LinearVelocityDef, vel);
    const spin = V(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
    vec3.normalize(spin, spin);
    vec3.scale(spin, 0.001, spin);
    em.ensureComponentOn(pe, AngularVelocityDef, spin);
    em.ensureComponentOn(pe, LifetimeDef, 2000);
  }
}

export const FireZoneDef = EM.defineComponent("firezone", () => {});

export function spawnEnemyShip(
  loc: vec2,
  parentId: number,
  uvDir: vec2
): EntityW<[typeof EnemyShipPropsDef]> {
  return createEnemyShip(
    loc,
    0.0002 + jitter(0.0001),
    jitter(0.00005),
    uvDir,
    parentId
  );
}
