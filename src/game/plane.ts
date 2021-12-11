import { ColliderDef } from "../collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { MotionDef } from "../phys_motion.js";
import { RenderableDef, TransformDef } from "../renderer.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { AABBCollider } from "../collider.js";
import { Serializer, Deserializer } from "../serialize.js";
import { FinishedDef } from "../build.js";
import { Assets, AssetsDef } from "./assets.js";

export const PlaneConstructDef = EM.defineComponent(
  "planeConstruct",
  (location?: vec3, color?: vec3) => ({
    location: location ?? vec3.fromValues(0, 0, 0),
    color: color ?? vec3.fromValues(0, 0, 0),
  })
);

export type PlaneConstruct = Component<typeof PlaneConstructDef>;

function serializePlaneConstruct(
  planeConstruct: PlaneConstruct,
  buf: Serializer
) {
  buf.writeVec3(planeConstruct.location);
  buf.writeVec3(planeConstruct.color);
}

function deserializePlaneConstruct(
  planeConstruct: PlaneConstruct,
  buf: Deserializer
) {
  buf.readVec3(planeConstruct.location);
  buf.readVec3(planeConstruct.color);
}

EM.registerSerializerPair(
  PlaneConstructDef,
  serializePlaneConstruct,
  deserializePlaneConstruct
);

export function registerBuildPlanesSystem(em: EntityManager) {
  function buildPlanes(
    planes: { id: number; planeConstruct: PlaneConstruct }[],
    { me: { pid }, assets }: { me: Me; assets: Assets }
  ) {
    for (let plane of planes) {
      if (FinishedDef.isOn(plane)) continue;

      if (!MotionDef.isOn(plane)) {
        const motion = em.addComponent(plane.id, MotionDef);
        vec3.copy(motion.location, plane.planeConstruct.location);
      }
      if (!ColorDef.isOn(plane)) {
        const color = em.addComponent(plane.id, ColorDef);
        vec3.copy(color, plane.planeConstruct.color);
      }
      if (!TransformDef.isOn(plane)) em.addComponent(plane.id, TransformDef);
      if (!RenderableDef.isOn(plane)) {
        const renderable = em.addComponent(plane.id, RenderableDef);
        renderable.mesh = assets.meshes.plane;
      }
      if (!PhysicsStateDef.isOn(plane))
        em.addComponent(plane.id, PhysicsStateDef);
      if (!ColliderDef.isOn(plane)) {
        const collider = em.addComponent(plane.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = true;
        (collider as AABBCollider).aabb = assets.aabbs.plane;
      }
      if (!AuthorityDef.isOn(plane))
        em.addComponent(plane.id, AuthorityDef, pid);
      if (!SyncDef.isOn(plane)) {
        const sync = em.addComponent(plane.id, SyncDef);
        sync.fullComponents.push(PlaneConstructDef.id);
        sync.fullComponents.push(MotionDef.id);
      }
      em.addComponent(plane.id, FinishedDef);
    }
  }

  em.registerSystem([PlaneConstructDef], [MeDef, AssetsDef], buildPlanes);
}
