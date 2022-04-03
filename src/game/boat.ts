import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import { RenderableConstructDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  Rotation,
  RotationDef,
} from "../physics/transform.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
} from "../net/components.js";
import { getAABBFromMesh, Mesh, scaleMesh3 } from "../render/mesh-pool.js";
import { AABB, aabbCenter } from "../physics/broadphase.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef } from "./assets.js";
import {
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "../physics/motion.js";
import { MotionSmoothingDef } from "../smoothing.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { tempVec } from "../temp-pool.js";
import { LifetimeDef } from "./lifetime.js";
import { CannonConstructDef } from "./cannon.js";
import { EnemyConstructDef, EnemyDef } from "./enemy.js";

export const BoatDef = EM.defineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
    childCannonId: 0,
    childEnemyId: 0,
  };
});
export type Boat = Component<typeof BoatDef>;

export const BOAT_COLOR: vec3 = [0.2, 0.1, 0.05];

function stepBoats(
  boats: {
    boat: Boat;
    rotation: Rotation;
    linearVelocity: LinearVelocity;
    authority: Authority;
  }[],
  { physicsTimer, me }: { physicsTimer: Timer; me: Me }
) {
  for (let o of boats) {
    if (o.authority.pid !== me.pid) continue;

    const rad = o.boat.wheelSpeed * physicsTimer.period;
    o.boat.wheelDir += rad;

    // rotate
    quat.rotateY(o.rotation, quat.IDENTITY, o.boat.wheelDir);

    // rotate velocity
    vec3.rotateY(
      o.linearVelocity,
      [o.boat.speed, 0, 0],
      [0, 0, 0],
      o.boat.wheelDir
    );
  }
}

export function registerStepBoats(em: EntityManager) {
  em.registerSystem(
    [BoatDef, RotationDef, LinearVelocityDef, AuthorityDef],
    [PhysicsTimerDef, MeDef],
    (objs, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++) {
        stepBoats(objs, res);
      }
    },
    "stepBoats"
  );

  em.registerSystem(
    [BoatDef, PositionDef, RotationDef],
    [PhysicsResultsDef, AssetsDef],
    (objs, res) => {
      for (let boat of objs) {
        const hits = res.physicsResults.collidesWith.get(boat.id);
        if (hits) {
          const balls = hits.filter((h) => em.findEntity(h, [BulletDef]));
          if (balls.length) {
            console.log("HIT!");
            em.ensureComponentOn(boat, DeletedDef);
            em.ensureComponent(boat.boat.childCannonId, DeletedDef);
            for (let ball of balls) em.ensureComponent(ball, DeletedDef);

            const child = em.findEntity(boat.boat.childEnemyId, [
              WorldFrameDef,
              PositionDef,
              RotationDef,
              EnemyDef,
            ]);
            if (child) {
              em.ensureComponent(child.id, LifetimeDef, 4000);
              em.ensureComponent(child.enemy.leftLegId, LifetimeDef, 4000);
              em.ensureComponent(child.enemy.rightLegId, LifetimeDef, 4000);
              em.removeComponent(child.id, PhysicsParentDef);
              vec3.copy(child.position, child.world.position);
              quat.copy(child.rotation, child.world.rotation);
              em.ensureComponentOn(child, LinearVelocityDef, [0, -0.002, 0]);
            }

            for (let part of res.assets.boat_broken) {
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
        }
      }
    },
    "breakBoats"
  );
}

export const BoatConstructDef = EM.defineComponent(
  "boatConstruct",
  (loc?: vec3, speed?: number, wheelSpeed?: number, wheelDir?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      speed: speed ?? 0.01,
      wheelSpeed: wheelSpeed ?? 0.0,
      wheelDir: wheelDir ?? 0.0,
    };
  }
);
export type BoatConstruct = Component<typeof BoatConstructDef>;

EM.registerSerializerPair(
  BoatConstructDef,
  (c, buf) => {
    buf.writeVec3(c.location);
    buf.writeFloat32(c.speed);
    buf.writeFloat32(c.wheelSpeed);
    buf.writeFloat32(c.wheelDir);
  },
  (c, buf) => {
    buf.readVec3(c.location);
    c.speed = buf.readFloat32();
    c.wheelSpeed = buf.readFloat32();
    c.wheelDir = buf.readFloat32();
  }
);

function createBoat(
  em: EntityManager,
  e: Entity & { boatConstruct: BoatConstruct },
  pid: number,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.boatConstruct;
  if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.location);
  if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef);
  if (!LinearVelocityDef.isOn(e)) em.addComponent(e.id, LinearVelocityDef);
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, BOAT_COLOR);
  if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableConstructDef.isOn(e))
    em.addComponent(e.id, RenderableConstructDef, assets.boat.mesh);
  if (!AuthorityDef.isOn(e)) {
    // TODO(@darzu): debug why boats have jerky movement
    console.log(`claiming authority of boat ${e.id}`);
    em.addComponent(e.id, AuthorityDef, pid);
  }
  if (!BoatDef.isOn(e)) {
    const boat = em.addComponent(e.id, BoatDef);
    boat.speed = props.speed;
    boat.wheelDir = props.wheelDir;
    boat.wheelSpeed = props.wheelSpeed;

    // child cannon
    const cannon = em.newEntity();
    em.ensureComponentOn(cannon, RenderableConstructDef, assets.cannon.proto);
    em.ensureComponentOn(cannon, PhysicsParentDef, e.id);
    em.ensureComponentOn(cannon, PositionDef, [0, 2, 0]);
    em.ensureComponentOn(
      cannon,
      RotationDef,
      quat.rotateY(quat.create(), quat.IDENTITY, Math.PI * 0.5)
    );
    boat.childCannonId = cannon.id;

    boat.childCannonId = cannon.id;
    // child enemy
    const en = em.newEntity();
    em.ensureComponentOn(en, EnemyConstructDef, e.id, [2, 3, 0]);
    boat.childEnemyId = en.id;
  }
  if (!ColliderDef.isOn(e)) {
    const collider = em.addComponent(e.id, ColliderDef);
    collider.shape = "AABB";
    collider.solid = true;
    (collider as AABBCollider).aabb = assets.boat.aabb;
  }
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(BoatConstructDef.id);
    sync.dynamicComponents.push(PositionDef.id);
    sync.dynamicComponents.push(RotationDef.id);
    sync.dynamicComponents.push(LinearVelocityDef.id);
  }

  em.addComponent(e.id, FinishedDef);
}

export function registerBuildBoatsSystem(em: EntityManager) {
  em.registerSystem(
    [BoatConstructDef],
    [MeDef, AssetsDef],
    (boats, res) => {
      for (let b of boats) createBoat(em, b, res.me.pid, res.assets);
    },
    "buildBoats"
  );
}
