import { Component, EM, EntityManager } from "../entity-manager.js";
import { LocalPlayerDef, PlayerEntDef } from "./player.js";
import { vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColorDef } from "./game.js";
import {
  Position,
  PositionDef,
  Rotation,
  RotationDef,
} from "../physics/transform.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";

export const InteractableDef = EM.defineComponent(
  "interaction",
  (colliderId: number) => ({
    // TODO(@darzu): components having pointers to entities should be
    //  handled better
    colliderId,
  })
);

export const InRangeDef = EM.defineComponent("inRange", () => true);

const INTERACTION_TINT = vec3.fromValues(0.1, 0.2, 0.1);

export function registerInteractionSystem(em: EntityManager) {
  em.registerSystem(
    [InteractableDef, WorldFrameDef],
    [LocalPlayerDef, MeDef, PhysicsResultsDef],
    (interactables, resources) => {
      const player = em.findEntity(resources.localPlayer.playerId, [
        PlayerEntDef,
      ]);
      if (!player) return;

      const interactablesMap = interactables.reduce((map, i) => {
        map.set(i.interaction.colliderId, i);
        return map;
      }, new Map());
      for (let interactable of interactables) {
        if (InRangeDef.isOn(interactable)) {
          if (ColorDef.isOn(interactable))
            vec3.subtract(
              interactable.color,
              interactable.color,
              INTERACTION_TINT
            );
          em.removeComponent(interactable.id, InRangeDef);
        }
      }
      // find an interactable within range of the player
      const interactableColliderId = (
        resources.physicsResults.collidesWith.get(player.id) ?? []
      ).find((id) => interactablesMap.has(id));
      if (interactableColliderId) {
        const interactable = interactablesMap.get(interactableColliderId)!;
        em.ensureComponentOn(interactable, InRangeDef);
        if (ColorDef.isOn(interactable)) {
          vec3.add(interactable.color, interactable.color, INTERACTION_TINT);
        }
      }
    },
    "interaction"
  );
}
