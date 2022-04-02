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
import {
  cloneMesh,
  getAABBFromMesh,
  scaleMesh,
  scaleMesh3,
} from "../render/mesh-pool.js";

const SIZE = 40;

export const GroundConstructDef = EM.defineComponent(
  "groundConstruct",
  (location?: vec3, color?: vec3) => ({
    location: location ?? vec3.fromValues(0, 0, 0),
    color: color ?? vec3.fromValues(0, 0, 0),
  })
);

export type GroundConstruct = Component<typeof GroundConstructDef>;

EM.registerSerializerPair(
  GroundConstructDef,
  (groundConstruct, buf) => {
    buf.writeVec3(groundConstruct.location);
    buf.writeVec3(groundConstruct.color);
  },
  (groundConstruct, buf) => {
    buf.readVec3(groundConstruct.location);
    buf.readVec3(groundConstruct.color);
  }
);

export function registerBuildGroundSystem(em: EntityManager) {
  function buildGround(
    ground: { id: number; groundConstruct: GroundConstruct }[],
    { me: { pid }, assets }: { me: Me; assets: Assets }
  ) {
    for (let g of ground) {
      if (FinishedDef.isOn(g)) continue;

      em.ensureComponent(g.id, PositionDef, g.groundConstruct.location);
      // TODO(@darzu): rotation for debugging
      // if (!RotationDef.isOn(plane)) {
      //   // const r =
      //   //   Math.random() > 0.5
      //   //     ? quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5)
      //   //     : quat.create();
      //   const r = quat.fromEuler(quat.create(), 0, 0, Math.PI * Math.random());
      //   em.ensureComponent(plane.id, RotationDef, r);
      // }
      em.ensureComponent(g.id, ColorDef, g.groundConstruct.color);
      let m = cloneMesh(assets.cube.mesh);
      m = scaleMesh3(m, [SIZE, 1, SIZE]);
      em.ensureComponent(g.id, RenderableConstructDef, m);
      const aabb = getAABBFromMesh(m);
      em.ensureComponent(g.id, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb,
      });
      em.ensureComponent(g.id, AuthorityDef, pid);
      em.ensureComponent(
        g.id,
        SyncDef,
        [GroundConstructDef.id],
        [PositionDef.id]
      );
      em.ensureComponent(g.id, FinishedDef);
    }
  }

  em.registerSystem([GroundConstructDef], [MeDef, AssetsDef], buildGround);
}
