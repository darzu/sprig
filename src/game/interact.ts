import { Component, EM, EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColorDef } from "./game.js";
import { Position, PositionDef, Rotation, RotationDef } from "../transform.js";

export const InteractableDef = EM.defineComponent("interaction", () => ({
  inRange: false,
}));
export const InteractingDef = EM.defineComponent(
  "interacting",
  (id?: number) => ({ id: id || 0 })
);

const INTERACTION_DISTANCE = 10;
const INTERACTION_ANGLE = Math.PI / 6;
// TODO: this function is very bad. It should probably use an oct-tree or something.
function getInteractionEntity(
  playerPosition: Position,
  playerRotation: Rotation,
  interactables: { position: Position; id: number }[]
): number {
  let bestDistance = INTERACTION_DISTANCE;
  let bestId = 0;

  for (let { position, id } of interactables) {
    let to = vec3.sub(vec3.create(), position, playerPosition);
    let distance = vec3.len(to);
    if (distance < bestDistance) {
      let direction = vec3.normalize(to, to);
      let playerDirection = vec3.fromValues(0, 0, -1);
      vec3.transformQuat(playerDirection, playerDirection, playerRotation);
      if (
        Math.abs(vec3.angle(direction, playerDirection)) < INTERACTION_ANGLE
      ) {
        bestDistance = distance;
        bestId = id;
      }
    }
  }
  return bestId;
}

const INTERACTION_TINT = vec3.fromValues(0.1, 0.2, 0.1);

export function registerInteractionSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, AuthorityDef, PositionDef, RotationDef],
    [MeDef],
    (players, resources) => {
      let interactables = em.filterEntities([InteractableDef, PositionDef]);
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
        let interactionId = getInteractionEntity(
          player.position,
          player.rotation,
          interactables
        );
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
