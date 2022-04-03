import { FinishedDef } from "../build.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { Deserializer, Serializer } from "../serialize.js";
import { Assets, AssetsDef, SHIP_AABBS } from "./assets.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { ColorDef, TextDef } from "./game.js";
import { setCubePosScaleToAABB } from "../physics/phys-debug.js";
import { BOAT_COLOR } from "./boat.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { max, min } from "../math.js";
import { assert } from "../test.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { LifetimeDef } from "./lifetime.js";
import { CannonConstructDef } from "./cannon.js";
import { MusicDef } from "../music.js";

export const ShipConstructDef = EM.defineComponent(
  "shipConstruct",
  (loc?: vec3, rot?: quat) => {
    return {
      loc: loc ?? vec3.create(),
      rot: rot ?? quat.create(),
    };
  }
);
export type ShipConstruct = Component<typeof ShipConstructDef>;

export const ShipDef = EM.defineComponent("ship", () => {
  return {
    partIds: [] as number[],
    gemId: 0,
    speed: 0,
  };
});

export const ShipPartDef = EM.defineComponent(
  "shipPart",
  (critical: boolean) => ({
    critical,
    damaged: false,
  })
);

function serializeShipConstruct(c: ShipConstruct, buf: Serializer) {
  buf.writeVec3(c.loc);
  buf.writeQuat(c.rot);
}

function deserializeShipConstruct(c: ShipConstruct, buf: Deserializer) {
  buf.readVec3(c.loc);
  buf.readQuat(c.rot);
}

EM.registerSerializerPair(
  ShipConstructDef,
  serializeShipConstruct,
  deserializeShipConstruct
);

export const GemDef = EM.defineComponent("gem", () => {
  // TODO(@darzu):
});

const criticalPartIdxes = [0, 3, 5, 6];

