import { Component, EM, EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
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
    colliderId,
    inRange: false,
  })
);
export const InteractingDef = EM.defineComponent(
  "interacting",
  (id?: number) => ({ id: id || 0 })
);

const INTERACTION_TINT = vec3.fromValues(0.1, 0.2, 0.1);

export function registerInteractionSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, AuthorityDef, WorldFrameDef],
    [MeDef, PhysicsResultsDef],
    (players, resources) => {
      let interactables = em.filterEntities([InteractableDef, WorldFrameDef]);
      for (let interactable of interactables) {
        if (interactable.interaction.inRange && ColorDef.isOn(interactable)) {
          vec3.subtract(
            interactable.color,
            interactable.color,
            INTERACTION_TINT
          );
          interactable.interaction.inRange = false;
        }
      }
      for (let player of players) {
        if (player.authority.pid !== resources.me.pid) continue;
        // check if any interactables are overlapping
        let interactionId = 0;
        for (let i of interactables) {
          const hits =
            resources.physicsResults.collidesWith.get(
              i.interaction.colliderId
            ) ?? [];
          for (let h of hits) {
            if (h === player.id) interactionId = i.id;
          }
        }
        if (interactionId > 0) {
          if (player.player.interacting) {
            em.ensureComponent(interactionId, InteractingDef, player.id);
          } else {
            let interactable = em.findEntity(interactionId, [
              InteractableDef,
              ColorDef,
            ]);
            if (interactable) {
              vec3.add(
                interactable.color,
                interactable.color,
                INTERACTION_TINT
              );
              interactable.interaction.inRange = true;
            }
          }
        }
      }
    },
    "interaction"
  );
}
