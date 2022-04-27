import { FinishedDef } from "../build.js";
import {
  Component,
  ComponentDef,
  EM,
  Entities,
  Entity,
  EntityManager,
  EntityW,
  SystemFN,
  WithComponent,
} from "../entity-manager.js";
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
import { Assets, AssetsDef, BARGE_AABBS } from "./assets.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { ScoreDef } from "./game.js";
import { ColorDef } from "../color.js";
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
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { LifetimeDef } from "./lifetime.js";
import { CannonPropsDef, createCannon } from "./cannon.js";
import { MusicDef } from "../music.js";
import { LocalPlayerDef, PlayerDef } from "./player.js";
import { CameraDef } from "../camera.js";
import { InputsDef } from "../inputs.js";
import { GroundSystemDef } from "./ground.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { endGame, GameState, GameStateDef, startGame } from "./gamestate.js";
import { createRef, defineNetEntityHelper, Ref } from "../em_helpers.js";
import {
  DetectedEventsDef,
  eventWizard,
  registerEventHandler,
} from "../net/events.js";
import { TextDef } from "./ui.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DevConsoleDef } from "../console.js";

// TODO(@darzu): impl. occassionaly syncable components with auto-versioning

export const ShipPartDef = EM.defineComponent(
  "shipPart",
  (critical: boolean) => ({
    critical,
    damaged: false,
  })
);

export const { GemPropsDef, GemLocalDef, createGem } = defineNetEntityHelper(
  EM,
  {
    name: "gem",
    defaultProps: (ship?: Entity) => ({
      ship: createRef(ship ?? 0),
    }),
    serializeProps: (o, buf) => {
      buf.writeUint32(o.ship.id);
    },
    deserializeProps: (o, buf) => {
      o.ship = createRef(buf.readUint32());
    },
    defaultLocal: () => true,
    dynamicComponents: [],
    buildResources: [AssetsDef, MeDef],
    build: (gem, res) => {
      const em: EntityManager = EM;

      em.ensureComponentOn(gem, PositionDef, [0, 0, -1]);

      em.ensureComponentOn(
        gem,
        RenderableConstructDef,
        res.assets.spacerock.proto
      );
      em.ensureComponentOn(gem, PhysicsParentDef, gem.gemProps.ship.id);
      em.ensureComponentOn(gem, ColorDef);

      // create seperate hitbox for interacting with the gem
      const interactBox = em.newEntity();
      const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
      em.ensureComponentOn(interactBox, PhysicsParentDef, gem.id);
      em.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
      em.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: interactAABB,
      });
      em.ensureComponentOn(gem, InteractableDef, interactBox.id);
    },
  }
);

export const { ShipPropsDef, ShipLocalDef, createShip } = defineNetEntityHelper(
  EM,
  {
    name: "ship",
    defaultProps: () => ({
      loc: vec3.create(),
      rot: quat.create(),
      gemId: 0,
      cannonLId: 0,
      cannonRId: 0,
    }),
    serializeProps: (c, buf) => {
      buf.writeVec3(c.loc);
      buf.writeQuat(c.rot);
      buf.writeUint32(c.gemId);
      buf.writeUint32(c.cannonLId);
      buf.writeUint32(c.cannonRId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.loc);
      buf.readQuat(c.rot);
      c.gemId = buf.readUint32();
      c.cannonLId = buf.readUint32();
      c.cannonRId = buf.readUint32();
    },
    defaultLocal: () => ({
      parts: [] as Ref<[typeof ShipPartDef, typeof RenderableDef]>[],
      speed: 0,
    }),
    dynamicComponents: [PositionDef, RotationDef],
    buildResources: [MeDef, AssetsDef],
    build: (s, res) => {
      const em: EntityManager = EM;

      if (s.authority.pid === res.me.pid) {
        s.shipProps.loc = [0, -2, 0];

        // create gem
        const gem = createGem(s);
        s.shipProps.gemId = gem.id;

        // create cannons
        const cannonPitch = Math.PI * +0.05;
        const cannonR = createCannon(
          [-6, 3, 5],
          Math.PI * 0.5,
          cannonPitch,
          s.id
        );
        s.shipProps.cannonRId = cannonR.id;
        const cannonL = createCannon(
          [6, 3, 5],
          Math.PI * 1.5,
          cannonPitch,
          s.id
        );
        s.shipProps.cannonLId = cannonL.id;
      }

      vec3.copy(s.position, s.shipProps.loc);
      quat.copy(s.rotation, s.shipProps.rot);
      em.ensureComponentOn(s, MotionSmoothingDef);

      s.shipLocal.speed = 0.005 * 10; // TODO(@darzu): DEBUG SPEED
      em.ensureComponentOn(s, LinearVelocityDef, [0, 0, 0]);
      em.ensureComponentOn(s, AngularVelocityDef);

      const mc: MultiCollider = {
        shape: "Multi",
        solid: true,
        // TODO(@darzu): integrate these in the assets pipeline
        children: BARGE_AABBS.map((aabb) => ({
          shape: "AABB",
          solid: true,
          aabb,
        })),
      };
      em.ensureComponentOn(s, ColliderDef, mc);

      // NOTE: since their is no network important state on the parts themselves
      //    they can be created locally
      const boatFloor = min(BARGE_AABBS.map((c) => c.max[1]));
      for (let i = 0; i < res.assets.ship_broken.length; i++) {
        const m = res.assets.ship_broken[i];
        const part = em.newEntity();
        em.ensureComponentOn(part, PhysicsParentDef, s.id);
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
        s.shipLocal.parts.push(
          createRef(part.id, [ShipPartDef, RenderableDef])
        );
      }

      // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
      // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
    },
  }
);

