import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { createMotionProps, Motion, MotionDef } from "../phys_motion.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import {
  MotionSmoothingDef,
  RenderableDef,
  TransformDef,
} from "../renderer.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { AABBCollider, ColliderDef } from "../collider.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
  PredictDef,
} from "../net/components.js";
import {
  getAABBFromMesh,
  Mesh,
  MeshHandle,
  MeshHandleDef,
  scaleMesh,
  scaleMesh3,
} from "../mesh-pool.js";
import { AABB } from "../phys_broadphase.js";
import { RendererDef } from "../render_init.js";
import { Renderer } from "../render_webgpu.js";
import { Assets, AssetsDef } from "./assets.js";

export const BulletDef = EM.defineComponent("bullet", () => {
  return true;
});
export type Bullet = Component<typeof BulletDef>;

export const BulletConstructDef = EM.defineComponent(
  "bulletConstruct",
  (loc?: vec3, vel?: vec3, angVel?: vec3) => {
    return {
      location: loc ?? vec3.fromValues(0, 0, 0),
      linearVelocity: vel ?? vec3.fromValues(0, 1, 0),
      angularVelocity: angVel ?? vec3.fromValues(0, 0, 0),
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
  },
  (c, reader) => {
    reader.readVec3(c.location);
    reader.readVec3(c.linearVelocity);
    reader.readVec3(c.angularVelocity);
  }
);

const BULLET_COLOR: vec3 = [0.3, 0.3, 0.8];

function createBullet(
  em: EntityManager,
  e: Entity & { bulletConstruct: BulletConstruct },
  pid: number,
  renderer: Renderer,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.bulletConstruct;
  if (!MotionDef.isOn(e))
    em.addComponent(
      e.id,
      MotionDef,
      props.location,
      quat.create(),
      props.linearVelocity,
      props.angularVelocity
    );
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, BULLET_COLOR);
  if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
  if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, assets.bullet.proto);
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!AuthorityDef.isOn(e)) {
    em.addComponent(e.id, AuthorityDef, pid);
  }
  if (!BulletDef.isOn(e)) {
    em.addComponent(e.id, BulletDef);
  }
  if (!ColliderDef.isOn(e)) {
    const collider = em.addComponent(e.id, ColliderDef);
    collider.shape = "AABB";
    collider.solid = false;
    (collider as AABBCollider).aabb = assets.bullet.aabb;
  }
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(BulletConstructDef.id);
    sync.dynamicComponents.push(MotionDef.id);
  }
  if (!PredictDef.isOn(e)) em.addComponent(e.id, PredictDef);
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildBulletsSystem(em: EntityManager) {
  em.registerSystem(
    [BulletConstructDef],
    [MeDef, RendererDef, AssetsDef],
    (bullets, res) => {
      for (let b of bullets)
        createBullet(em, b, res.me.pid, res.renderer.renderer, res.assets);
    },
    "buildBullets"
  );
}

export function spawnBullet(em: EntityManager, motion: Motion) {
  const e = em.newEntity();
  em.addComponent(
    e.id,
    BulletConstructDef,
    motion.location,
    motion.linearVelocity,
    motion.angularVelocity
  );
}

export function fireBullet(
  em: EntityManager,
  location: vec3,
  rotation: quat,
  speed?: number,
  rotationSpeed?: number
) {
  speed = speed || 0.02;
  rotationSpeed = rotationSpeed || 0.02;
  let bulletAxis = vec3.fromValues(0, 0, -1);
  vec3.transformQuat(bulletAxis, bulletAxis, rotation);
  let bulletMotion = createMotionProps({});
  bulletMotion.location = vec3.clone(location);
  bulletMotion.rotation = quat.clone(rotation);
  bulletMotion.linearVelocity = vec3.scale(
    bulletMotion.linearVelocity,
    bulletAxis,
    speed
  );
  bulletMotion.angularVelocity = vec3.scale(
    bulletMotion.angularVelocity,
    bulletAxis,
    rotationSpeed
  );
  spawnBullet(em, bulletMotion);
}
