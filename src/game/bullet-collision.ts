import {
  registerEventHandler,
  DetectedEvent,
  DetectedEventsDef,
  eventWizard,
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
              raiseBulletBullet(o, otherBullet);
            }
          }

          // find players this bullet is colliding with, other than the player who shot the bullet
          let otherPlayers = otherIds
            .map((id) => em.findEntity(id, [PlayerEntDef, AuthorityDef]))
            .filter((p) => p !== undefined);
          for (let otherPlayer of otherPlayers) {
            if (otherPlayer!.authority.pid !== o.authority.pid)
              raiseBulletPlayer(o, otherPlayer!);
          }
        }
      }
    },
    "bulletCollision"
  );
}

export const raiseBulletBullet = eventWizard(
  "bullet-bullet",
  [[BulletDef], [BulletDef]] as const,
  ([b1, b2]) => {
    // This bullet might have already been deleted via the sync system
    EM.ensureComponentOn(b1, DeletedDef);
    EM.ensureComponentOn(b2, DeletedDef);
  },
  {
    // The authority entity is the one with the lowest id
    eventAuthorityEntity: (entities) => Math.min(...entities),
  }
);

export const raiseBulletPlayer = eventWizard(
  "bullet-player",
  () => [[BulletDef], [PlayerEntDef]] as const,
  ([bullet, player]) => {
    EM.ensureComponent(bullet.id, DeletedDef);
  }
);

export const raiseBulletBoat = eventWizard(
  "bullet-boat",
  () => [[BulletDef], [BoatLocalDef, PositionDef, RotationDef]] as const,
  ([bullet, boat]) => {
    EM.ensureComponentOn(bullet, DeletedDef);
    const res = EM.getResources([AssetsDef, MusicDef])!;
    breakBoat(EM, boat, res.assets.boat_broken, res.music);
  }
);
