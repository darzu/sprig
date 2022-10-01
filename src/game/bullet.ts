import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "../color-ecs.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { Position, PositionDef, RotationDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef, PredictDef } from "../net/components.js";
import { Assets, AssetsDef } from "./assets.js";
import {
  AngularVelocity,
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "../physics/motion.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { LifetimeDef } from "./lifetime.js";
import { TimeDef } from "../time.js";

export const BulletDef = EM.defineComponent("bullet", (team?: number) => {
  return {
    team,
  };
});
export type Bullet = Component<typeof BulletDef>;

export const BulletConstructDef = EM.defineComponent(
  "bulletConstruct",
  (loc?: vec3, vel?: vec3, angVel?: vec3, team?: number, gravity?: number) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      linearVelocity: vel ?? vec3.fromValues(0, 1, 0),
      angularVelocity: angVel ?? vec3.fromValues(0, 0, 0),
      team,
      gravity: gravity ?? 0,
    };
  }
);
export type BulletConstruct = Component<typeof BulletConstructDef>;

EM.registerSerializerPair(
  BulletConstructDef,
  (c, writer) => {
    writer.writeVec3(c.location);
    writer.writeVec3(c.linearVelocity);
    writer.writeVec3(c.angularVelocity);
    writer.writeFloat32(c.gravity);
  },
  (c, reader) => {
    reader.readVec3(c.location);
    reader.readVec3(c.linearVelocity);
    reader.readVec3(c.angularVelocity);
    c.gravity = reader.readFloat32();
  }
);

const BULLET_COLOR: vec3 = [0.02, 0.02, 0.02];

function createBullet(
  em: EntityManager,
  e: Entity & { bulletConstruct: BulletConstruct },
  pid: number,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.bulletConstruct;
  em.ensureComponent(e.id, PositionDef, props.location);
  em.ensureComponent(e.id, RotationDef);
  em.ensureComponent(e.id, LinearVelocityDef, props.linearVelocity);
  em.ensureComponent(e.id, AngularVelocityDef, props.angularVelocity);
  em.ensureComponent(e.id, ColorDef, BULLET_COLOR);
  em.ensureComponent(e.id, MotionSmoothingDef);
  em.ensureComponent(e.id, RenderableConstructDef, assets.ball.proto);
  em.ensureComponent(e.id, AuthorityDef, pid);
  em.ensureComponent(e.id, BulletDef, props.team);
  em.ensureComponent(e.id, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: assets.ball.aabb,
  });
  em.ensureComponent(e.id, LifetimeDef, 4000);
  em.ensureComponentOn(e, SyncDef, [PositionDef.id]);
  e.sync.fullComponents = [BulletConstructDef.id];
  em.ensureComponent(e.id, PredictDef);
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildBulletsSystem(em: EntityManager) {
  em.registerSystem(
    [BulletConstructDef],
    [MeDef, AssetsDef],
    (bullets, res) => {
      for (let b of bullets) createBullet(em, b, res.me.pid, res.assets);
    },
    "buildBullets"
  );
}

export function registerBulletUpdate(em: EntityManager) {
  em.registerSystem(
    [BulletConstructDef, BulletDef, PositionDef, LinearVelocityDef],
    [TimeDef],
    (bullets, res) => {
      for (let b of bullets) {
        b.linearVelocity[1] -=
          0.00001 * b.bulletConstruct.gravity * res.time.dt;
      }
    },
    "updateBullets"
  );
}

export function fireBullet(
  em: EntityManager,
  team: number,
  location: vec3,
  rotation: quat,
  speed: number = 0.02,
  rotationSpeed: number = 0.02,
  gravity: number = 6
) {
  let bulletAxis = vec3.fromValues(0, 0, -1);
  vec3.transformQuat(bulletAxis, bulletAxis, rotation);
  vec3.normalize(bulletAxis, bulletAxis);
  const linearVelocity = vec3.scale(vec3.create(), bulletAxis, speed);
  const angularVelocity = vec3.scale(vec3.create(), bulletAxis, rotationSpeed);
  const e = em.newEntity();
  em.addComponent(
    e.id,
    BulletConstructDef,
    vec3.clone(location),
    linearVelocity,
    angularVelocity,
    team,
    gravity
  );
}