const criticalPartIdxes = [0, 3, 5, 6];

// export function createNewShip(em: EntityManager) {
//   em.registerOneShotSystem(null, [AssetsDef], (_, res) => {
//     // create ship
//     const s = em.newEntity();
//     em.ensureComponentOn(s, ShipConstructDef);
//   });
// }

const START_TEXT = "hit the gem to begin";

export function registerShipSystems(em: EntityManager) {
  em.registerSystem(
    [GemPropsDef, InRangeDef],
    [GameStateDef, PhysicsResultsDef, MeDef, InputsDef, LocalPlayerDef],
    (gems, res) => {
      for (let gem of gems) {
        if (DeletedDef.isOn(gem)) continue;
        if (res.gameState.state !== GameState.LOBBY) continue;
        if (res.inputs.keyClicks["e"]) {
          let player = EM.findEntity(res.localPlayer.playerId, [PlayerDef])!;
          startGame(player);
        }
      }
    },
    "startGame"
  );

  const raiseShipHit = eventWizard(
    "ship-hit",
    [[ShipLocalDef]] as const,
    ([ship], partIdx: number) => {
      const music = em.getResource(MusicDef)!;
      const part = ship.shipLocal.parts[partIdx]()!;
      part.renderable.enabled = false;
      part.shipPart.damaged = true;
      music.playChords([2, 3], "minor", 0.2, 5.0, -2);
    },
    {
      legalEvent: ([ship], partIdx) => !!ship.shipLocal.parts[partIdx](),
      serializeExtra: (buf, o) => buf.writeUint8(o),
      deserializeExtra: (buf) => buf.readUint8(),
    }
  );

  em.registerSystem(
    [ShipPropsDef, ShipLocalDef, PositionDef, AuthorityDef],
    [
      MusicDef,
      InputsDef,
      CameraDef,
      GroundSystemDef,
      GameStateDef,
      MeDef,
      PhysicsResultsDef,
      DetectedEventsDef,
    ],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;

      for (let ship of ships) {
        if (ship.authority.pid !== res.me.pid) continue;

        let numCriticalDamaged = 0;
        // TODO(@darzu): EVENT! Notify players of dmg
        for (let i = 0; i < ship.shipLocal.parts.length; i++) {
          const part = ship.shipLocal.parts[i]();
          if (part) {
            if (part.shipPart.damaged) {
              if (part.shipPart.critical) numCriticalDamaged += 1;
              continue;
            }
            const bullets = res.physicsResults.collidesWith
              .get(part.id)
              ?.map((h) => em.findEntity(h, [BulletDef]))
              .filter((h) => h && h.bullet.team === 2);
            if (bullets && bullets.length) {
              for (let b of bullets)
                if (b) em.ensureComponent(b.id, DeletedDef);

              raiseShipHit(ship, i);
            }
          }
        }

        if (
          numCriticalDamaged === criticalPartIdxes.length ||
          res.inputs.keyClicks["backspace"]
        ) {
          endGame(ship);
        }
      }
    },
    "shipHealthCheck"
  );

  em.registerSystem(
    [ShipLocalDef, LinearVelocityDef, AngularVelocityDef, RotationDef],
    [GameStateDef, InputsDef, DevConsoleDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        s.linearVelocity[0] = 0.0;
        s.linearVelocity[2] = s.shipLocal.speed;
        s.linearVelocity[1] = -0.01;
        // TODO(@darzu): dbg ship physics when turning
        // s.angularVelocity[1] = -0.0001;

        if (res.dev.showConsole) {
          // Debugging
          const turnSpeed = Math.PI * 0.01;
          if (res.inputs.keyDowns["z"])
            quat.rotateY(s.rotation, s.rotation, turnSpeed);
          if (res.inputs.keyDowns["x"])
            quat.rotateY(s.rotation, s.rotation, -turnSpeed);

          vec3.transformQuat(s.linearVelocity, s.linearVelocity, s.rotation);
        }
      }
    },
    "shipMove"
  );

  em.registerSystem(
    null,
    [TextDef, ScoreDef, GameStateDef],
    (_, res) => {
      // update score
      switch (res.gameState.state) {
        case GameState.LOBBY:
          if (res.score.maxScore) {
            res.text.upperText = `max: ${res.score.maxScore}, ${START_TEXT}`;
          } else {
            res.text.upperText = `${START_TEXT}`;
          }
          break;
        case GameState.PLAYING:
          res.text.upperText = `current: ${res.score.currentScore}, max: ${res.score.maxScore}`;
          break;
        case GameState.GAMEOVER:
          res.text.upperText = `GAME OVER, score: ${res.score.currentScore}, max: ${res.score.maxScore}`;
          break;
      }
    },
    "shipScore"
  );
}
