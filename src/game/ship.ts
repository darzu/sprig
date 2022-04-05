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
import { ColorDef, createNewShip, ScoreDef, TextDef } from "./game.js";
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
import { CameraDef, PlayerEntDef } from "./player.js";
import { InputsDef } from "../inputs.js";
import { GroundSystemDef } from "./ground.js";
import { InteractableDef } from "./interact.js";
import { GameState, GameStateDef } from "./gamestate.js";

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
    cannonLId: 0,
    cannonRId: 0,
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
  true;
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
        // e.ship.speed = 0.05;

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
        em.ensureComponentOn(gem, ColorDef);
        // create seperate hitbox for interacting with the gem
        const interactBox = em.newEntity();
        const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
        // interactAABB.max[0] += 1;
        vec3.scale(interactAABB.min, interactAABB.min, 2);
        vec3.scale(interactAABB.max, interactAABB.max, 2);
        em.ensureComponentOn(interactBox, PhysicsParentDef, gem.id);
        em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
        em.ensureComponentOn(interactBox, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: interactAABB,
        });

        em.ensureComponentOn(gem, InteractableDef, interactBox.id);

        e.ship.gemId = gem.id;

        // create cannons

        const cannonPitch = Math.PI * -0.05;

        const cannonR = em.newEntity();
        em.ensureComponentOn(cannonR, PhysicsParentDef, e.id);
        em.addComponent(
          cannonR.id,
          CannonConstructDef,
          [-6, 3, 5],
          0,
          cannonPitch
        );
        e.ship.cannonRId = cannonR.id;
        const cannonL = em.newEntity();
        em.ensureComponentOn(cannonL, PhysicsParentDef, e.id);
        em.addComponent(
          cannonL.id,
          CannonConstructDef,
          [6, 3, 5],
          Math.PI,
          cannonPitch
        );
        e.ship.cannonLId = cannonL.id;

        // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
        // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);

        em.addComponent(e.id, FinishedDef);
      }
    },
    "buildShips"
  );

  em.registerSystem(
    [GemDef, InteractableDef],
    [GameStateDef, PhysicsResultsDef, MeDef, InputsDef],
    (gems, res) => {
      for (let gem of gems) {
        if (DeletedDef.isOn(gem)) continue;
        if (res.gameState.state !== GameState.LOBBY) continue;

        // TODO: use interaction system to dedup this code
        const players = res.physicsResults.collidesWith
          .get(gem.interaction.colliderId)
          ?.map((h) => em.findEntity(h, [PlayerEntDef, AuthorityDef]))
          .filter((p) => p && p.authority.pid === res.me.pid);
        if (!players?.length) continue;
        if (res.inputs.keyClicks["e"]) {
          res.gameState.state = GameState.PLAYING;
        }
      }
    },
    "startGame"
  );

  em.registerSystem(
    [ShipDef, PositionDef],
    [MusicDef, InputsDef, CameraDef, GroundSystemDef],
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
        if (
          numCriticalDamaged === numCritical ||
          res.inputs.keyClicks["backspace"]
        ) {
          const gem = em.findEntity(ship.ship.gemId, [
            WorldFrameDef,
            PositionDef,
            PhysicsParentDef,
          ]);
          if (gem) {
            // ship broken!
            // TODO(@darzu): RUN OVER
            res.music.playChords([1, 2, 3, 4, 4], "minor");
            // setTimeout(() => {
            //   // TODO(@darzu): game over music
            //   // alert(`Game over (distance: ${score})`);
            //   createNewShip();
            //   em.
            // }, 2000);
            for (let partId of ship.ship.partIds) {
              const part = em.findEntity(partId, [ShipPartDef]);
              if (part) em.ensureComponentOn(part, DeletedDef);
            }
            em.ensureComponentOn(ship, DeletedDef);
            if (ship.ship.cannonLId)
              em.ensureComponent(ship.ship.cannonLId, DeletedDef);
            if (ship.ship.cannonRId)
              em.ensureComponent(ship.ship.cannonRId, DeletedDef);

            const players = em.filterEntities([
              PlayerEntDef,
              PositionDef,
              RotationDef,
            ]);
            for (let p of players) {
              if (PhysicsParentDef.isOn(p)) p.physicsParent.id = 0;
              console.log("foo");
              vec3.copy(p.position, [0, 100, 0]);
              quat.rotateY(p.rotation, quat.IDENTITY, Math.PI);
              p.player.manning = false;
            }

            quat.identity(res.camera.rotation);
            res.camera.targetId = 0;

            vec3.copy(gem.position, gem.world.position);
            em.ensureComponentOn(gem, RotationDef);
            quat.copy(gem.rotation, gem.world.rotation);
            em.ensureComponentOn(gem, LinearVelocityDef, [0, -0.01, 0]);
            em.removeComponent(gem.id, PhysicsParentDef);
            em.ensureComponentOn(gem, LifetimeDef, 4000);

            res.groundSystem.initialPlace = true;

            createNewShip(em);
          }
        }
      }
    },
    "shipDead"
  );

  em.registerSystem(
    [ShipDef, LinearVelocityDef],
    [GameStateDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        s.linearVelocity[2] = s.ship.speed;
        s.linearVelocity[1] = -0.01;
      }
    },
    "shipMove"
  );

  em.registerSystem(
    null,
    [TextDef, ScoreDef],
    (_, res) => {
      // update score
      res.text.setText(
        `current: ${res.score.currentScore}, max: ${res.score.maxScore}`
      );
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
