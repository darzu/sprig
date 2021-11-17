import {
  registerEventHandler,
  DetectedEvent,
  DetectedEventsDef,
} from "../net/events.js";
import { EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { PhysicsResultsDef } from "../phys_esc.js";
import { MotionDef } from "../phys_motion.js";
import { InWorldDef } from "../state.js";
import { ParentDef } from "../renderer.js";
import { vec3 } from "../gl-matrix.js";

export function registerItemPickupSystem(em: EntityManager) {
  em.registerSystem(
    [PlayerEntDef],
    [PhysicsResultsDef, DetectedEventsDef],
    (players, resources) => {
      const { collidesWith } = resources.physicsResults;
      for (let player of players) {
        if (player.player.hat === 0 && player.player.interactingWith > 0) {
          resources.detectedEvents.push({
            type: "pickup",
            entities: [player.id, player.player.interactingWith],
            location: null,
          });
        }
      }
      // TODO(@darzu): handle hat pickup
      // // check collisions
      // for (let o of this.liveObjects()) {
      //   if (o instanceof Bullet) {
      //   }
      //   if (o instanceof PlayerClass) {
      //     if (o.hat === 0 && o.interactingWith > 0) {
      //       this.recordEvent(EventType.HatGet, [o.id, o.interactingWith]);
      //     }
      //     if (o.hat > 0 && o.dropping) {
      //       let dropLocation = vec3.fromValues(0, 0, -5);
      //       vec3.transformQuat(dropLocation, dropLocation, o.motion.rotation);
      //       vec3.add(dropLocation, dropLocation, o.motion.location);
      //       this.recordEvent(EventType.HatDrop, [o.id, o.hat], dropLocation);
      //     }
      //   }
      // }
    }
  );
}

registerEventHandler("pickup", {
  eventAuthorityEntity: (entities) => entities[0],
  legalEvent: (em, entities) => {
    let { player } = em.findEntity(entities[0], [PlayerEntDef])!;
    let { inWorld } = em.findEntity(entities[1], [InWorldDef])!;
    return player.hat === 0 && inWorld.is;
  },
  runEvent: (em, entities) => {
    console.log("running pickup");
    let player = em.findEntity(entities[0], [PlayerEntDef])!;
    let hat = em.findEntity(entities[1], [InWorldDef, MotionDef, ParentDef])!;
    hat.parent.id = player.id;
    hat.inWorld.is = false;
    vec3.set(hat.motion.location, 0, 1, 0);
    player.player.hat = hat.id;
  },
});
