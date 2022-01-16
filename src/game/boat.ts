import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { PhysicsTimerDef, Timer } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { FinishedDef } from "../build.js";
import { ColorDef } from "./game.js";
import { RenderableDef } from "../renderer.js";
import { PositionDef, Rotation, RotationDef } from "../physics/transform.js";
import { AABBCollider, ColliderDef } from "../physics/collider.js";
import {
  Authority,
  AuthorityDef,
  Me,
  MeDef,
  SyncDef,
} from "../net/components.js";
import { getAABBFromMesh, Mesh, scaleMesh3 } from "../mesh-pool.js";
import { AABB } from "../physics/broadphase.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef } from "./assets.js";
import { LinearVelocity, LinearVelocityDef } from "../physics/motion.js";
import { MotionSmoothingDef } from "../smoothing.js";

export const BoatDef = EM.defineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
});
export type Boat = Component<typeof BoatDef>;

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
    quat.rotateY(o.rotation, o.rotation, rad);

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
  EM.registerSystem(
    [BoatDef, RotationDef, LinearVelocityDef, AuthorityDef],
    [PhysicsTimerDef, MeDef],
    (objs, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++) {
        stepBoats(objs, res);
      }
    },
    "stepBoats"
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
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.2, 0.1, 0.05]);
  if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, assets.boat.mesh);
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
