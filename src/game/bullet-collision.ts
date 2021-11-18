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
import { BulletDef } from "./game.js";
import { AuthorityDef } from "../net/components.js";

export function registerBulletCollisionSystem(em: EntityManager) {
  // TODO(@darzu):
  em.registerSystem(
    [BulletDef, AuthorityDef],
    [PhysicsResultsDef, DetectedEventsDef],
    (bullets, resources) => {
      const { collidesWith } = resources.physicsResults;

      for (let o of bullets) {
        if (collidesWith.has(o.id)) {
          let otherIds = collidesWith.get(o.id)!;
          // find other bullets this bullet is colliding with. only want to find each collision once
          let otherBullets = otherIds.map(
            (id) => id > o.id && em.findEntity(id, [BulletDef])
          );
          for (let otherBullet of otherBullets) {
            if (otherBullet) {
              resources.detectedEvents.push({
                type: "bullet-bullet",
                entities: [o.id, otherBullet.id],
                location: null,
              });
            }
          }

          // find players this bullet is colliding with, other than the player who shot the bullet
          let otherPlayers = otherIds
            .map((id) => em.findEntity(id, [PlayerEntDef, AuthorityDef]))
            .filter((p) => p !== undefined);
          for (let otherPlayer of otherPlayers) {
            if (otherPlayer!.authority.pid !== o.authority.creatorPid)
              resources.detectedEvents.push({
                type: "bullet-player",
                entities: [otherPlayer!.id, o.id],
                location: null,
              });
          }
        }
      }
    }
  );
}

registerEventHandler("bullet-bullet", {
  // The authority entity is the one with the lowest id
  eventAuthorityEntity: (entities) => Math.min(...entities),
  // TODO: check to see if either bullet is deleted
  legalEvent: (em, entities) => true,
  runEvent: (em, entities) => {
    // TODO: delete bullets
  },
});

registerEventHandler("bullet-player", {
  // The authority entity is the one with the lowest id
  eventAuthorityEntity: (entities) => entities[0],
  // TODO: check to see if the bullet is deleted
  legalEvent: (em, entities) => true,
  runEvent: (em, entities) => {
    // TODO: delete bullet, adjust player health
  },
});
