import {
  registerEventHandler,
  DetectedEvent,
  DetectedEventsDef,
} from "../net/events.js";
import { EntityManager } from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { AuthorityDef } from "../net/components.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";

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
                extra: null,
              });
            }
          }

          // find players this bullet is colliding with, other than the player who shot the bullet
          let otherPlayers = otherIds
            .map((id) => em.findEntity(id, [PlayerEntDef, AuthorityDef]))
            .filter((p) => p !== undefined);
          for (let otherPlayer of otherPlayers) {
            if (otherPlayer!.authority.pid !== o.authority.pid)
              resources.detectedEvents.push({
                type: "bullet-player",
                entities: [otherPlayer!.id, o.id],
                extra: null,
              });
          }
        }
      }
    },
    "bulletCollision"
  );
}

registerEventHandler("bullet-bullet", {
  // The authority entity is the one with the lowest id
  eventAuthorityEntity: (entities) => Math.min(...entities),
  legalEvent: (em, entities) => {
    // all entities are valid bullets
    return entities.every((id) => em.findEntity(id, [BulletDef]));
  },
  runEvent: (em, entities) => {
    for (let id of entities) {
      // This bullet might have already been deleted via the sync system
      em.ensureComponent(id, DeletedDef);
    }
  },
});

registerEventHandler("bullet-player", {
  // The authority entity is the bullet
  eventAuthorityEntity: (entities) => entities[1],
  legalEvent: (em, entities) => {
    return em.findEntity(entities[1], [BulletDef]) !== undefined;
  },
  runEvent: (em, entities) => {
    em.ensureComponent(entities[1], DeletedDef);
  },
});
