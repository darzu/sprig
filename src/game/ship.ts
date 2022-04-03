import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef, SHIP_AABBS } from "./assets.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { ColorDef } from "./game.js";
import { setCubePosScaleToAABB } from "../physics/phys-debug.js";
import { BOAT_COLOR } from "./boat.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { min } from "../math.js";

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

export const ShipDef = EM.defineComponent("ship", () => {
  return {
    partIds: [] as number[],
  };
});

export const ShipPartDef = EM.defineComponent("shipPart", () => {});

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

export function registerShipSystems(em: EntityManager) {
  em.registerSystem(
    [ShipConstructDef],
    [MeDef, AssetsDef],
    (ships, res) => {
      for (let e of ships) {
        // createShip(em, s, res.me.pid, res.assets);
        const pid = res.me.pid;
        if (FinishedDef.isOn(e)) return;
        const props = e.shipConstruct;
        if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.loc);
        if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef, props.rot);
        if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, BOAT_COLOR);
        // if (!RenderableConstructDef.isOn(e))
        //   em.addComponent(e.id, RenderableConstructDef, assets.ship.mesh);
        em.ensureComponentOn(e, ShipDef);

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

        const boatFloor = min(
          mc.children.map((c) => (c as AABBCollider).aabb.max[1])
        );
        for (let m of res.assets.ship_broken) {
          const part = em.newEntity();
          em.ensureComponentOn(part, PhysicsParentDef, e.id);
          em.ensureComponentOn(part, RenderableConstructDef, m.proto);
          em.ensureComponentOn(part, ColorDef, vec3.clone(BOAT_COLOR));
          em.ensureComponentOn(part, PositionDef, [0, 0, 0]);
          em.ensureComponentOn(part, ShipPartDef);
          em.ensureComponentOn(part, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: m.aabb,
          });
          (part.collider as AABBCollider).aabb.max[1] = boatFloor;
          e.ship.partIds.push(part.id);
        }
        if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
        if (!SyncDef.isOn(e)) {
          const sync = em.addComponent(e.id, SyncDef);
          sync.fullComponents.push(ShipConstructDef.id);
          // sync.dynamicComponents.push(PositionDef.id);
          sync.dynamicComponents.push(RotationDef.id);
        }
        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildShips"
  );

  em.registerSystem(
    [ShipDef],
    [PhysicsResultsDef],
    (ships, res) => {
      for (let s of ships) {
        for (let partId of s.ship.partIds) {
          const part = em.findEntity(partId, [ColorDef, RenderableDef]);
          if (part) {
            if (!part.renderable.enabled) continue;
            const bullets = res.physicsResults.collidesWith
              .get(partId)
              ?.map((h) => em.findEntity(h, [BulletDef]))
              .filter((h) => h && h.bullet.team === 2);
            if (bullets && bullets.length) {
              for (let b of bullets)
                if (b) em.ensureComponent(b.id, DeletedDef);
              // part.color[0] += 0.1;
              part.renderable.enabled = false;
            }
          }
        }
      }
    },
    "shipBreakParts"
  );
}
