import { Component, EM } from "../ecs/entity-manager.js";
import { WoodHealthDef } from "../wood/wood.js";
import { Phase } from "../ecs/sys-phase.js";

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

EM.addSystem(
  "updateShipHealth",
  Phase.GAME_WORLD,
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
  }
);
