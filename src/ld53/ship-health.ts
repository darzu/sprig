import { AssetsDef } from "../assets.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../delete.js";
import { createRef, Ref } from "../em_helpers.js";
import { Component, EM, Entity, EntityW } from "../entity-manager.js";
import { createEntityPool } from "../entity-pool.js";
import { fireBullet } from "../cannons/bullet.js";
import { PartyDef } from "../games/party.js";
import { jitter } from "../math.js";
import {
  AABB,
  createAABB,
  doesOverlapAABB,
  mergeAABBs,
  pointInAABB,
  updateAABBWithPoint,
} from "../physics/aabb.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { TextureReader } from "../render/cpu-texture.js";
import { Mesh } from "../render/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { LevelMapDef } from "../smol/level-map.js";
import { ShipDef } from "../smol/ship.js";
import { mat4, tV, V, vec3, quat, vec2 } from "../sprig-matrix.js";
import { TimeDef } from "../time.js";
import { assert } from "../util.js";
import { vec3Dbg } from "../utils-3d.js";
import { WoodHealthDef } from "../wood.js";

const MIN_HEALTH_PERCENT = 0.7;

export const ShipHealthDef = EM.defineComponent("shipHealth", () => ({
  needsUpdate: false,
  health: 1,
  startingTimberHealth: 0,
}));

function getCurrentHealth(timberHealth: Component<typeof WoodHealthDef>) {
  let health = 0;
  for (let b of timberHealth.boards) {
    for (let s of b) {
      health += s.health;
    }
  }
  return health;
}

EM.registerSystem(
  [ShipHealthDef, WoodHealthDef],
  [],
  (es, res) => {
    for (let ship of es) {
      const timberHealth = getCurrentHealth(ship.woodHealth);
      if (!ship.shipHealth.startingTimberHealth) {
        ship.shipHealth.startingTimberHealth = timberHealth;
      }
      const healthPercent = timberHealth / ship.shipHealth.startingTimberHealth;
      ship.shipHealth.health =
        (healthPercent - MIN_HEALTH_PERCENT) / (1 - MIN_HEALTH_PERCENT);
    }
  },
  "updateShipHealth"
);
