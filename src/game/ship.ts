import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableDef } from "../renderer.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef, SHIP_AABBS } from "./assets.js";
import { ColliderDef } from "../physics/collider.js";
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

function createShip(
  em: EntityManager,
  e: Entity & { shipConstruct: ShipConstruct },
  pid: number,
  assets: Assets
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.shipConstruct;
  if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.loc);
  if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef, props.rot);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, assets.ship.mesh);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(ShipConstructDef.id);
    sync.dynamicComponents.push(PositionDef.id);
    sync.dynamicComponents.push(RotationDef.id);
  }
  em.addComponent(e.id, FinishedDef);

  // TODO(@darzu): handle AABB lists differently
  for (let aabb of SHIP_AABBS) {
    const b = em.newEntity();
    em.ensureComponentOn(b, PositionDef);
    em.ensureComponentOn(b, ScaleDef);
    em.ensureComponentOn(b, RenderableDef, assets.cube.proto);
    em.ensureComponentOn(b, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: copyAABB(createAABB(), aabb),
    });
    em.ensureComponentOn(b, ColorDef, [0.1, 0.2, 0.3]);

    setCubePosScaleToAABB(b, aabb);
  }
}

export function registerBuildShipSystem(em: EntityManager) {
  em.registerSystem(
    [ShipConstructDef],
    [MeDef, AssetsDef],
    (ships, res) => {
      for (let s of ships) createShip(em, s, res.me.pid, res.assets);
    },
    "buildShips"
  );
}
