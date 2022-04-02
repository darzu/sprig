import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef, SHIP_AABBS } from "./assets.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColorDef } from "./game.js";
import { setCubePosScaleToAABB } from "../physics/phys-debug.js";

export const ShipConstructDef = EM.defineComponent(
  "shipConstruct",
  (loc?: vec3, rot?: quat) => {
    return {
      loc: loc ?? vec3.create(),
      rot: rot ?? quat.create(),
    };
  }
);
export type ShipConstruct = Component<typeof ShipConstructDef>;

function serializeShipConstruct(c: ShipConstruct, buf: Serializer) {
  buf.writeVec3(c.loc);
  buf.writeQuat(c.rot);
}

function deserializeShipConstruct(c: ShipConstruct, buf: Deserializer) {
  buf.readVec3(c.loc);
  buf.readQuat(c.rot);
}

EM.registerSerializerPair(
  ShipConstructDef,
  serializeShipConstruct,
  deserializeShipConstruct
);

export function registerBuildShipSystem(em: EntityManager) {
  em.registerSystem(
    [ShipConstructDef],
    [MeDef, AssetsDef],
    (ships, res) => {
      for (let e of ships) {
        // createShip(em, s, res.me.pid, res.assets);
        const pid = res.me.pid;
        const assets = res.assets;
        if (FinishedDef.isOn(e)) return;
        const props = e.shipConstruct;
        if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.loc);
        if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef, props.rot);
        if (!RenderableConstructDef.isOn(e))
          em.addComponent(e.id, RenderableConstructDef, assets.ship.mesh);
        if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
        if (!SyncDef.isOn(e)) {
          const sync = em.addComponent(e.id, SyncDef);
          sync.fullComponents.push(ShipConstructDef.id);
          // sync.dynamicComponents.push(PositionDef.id);
          sync.dynamicComponents.push(RotationDef.id);
        }
        em.addComponent(e.id, FinishedDef);

        // TODO(@darzu): multi collider
        const mc: MultiCollider = {
          shape: "Multi",
          solid: true,
          // TODO(@darzu): integrate these in the assets pipeline
          children: SHIP_AABBS.map((aabb) => ({
            shape: "AABB",
            solid: true,
            aabb,
          })),
        };
        em.ensureComponentOn(e, ColliderDef, mc);
      }
    },
    "buildShips"
  );
}
