import { ColliderDef } from "../physics/collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
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

EM.registerSerializerPair(
  PlaneConstructDef,
  (planeConstruct, buf) => {
    buf.writeVec3(planeConstruct.location);
    buf.writeVec3(planeConstruct.color);
  },
  (planeConstruct, buf) => {
    buf.readVec3(planeConstruct.location);
    buf.readVec3(planeConstruct.color);
  }
);

export function registerBuildPlanesSystem(em: EntityManager) {
  function buildPlanes(
    planes: { id: number; planeConstruct: PlaneConstruct }[],
    { me: { pid }, assets }: { me: Me; assets: Assets }
  ) {
    for (let plane of planes) {
      if (FinishedDef.isOn(plane)) continue;

      em.ensureComponent(plane.id, PositionDef, plane.planeConstruct.location);
      // TODO(@darzu): rotation for debugging
      // if (!RotationDef.isOn(plane)) {
      //   // const r =
      //   //   Math.random() > 0.5
      //   //     ? quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5)
      //   //     : quat.create();
      //   const r = quat.fromEuler(quat.create(), 0, 0, Math.PI * Math.random());
      //   em.ensureComponent(plane.id, RotationDef, r);
      // }
      em.ensureComponent(plane.id, ColorDef, plane.planeConstruct.color);
      em.ensureComponent(plane.id, RenderableConstructDef, assets.plane.proto);
      em.ensureComponent(plane.id, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: assets.plane.aabb,
      });
      em.ensureComponent(plane.id, AuthorityDef, pid);
      em.ensureComponent(
        plane.id,
        SyncDef,
        [PlaneConstructDef.id],
        [PositionDef.id]
      );
      em.ensureComponent(plane.id, FinishedDef);
    }
  }

  em.registerSystem([PlaneConstructDef], [MeDef, AssetsDef], buildPlanes);
}
