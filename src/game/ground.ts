import { ColliderDef } from "../physics/collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { Serializer, Deserializer } from "../serialize.js";
import { FinishedDef } from "../build.js";
import { Assets, AssetsDef, DARK_BLUE, LIGHT_BLUE } from "./assets.js";
import {
  cloneMesh,
  getAABBFromMesh,
  scaleMesh,
  scaleMesh3,
} from "../render/mesh-pool.js";

const HALFSIZE = 16;
const SIZE = HALFSIZE * 2;

export const GroundConstructDef = EM.defineComponent(
  "groundConstruct",
  (location?: vec3, color?: vec3) => ({
    location: location ?? vec3.fromValues(0, 0, 0),
    color: color ?? vec3.fromValues(0, 0, 0),
  })
);

export type GroundConstruct = Component<typeof GroundConstructDef>;

export const GroundDef = EM.defineComponent("ground", () => {});

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

export const GroundSystemDef = EM.defineComponent("groundSystem", () => {
  return {
    groundPool: [] as number[],
  };
});

export function registerGroundSystems(em: EntityManager) {
  em.addSingletonComponent(GroundSystemDef);

  const NUM_X = 3;
  const NUM_Z = 4;
  em.registerSystem(
    [GroundDef],
    [GroundSystemDef],
    (grounds, { groundSystem }) => {
      if (groundSystem.groundPool.length === 0) {
        // init ground system
        for (let x = 0; x < NUM_X; x++) {
          for (let z = 0; z < NUM_Z; z++) {
            const loc = vec3.fromValues((x - 1) * SIZE, -7, z * SIZE);
            const color = (x + z) % 2 === 0 ? LIGHT_BLUE : DARK_BLUE;
            const g = em.newEntity();
            em.ensureComponentOn(g, GroundConstructDef, loc, color);
            groundSystem.groundPool.push(g.id);
          }
        }
      }

      // TODO(@darzu):
    },
    "groundSystem"
  );

  em.registerSystem(
    [GroundConstructDef],
    [MeDef, AssetsDef],
    (ground: { id: number; groundConstruct: GroundConstruct }[], res) => {
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
        let m = cloneMesh(res.assets.cube.mesh);
        m = scaleMesh3(m, [HALFSIZE, 1, HALFSIZE]);
        em.ensureComponent(g.id, RenderableConstructDef, m);
        const aabb = getAABBFromMesh(m);
        em.ensureComponent(g.id, ColliderDef, {
          shape: "AABB",
          solid: true,
          aabb,
        });
        em.ensureComponent(g.id, AuthorityDef, res.me.pid);
        em.ensureComponent(
          g.id,
          SyncDef,
          [GroundConstructDef.id],
          [PositionDef.id]
        );
        em.ensureComponentOn(g, GroundDef);

        em.ensureComponent(g.id, FinishedDef);
      }
    },
    "buildGround"
  );
}
