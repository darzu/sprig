import {
  registerEventHandler,
  DetectedEvent,
  DetectedEventsDef,
} from "../net/events.js";
import { EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { PhysicsResultsDef } from "../phys_esc.js";
import { MotionDef } from "../phys_motion.js";
import { ParentDef } from "../renderer.js";
import { vec3 } from "../gl-matrix.js";
import { InWorldDef } from "./game.js";

export function registerItemPickupSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef, MotionDef],
    [DetectedEventsDef],
    (players, resources) => {
      for (let player of players) {
        if (player.player.hat === 0 && player.player.interactingWith > 0) {
          console.log("detecting pickup");
          resources.detectedEvents.push({
            type: "pickup",
            entities: [player.id, player.player.interactingWith],
            location: null,
          });
        } else if (player.player.hat > 0 && player.player.dropping) {
          let dropLocation = vec3.fromValues(0, 0, -5);
          vec3.transformQuat(
            dropLocation,
            dropLocation,
            player.motion.rotation
          );
          vec3.add(dropLocation, dropLocation, player.motion.location);
          resources.detectedEvents.push({
            type: "drop",
            entities: [player.id, player.player.hat],
            location: dropLocation,
          });
        }
      }
    }
  );
}

registerEventHandler("pickup", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    let hat = em.findEntity(entities[1], [InWorldDef]);
    return (
      player !== undefined &&
      hat !== undefined &&
      player.player.hat === 0 &&
      hat.inWorld.is
    );
  },
  runEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [InWorldDef, MotionDef, ParentDef])!;
    hat.parent.id = player.id;
    hat.inWorld.is = false;
    vec3.set(hat.motion.location, 0, 1, 0);
    player.player.hat = hat.id;
  },
});

registerEventHandler("drop", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let player = em.findEntity(entities[0], [PlayerEntDef]);
    return player !== undefined && player.player.hat === entities[1];
  },
  runEvent: (em, entities, location) => {
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [InWorldDef, MotionDef, ParentDef])!;
    hat.parent.id = 0;
    hat.inWorld.is = true;
    vec3.copy(hat.motion.location, location!);
    player.player.hat = 0;
  },
});