export function registerShipSystems(em: EntityManager) {
  em.registerSystem(
    [ShipConstructDef],
    [MeDef, AssetsDef],
    (ships, res) => {
      for (let e of ships) {
        // createShip(em, s, res.me.pid, res.assets);
        const pid = res.me.pid;
        if (FinishedDef.isOn(e)) return;
        const props = e.shipConstruct;
        if (!PositionDef.isOn(e)) em.addComponent(e.id, PositionDef, props.loc);
        if (!RotationDef.isOn(e)) em.addComponent(e.id, RotationDef, props.rot);
        // if (!ColorDef.isOn(e)) em.addComponent(e.id, ColorDef, [0.2, 0.1, 0.1]);
        // if (!RenderableConstructDef.isOn(e))
        //   em.addComponent(e.id, RenderableConstructDef, res.assets.ship.mesh);
        em.ensureComponentOn(e, ShipDef);
        e.ship.speed = 0.005;

        // TODO(@darzu): multi collider
        const mc: MultiCollider = {
          shape: "Multi",
          solid: true,
          // TODO(@darzu): integrate these in the assets pipeline
          children: SHIP_AABBS.map((aabb) => ({
            shape: "AABB",
            solid: true,
            aabb,
          })),
        };
        em.ensureComponentOn(e, ColliderDef, mc);

        const boatFloor = min(
          mc.children.map((c) => (c as AABBCollider).aabb.max[1])
        );
        for (let i = 0; i < res.assets.ship_broken.length; i++) {
          const m = res.assets.ship_broken[i];
          const part = em.newEntity();
          em.ensureComponentOn(part, PhysicsParentDef, e.id);
          em.ensureComponentOn(part, RenderableConstructDef, m.proto);
          em.ensureComponentOn(part, ColorDef, vec3.clone(BOAT_COLOR));
          em.ensureComponentOn(part, PositionDef, [0, 0, 0]);
          const isCritical = criticalPartIdxes.includes(i);
          em.ensureComponentOn(part, ShipPartDef, isCritical);
          em.ensureComponentOn(part, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: m.aabb,
          });
          (part.collider as AABBCollider).aabb.max[1] = boatFloor;
          e.ship.partIds.push(part.id);
        }
        if (!AuthorityDef.isOn(e)) em.addComponent(e.id, AuthorityDef, pid);
        if (!SyncDef.isOn(e)) {
          const sync = em.addComponent(e.id, SyncDef);
          sync.fullComponents.push(ShipConstructDef.id);
          // sync.dynamicComponents.push(PositionDef.id);
          sync.dynamicComponents.push(RotationDef.id);
        }

        // TODO(@darzu): ship movement
        em.ensureComponentOn(e, LinearVelocityDef, [0, -0.01, 0]);

        // create gem
        const gem = em.newEntity();
        em.ensureComponentOn(
          gem,
          RenderableConstructDef,
          res.assets.spacerock.proto
        );
        em.ensureComponentOn(gem, PositionDef, [0, 0, -1]);
        em.ensureComponentOn(gem, PhysicsParentDef, e.id);
        em.ensureComponentOn(gem, GemDef);
        e.ship.gemId = gem.id;

        // create cannons

        const cannonPitch = Math.PI * -0.05;

        const cannonR = em.newEntity();
        const cTurnRight = quat.create();
        quat.rotateZ(cTurnRight, cTurnRight, cannonPitch);
        em.ensureComponentOn(cannonR, PhysicsParentDef, e.id);
        em.addComponent(cannonR.id, CannonConstructDef, [-6, 3, 5], cTurnRight);
        const cannonL = em.newEntity();
        const cTurnLeft = quat.create();
        quat.rotateY(cTurnLeft, cTurnLeft, Math.PI);
        quat.rotateZ(cTurnLeft, cTurnLeft, cannonPitch);
        em.ensureComponentOn(cannonL, PhysicsParentDef, e.id);
        em.addComponent(cannonL.id, CannonConstructDef, [6, 3, 5], cTurnLeft);

        // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
        // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);

        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildShips"
  );

  em.registerSystem(
    [ShipDef, PositionDef],
    [MusicDef],
    (ships, res) => {
      const numCritical = criticalPartIdxes.length;
      for (let ship of ships) {
        let numCriticalDamaged = 0;
        for (let partId of ship.ship.partIds) {
          const part = em.findEntity(partId, [ShipPartDef]);
          if (part && part.shipPart.critical && part.shipPart.damaged) {
            numCriticalDamaged += 1;
          }
        }
        if (numCriticalDamaged === numCritical) {
          const gem = em.findEntity(ship.ship.gemId, [
            WorldFrameDef,
            PositionDef,
            PhysicsParentDef,
          ]);
          if (gem) {
            // ship broken!
            // TODO(@darzu): RUN OVER
            const score = Math.round(ship.position[2] / 10);
            setTimeout(() => {
              // TODO(@darzu): game over music
              res.music.playChords([1, 2, 3, 4, 4], "minor");
              alert(`Game over (distance: ${score})`);
            }, 2000);
            vec3.copy(gem.position, gem.world.position);
            em.ensureComponentOn(gem, RotationDef);
            quat.copy(gem.rotation, gem.world.rotation);
            em.ensureComponentOn(gem, LinearVelocityDef, [0, -0.01, 0]);
            em.removeComponent(gem.id, PhysicsParentDef);
            em.ensureComponentOn(gem, LifetimeDef, 4000);
          }
        }
      }
    },
    "shipDead"
  );

  em.registerSystem(
    [ShipDef, LinearVelocityDef],
    [],
    (ships, res) => {
      for (let s of ships) {
        s.linearVelocity[2] = s.ship.speed;
        s.linearVelocity[1] = -0.01;
      }
    },
    "shipMove"
  );

  em.registerSystem(
    [ShipDef, PositionDef],
    [TextDef],
    (ships, res) => {
      const score = max(ships.map((s) => s.position[2]));

      // update score
      const roundScore = Math.round(score / 10);
      res.text.setText(`${roundScore}`);
    },
    "shipUI"
  );

  em.registerSystem(
    [ShipDef],
    [PhysicsResultsDef, MusicDef],
    (ships, res) => {
      for (let s of ships) {
        for (let partId of s.ship.partIds) {
          const part = em.findEntity(partId, [
            ShipPartDef,
            ColorDef,
            RenderableDef,
          ]);
          if (part) {
            if (!part.renderable.enabled) continue;
            const bullets = res.physicsResults.collidesWith
              .get(partId)
              ?.map((h) => em.findEntity(h, [BulletDef]))
              .filter((h) => h && h.bullet.team === 2);
            if (bullets && bullets.length) {
              for (let b of bullets)
                if (b) em.ensureComponent(b.id, DeletedDef);
              // part.color[0] += 0.1;
              part.renderable.enabled = false;
              part.shipPart.damaged = true;

              res.music.playChords([2, 3], "minor", 0.2, 5.0, -2);
            }
          }
        }
      }
    },
    "shipBreakParts"
  );
}
