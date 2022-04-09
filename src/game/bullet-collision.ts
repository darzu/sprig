import {
  registerEventHandler,
  DetectedEvent,
  DetectedEventsDef,
} from "../net/events.js";
import {
  ComponentDef,
  EDef,
  EM,
  Entity,
  EntityManager,
  ESet,
} from "../entity-manager.js";
import { PlayerEntDef } from "./player.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { AuthorityDef } from "../net/components.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { BoatLocalDef, BoatPropsDef, breakBoat } from "./boat.js";
import { AssetsDef } from "./assets.js";
import { MusicDef } from "../music.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { NumberTuple } from "../util.js";

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
              resources.detectedEvents.raise({
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
              resources.detectedEvents.raise({
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
  entities: [[BulletDef], [BulletDef]] as const,
  // The authority entity is the one with the lowest id
  eventAuthorityEntity: (entities) => Math.min(...entities),
  legalEvent: (em, [b1, b2]) => true,
  runEvent: (em: EntityManager, [b1, b2]) => {
    // This bullet might have already been deleted via the sync system
    em.ensureComponentOn(b1, DeletedDef);
    em.ensureComponentOn(b2, DeletedDef);
  },
});

registerEventHandler("bullet-player", {
  entities: [[PlayerEntDef], [BulletDef]] as const,
  // The authority entity is the bullet
  eventAuthorityEntity: (entities) => entities[1],
  legalEvent: (em, [player, bullet]) => true,
  runEvent: (em, [player, bullet]) => {
    em.ensureComponent(bullet.id, DeletedDef);
  },
});

registerEventHandler("bullet-boat", {
  entities: [[BoatLocalDef, PositionDef, RotationDef], [BulletDef]] as const,
  eventAuthorityEntity: ([boatId, bulletId]) => {
    return bulletId;
  },
  legalEvent: (em, [boat, bullet]) => {
    return true;
  },
  runEvent: (em: EntityManager, [boat, bullet]) => {
    em.ensureComponentOn(bullet, DeletedDef);
    const res = em.getResources([AssetsDef, MusicDef])!;
    breakBoat(em, boat, res.assets.boat_broken, res.music);
  },
});

registerEventHandler("break-boat", {
  entities: [[BoatLocalDef, PositionDef, RotationDef]] as const,
  eventAuthorityEntity: ([boatId]) => boatId,
  legalEvent: (em, [boat]) => true,
  runEvent: (em: EntityManager, [boat]) => {
    const res = em.getResources([AssetsDef, MusicDef])!;
    breakBoat(em, boat, res.assets.boat_broken, res.music);
  },
});
