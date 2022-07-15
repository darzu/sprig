import { EM, EntityManager, Entity, EntityW } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { ColorDef } from "../color.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  Position,
  PositionDef,
  Rotation,
  RotationDef,
} from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { aabbCenter } from "../physics/broadphase.js";
import { AssetsDef, GameMesh } from "./assets.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { BulletDef, fireBullet } from "./bullet.js";
import { DeletedDef, OnDeleteDef } from "../delete.js";
import { LifetimeDef } from "./lifetime.js";
import { createEnemy, EnemyDef } from "./enemy.js";
import { ShipLocalDef } from "./ship.js";
import { Music, MusicDef } from "../music.js";
import { defineNetEntityHelper } from "../em_helpers.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { raiseBulletBoat } from "./bullet-collision.js";
import { GameStateDef, GameState } from "./gamestate.js";
import { GroundSystemDef } from "./ground.js";

export const { BoatPropsDef, BoatLocalDef, createBoat } = defineNetEntityHelper(
  EM,
  {
    name: "boat",
    defaultProps: (
      loc?: vec3,
      speed?: number,
      wheelSpeed?: number,
      wheelDir?: number,
      parent?: number
    ) => {
      return {
        location: loc ?? vec3.fromValues(0, 0, 0),
        speed: speed ?? 0.01,
        wheelSpeed: wheelSpeed ?? 0.0,
        wheelDir: wheelDir ?? 0.0,
        parent: parent ?? 0,
      };
    },
    serializeProps: (c, buf) => {
      buf.writeVec3(c.location);
      buf.writeFloat32(c.speed);
      buf.writeFloat32(c.wheelSpeed);
      buf.writeFloat32(c.wheelDir);
      buf.writeUint32(c.parent);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.location);
      c.speed = buf.readFloat32();
      c.wheelSpeed = buf.readFloat32();
      c.wheelDir = buf.readFloat32();
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
    dynamicComponents: [PositionDef, RotationDef, LinearVelocityDef],
    buildResources: [AssetsDef, MeDef],
    build: (e, res) => {
      const em: EntityManager = EM;
      em.ensureComponentOn(e, ColorDef, BOAT_COLOR);
      em.ensureComponentOn(e, MotionSmoothingDef);
      em.ensureComponentOn(e, RenderableConstructDef, res.assets.boat.mesh);
      vec3.copy(e.position, e.boatProps.location);

      em.ensureComponentOn(e, PhysicsParentDef, e.boatProps.parent);

      // fire zone is local, not synced
      // TODO(@darzu): fire zone should probably be host-only
      const fireZone = em.newEntity();
      const fireZoneSize = 40;
      em.ensureComponentOn(fireZone, ColliderDef, {
        solid: false,
        shape: "AABB",
        aabb: {
          min: [-2, -2, -fireZoneSize],
          max: [2, 2, fireZoneSize],
        },
      });
      em.ensureComponentOn(fireZone, PhysicsParentDef, e.id);
      em.ensureComponentOn(fireZone, PositionDef, [0, 0, -fireZoneSize]);
      em.ensureComponentOn(fireZone, FireZoneDef);
      e.boatLocal.fireZoneId = fireZone.id;

      em.ensureComponentOn(e, OnDeleteDef, () => {
        em.ensureComponent(e.boatLocal.fireZoneId, DeletedDef);

        const cannon = em.findEntity(e.boatLocal.childCannonId, [])!;
        em.ensureComponentOn(cannon, DeletedDef);

        const enemy = em.findEntity(e.boatLocal.childEnemyId, [
          WorldFrameDef,
          PositionDef,
          RotationDef,
          EnemyDef,
        ]);
        if (enemy) {
          em.ensureComponent(enemy.id, LifetimeDef, 4000);
          em.ensureComponent(enemy.enemy.leftLegId, LifetimeDef, 4000);
          em.ensureComponent(enemy.enemy.rightLegId, LifetimeDef, 4000);
          em.removeComponent(enemy.id, PhysicsParentDef);
          vec3.copy(enemy.position, enemy.world.position);
          quat.copy(enemy.rotation, enemy.world.rotation);
          em.ensureComponentOn(enemy, LinearVelocityDef, [0, -0.002, 0]);
        }
      });

      em.ensureComponentOn(e, ColliderDef, {
        shape: "AABB",
        // TODO(@darzu):
        solid: false,
        // solid: true,
        aabb: res.assets.boat.aabb,
      });

      const cannon = em.newEntity();
      em.ensureComponentOn(
        cannon,
        RenderableConstructDef,
        res.assets.cannon.proto
      );
      em.ensureComponentOn(cannon, PhysicsParentDef, e.id);
      em.ensureComponentOn(cannon, PositionDef, [0, 2, 0]);

      const cannonRot = quat.create();
      const pitch = Math.PI * 0.08;
      // quat.rotateY(cannonRot, cannonRot, Math.PI * 0.5);
      quat.rotateX(cannonRot, cannonRot, pitch);
      em.ensureComponentOn(cannon, RotationDef, cannonRot);
      e.boatLocal.childCannonId = cannon.id;

      // child enemy
      const en = createEnemy(em, res.assets, e.id, [2, 3, 0]);
      e.boatLocal.childEnemyId = en.id;
      if (e.authority.pid === res.me.pid) {
        // destroy after 1 minute
        em.ensureComponentOn(e, LifetimeDef, 1000 * 60);
      }
    },
  }
);

export const BOAT_COLOR: vec3 = [0.2, 0.1, 0.05];

