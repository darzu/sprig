import { DeletedDef } from "../delete.js";
import { EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { GameState, GameStateDef } from "./gamestate.js";
import { GroundSystemDef } from "./ground.js";
import { LifetimeDef } from "./lifetime.js";
import { CameraDef, PlayerEntDef } from "./player.js";
import { createShip, ShipLocalDef, ShipPartDef, ShipPropsDef } from "./ship.js";

export function registerRestartSystem(em: EntityManager) {
  em.registerSystem(
    null,
    [GameStateDef, CameraDef, GroundSystemDef],
    ([], res) => {
      if (res.gameState.state !== GameState.GAMEOVER) return;
      let ships = EM.filterEntities([ShipLocalDef, ShipPropsDef, PositionDef]);
      for (let ship of ships) {
        for (let partId of ship.shipLocal.partIds) {
          const part = em.findEntity(partId, [ShipPartDef]);
          if (part) em.ensureComponentOn(part, DeletedDef);
        }
        em.ensureComponentOn(ship, DeletedDef);
        if (ship.shipLocal.cannonLId)
          em.ensureComponent(ship.shipLocal.cannonLId, DeletedDef);
        if (ship.shipLocal.cannonRId)
          em.ensureComponent(ship.shipLocal.cannonRId, DeletedDef);

        const players = em.filterEntities([
          PlayerEntDef,
          PositionDef,
          RotationDef,
        ]);
        for (let p of players) {
          if (PhysicsParentDef.isOn(p)) p.physicsParent.id = 0;
          console.log("foo");
          vec3.copy(p.position, [0, 100, 0]);
          quat.rotateY(p.rotation, quat.IDENTITY, Math.PI);
          p.player.manning = false;
        }

        quat.identity(res.camera.rotation);
        res.camera.targetId = 0;
        const gem = em.findEntity(ship.shipProps.gemId, [
          WorldFrameDef,
          PositionDef,
          PhysicsParentDef,
        ])!;
        vec3.copy(gem.position, gem.world.position);
        em.ensureComponentOn(gem, RotationDef);
        quat.copy(gem.rotation, gem.world.rotation);
        em.ensureComponentOn(gem, LinearVelocityDef, [0, -0.01, 0]);
        em.removeComponent(gem.id, PhysicsParentDef);
        em.ensureComponentOn(gem, LifetimeDef, 4000);

        res.groundSystem.initialPlace = true;

        createShip();
      }
      res.gameState.state = GameState.LOBBY;
      // TODO: delete all enemy boats
    },
    "restartSystem"
  );
}
