import { EM, EntityManager, Component, Entity } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion, MotionDef } from "../phys_motion.js";
import { jitter } from "../math.js";
import { FinishedDef } from "../build.js";
import { ColorDef, CUBE_MESH } from "./game.js";
import {
  MotionSmoothingDef,
  RenderableDef,
  TransformDef,
} from "../renderer.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { AABBCollider, ColliderDef } from "../collider.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { getAABBFromMesh, Mesh, scaleMesh3 } from "../mesh-pool.js";
import { AABB } from "../phys_broadphase.js";
import { Deserializer, Serializer } from "../serialize.js";

export const BoatDef = EM.defineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
});
export type Boat = Component<typeof BoatDef>;

function stepBoats(
  boats: { boat: Boat; motion: Motion }[],
  { time }: { time: { dt: number } }
) {
  for (let o of boats) {
    const rad = o.boat.wheelSpeed * time.dt;
    o.boat.wheelDir += rad;

    // rotate
    quat.rotateY(o.motion.rotation, o.motion.rotation, rad);

    // rotate velocity
    vec3.rotateY(
      o.motion.linearVelocity,
      [o.boat.speed, 0, 0],
      [0, 0, 0],
      o.boat.wheelDir
    );
  }
}

export function registerStepBoats(em: EntityManager) {
  EM.registerSystem([BoatDef, MotionDef], [TimeDef], stepBoats);
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

function serializeBoatConstruct(c: BoatConstruct, buf: Serializer) {
  buf.writeVec3(c.location);
  buf.writeFloat32(c.speed);
  buf.writeFloat32(c.wheelSpeed);
  buf.writeFloat32(c.wheelDir);
}

function deserializeBoatConstruct(c: BoatConstruct, buf: Deserializer) {
  buf.readVec3(c.location);
  c.speed = buf.readFloat32();
  c.wheelSpeed = buf.readFloat32();
  c.wheelDir = buf.readFloat32();
}

EM.registerSerializerPair(
  BoatConstructDef,
  serializeBoatConstruct,
  deserializeBoatConstruct
);

// TODO(@darzu): move these to the asset system
let _boatMesh: Mesh | undefined = undefined;
let _boatAABB: AABB | undefined = undefined;
function getBoatMesh(): Mesh {
  if (!_boatMesh) _boatMesh = scaleMesh3(CUBE_MESH, [5, 0.3, 2.5]);
  return _boatMesh;
}
function getBoatAABB(): AABB {
  if (!_boatAABB) _boatAABB = getAABBFromMesh(getBoatMesh());
  return _boatAABB;
}

function createBoat(
  em: EntityManager,
  e: Entity & { boatConstruct: BoatConstruct },
  pid: number
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.boatConstruct;
  if (!MotionDef.isOn(e)) em.addComponent(e.id, MotionDef, props.location);
  if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.2, 0.1, 0.05]);
  if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
  if (!MotionSmoothingDef.isOn(e)) em.addComponent(e.id, MotionSmoothingDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, getBoatMesh());
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid, pid);
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
    (collider as AABBCollider).aabb = getBoatAABB();
  }
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(BoatConstructDef.id);
    sync.dynamicComponents.push(MotionDef.id);
  }
  em.addComponent(e.id, FinishedDef);
}

export function registerCreateBoats(em: EntityManager) {
  em.registerSystem([BoatConstructDef], [MeDef], (boats, res) => {
    for (let b of boats) createBoat(em, b, res.me.pid);
  });
}