export const raiseBreakBoat = eventWizard(
  "break-boat",
  [[BoatLocalDef, PositionDef, RotationDef]] as const,
  ([boat]) => {
    const res = EM.getResources([AssetsDef, MusicDef])!;
    // breakBoat(EM, boat, res.assets.boat_broken, res.music);
  }
);

export function registerBoatSystems(em: EntityManager) {
  em.registerSystem(
    [BoatLocalDef, BoatPropsDef, RotationDef, LinearVelocityDef, AuthorityDef],
    [TimeDef, MeDef],
    (boats, res) => {
      for (let o of boats) {
        if (o.authority.pid !== res.me.pid) continue;

        const rad = o.boatProps.wheelSpeed * res.time.dt;
        o.boatProps.wheelDir += rad;

        // rotate
        quat.rotateY(o.rotation, quat.IDENTITY, o.boatProps.wheelDir);

        // rotate velocity
        vec3.rotateY(
          o.linearVelocity,
          // TODO(@darzu): debugging
          [-o.boatProps.speed, 0.0, 0],
          // [o.boatProps.speed, -0.01, 0],
          [0, 0, 0],
          o.boatProps.wheelDir
        );
      }
    },
    "stepBoats"
  );

  em.registerSystem(
    [BoatLocalDef, AuthorityDef],
    [TimeDef, MeDef, PhysicsResultsDef],
    (boats, res) => {
      for (let o of boats) {
        if (o.authority.pid !== res.me.pid) continue;

        // TODO(@darzu): COUNT DOWN FIREZONE
        const hits = res.physicsResults.collidesWith.get(
          o.boatLocal.fireZoneId
        );
        const seesPlayer = hits?.some(
          (h) => !!em.findEntity(h, [ShipLocalDef])
        );
        if (seesPlayer) {
          o.boatLocal.fireDelay -= res.time.dt;
          // console.log(o.boat.fireDelay);
        }

        if (o.boatLocal.fireDelay < 0) {
          o.boatLocal.fireDelay += o.boatLocal.fireRate;

          const cannon = em.findEntity(o.boatLocal.childCannonId, [
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
              bulletSpeed
            );
          }
        }
      }
    },
    "boatsFire"
  );

  em.registerSystem(
    [BoatLocalDef, PositionDef, RotationDef],
    [PhysicsResultsDef, AssetsDef, MusicDef, MeDef, DetectedEventsDef],
    (objs, res) => {
      for (let boat of objs) {
        const hits = res.physicsResults.collidesWith.get(boat.id);
        if (hits) {
          const balls = hits
            .map((h) => em.findEntity(h, [BulletDef, AuthorityDef]))
            .filter((b) => {
              return b && b.bullet.team === 1 && b.authority.pid === res.me.pid;
            });
          if (balls.length) {
            raiseBulletBoat(balls[0]!, boat);
          }

          const ships = hits.filter((h) => em.findEntity(h, [ShipLocalDef]));
          if (ships.length) {
            raiseBreakBoat(boat);
          }
        }
      }
    },
    "breakBoats"
  );
}

export function breakBoat(
  em: EntityManager,
  boat: Entity & { position: Position; rotation: Rotation },
  boatParts: GameMesh[],
  music: Music
) {
  em.ensureComponentOn(boat, DeletedDef);

  music.playChords([3], "minor", 2.0, 5.0, -1);

  for (let part of boatParts) {
    const pe = em.newEntity();
    // TODO(@darzu): use some sort of chunks particle system, we don't
    //  need entity ids for these.
    em.ensureComponentOn(pe, RenderableConstructDef, part.proto);
    em.ensureComponentOn(pe, ColorDef, BOAT_COLOR);
    em.ensureComponentOn(pe, RotationDef, quat.clone(boat.rotation));
    em.ensureComponentOn(pe, PositionDef, vec3.clone(boat.position));
    // em.ensureComponentOn(pe, ColliderDef, {
    //   shape: "AABB",
    //   solid: false,
    //   aabb: part.aabb,
    // });
    const com = aabbCenter(vec3.create(), part.aabb);
    vec3.transformQuat(com, com, boat.rotation);
    // vec3.add(com, com, boat.position);
    // vec3.transformQuat(com, com, boat.rotation);
    const vel = com;
    // const vel = vec3.sub(vec3.create(), com, boat.position);
    vec3.normalize(vel, vel);
    vec3.add(vel, vel, [0, -0.6, 0]);
    vec3.scale(vel, vel, 0.005);
    em.ensureComponentOn(pe, LinearVelocityDef, vel);
    const spin = vec3.fromValues(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
    vec3.normalize(spin, spin);
    vec3.scale(spin, spin, 0.001);
    em.ensureComponentOn(pe, AngularVelocityDef, spin);
    em.ensureComponentOn(pe, LifetimeDef, 2000);
  }
}

export const FireZoneDef = EM.defineComponent("firezone", () => {});

export function spawnBoat(
  loc: vec3,
  parentId: number,
  wheelDir: number,
  facingRight: boolean
): EntityW<[typeof BoatPropsDef]> {
  const boat = EM.newEntity();
  EM.ensureComponentOn(boat, BoatPropsDef);
  const boatCon = boat.boatProps;
  boatCon.location = loc;
  boatCon.parent = parentId;
  boatCon.speed = 0.005 + jitter(0.002);
  boatCon.wheelDir = wheelDir * (1 + jitter(0.1));
  boatCon.wheelSpeed = jitter(0.00005);
  if (facingRight) {
    boatCon.speed *= -1;
    boatCon.wheelDir += Math.PI;
  }
  return boat;
}
