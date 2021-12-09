import { Component, EM, EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { MotionDef, Motion } from "../phys_motion.js";
import { vec3 } from "../gl-matrix.js";

export const InteractableDef = EM.defineComponent("interaction", () => true);
export const InteractingDef = EM.defineComponent(
  "interacting",
  (id?: number) => ({ id: id || 0 })
);

const INTERACTION_DISTANCE = 10;
const INTERACTION_ANGLE = Math.PI / 6;
// TODO: this function is very bad. It should probably use an oct-tree or something.
function getInteractionEntity(
  playerMotion: Motion,
  interactables: { motion: Motion; id: number }[]
): number {
  let bestDistance = INTERACTION_DISTANCE;
  let bestId = 0;

  for (let { motion, id } of interactables) {
    let to = vec3.sub(vec3.create(), motion.location, playerMotion.location);
    let distance = vec3.len(to);
    if (distance < bestDistance) {
      let direction = vec3.normalize(to, to);
      let playerDirection = vec3.fromValues(0, 0, -1);
      vec3.transformQuat(
        playerDirection,
        playerDirection,
        playerMotion.rotation
      );
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

export function registerInteractionSystem(em: EntityManager) {
  em.registerSystem([PlayerEntDef, MotionDef], [], (players) => {
    let interactables = EM.filterEntities([InteractableDef, MotionDef]);
    let interactingPlayers = players.filter(({ player }) => player.interacting);
    for (let player of interactingPlayers) {
      let interactionId = getInteractionEntity(player.motion, interactables);
      if (interactionId > 0) {
        let interacting = em.ensureComponent(interactionId, InteractingDef);
        interacting.id = player.id;
      }
    }
  });
}
