import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { MotionDef } from "../phys_motion.js";
import { RenderableDef, TransformDef } from "../renderer.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef } from "./assets.js";
import { ColorDef } from "./game.js";

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
  if (!MotionDef.isOn(e))
    em.addComponent(e.id, MotionDef, props.loc, props.rot);
  if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, assets.ship.mesh);
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(ShipConstructDef.id);
    sync.dynamicComponents.push(MotionDef.id);
  }
  em.addComponent(e.id, FinishedDef);
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
