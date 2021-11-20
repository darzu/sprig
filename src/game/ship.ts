import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { _GAME_ASSETS } from "../main.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { MotionDef } from "../phys_motion.js";
import { RenderableDef, TransformDef } from "../renderer.js";
import { ColorDef } from "./game.js";

export const ShipConstructorDef = EM.defineComponent(
  "shipConstruct",
  (loc?: vec3, rot?: quat) => {
    return {
      loc: loc ?? vec3.create(),
      rot: rot ?? quat.create(),
    };
  }
);
export type ShipConstructor = Component<typeof ShipConstructorDef>;

function createShip(
  em: EntityManager,
  e: Entity & { shipConstruct: ShipConstructor },
  pid: number
) {
  if (FinishedDef.isOn(e)) return;
  const props = e.shipConstruct;
  if (!MotionDef.isOn(e))
    em.addComponent(e.id, MotionDef, props.loc, props.rot);
  if (!TransformDef.isOn(e)) em.addComponent(e.id, TransformDef);
  if (!RenderableDef.isOn(e))
    em.addComponent(e.id, RenderableDef, _GAME_ASSETS?.ship!);
  if (!PhysicsStateDef.isOn(e)) em.addComponent(e.id, PhysicsStateDef);
  if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid, pid);
  if (!SyncDef.isOn(e)) {
    const sync = em.addComponent(e.id, SyncDef);
    sync.fullComponents.push(ShipConstructorDef.id);
    sync.dynamicComponents.push(MotionDef.id);
  }
  em.addComponent(e.id, FinishedDef);
}

export function registerBuildShipSystem(em: EntityManager) {
  em.registerSystem([ShipConstructorDef], [MeDef], (ships, res) => {
    for (let s of ships) createShip(em, s, res.me.pid);
  });
}
