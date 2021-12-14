import { ColliderDef } from "../collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { RenderableDef } from "../renderer.js";
import { PositionDef, TransformWorldDef } from "../transform.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
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

      if (!PositionDef.isOn(plane))
        em.addComponent(plane.id, PositionDef, plane.planeConstruct.location);
      if (!ColorDef.isOn(plane))
        em.addComponent(plane.id, ColorDef, plane.planeConstruct.color);
      if (!TransformWorldDef.isOn(plane))
        em.addComponent(plane.id, TransformWorldDef);
      if (!RenderableDef.isOn(plane))
        em.addComponent(plane.id, RenderableDef, assets.plane.proto);
      if (!ColliderDef.isOn(plane))
        em.addComponent(plane.id, ColliderDef, {
          shape: "AABB",
          solid: true,
          aabb: assets.plane.aabb,
        });
      if (!AuthorityDef.isOn(plane))
        em.addComponent(plane.id, AuthorityDef, pid);
      if (!SyncDef.isOn(plane)) {
        em.addComponent(
          plane.id,
          SyncDef,
          [PlaneConstructDef.id],
          [PositionDef.id]
        );
      }
      em.addComponent(plane.id, FinishedDef);
    }
  }

  em.registerSystem([PlaneConstructDef], [MeDef, AssetsDef], buildPlanes);
}
