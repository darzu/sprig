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
import { quat, vec2, vec3 } from "../gl-matrix.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
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
import { ColorDef } from "../color.js";
import { setCubePosScaleToAABB } from "../physics/phys-debug.js";
import { BOAT_COLOR } from "./enemy-boat.js";
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
import { constructNetTurret, TurretDef } from "./turret.js";
import { YawPitchDef } from "../yawpitch.js";
import { UVPosDef, UVDirDef } from "./ocean.js";
import { tempVec2 } from "../temp-pool.js";
import { PartyDef } from "./party.js";

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
    defaultProps: (shipId?: number) => ({
      shipId: shipId ?? 0,
    }),
    serializeProps: (o, buf) => {
      buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
      o.shipId = buf.readUint32();
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
      em.ensureComponentOn(gem, PhysicsParentDef, gem.gemProps.shipId);
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

export const { RudderPropsDef, RudderLocalDef, createRudderNow } =
  defineNetEntityHelper(EM, {
    name: "rudder",
    defaultProps: (shipId?: number) => ({
      shipId: shipId ?? 0,
    }),
    serializeProps: (o, buf) => {
      buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
      o.shipId = buf.readUint32();
    },
    defaultLocal: () => true,
    dynamicComponents: [RotationDef],
    buildResources: [AssetsDef, MeDef],
    build: (rudder, res) => {
      const em: EntityManager = EM;

      em.ensureComponentOn(rudder, PositionDef, [0, 0.5, -15]);

      em.ensureComponentOn(
        rudder,
        RenderableConstructDef,
        res.assets.rudder.mesh
      );
      em.ensureComponentOn(rudder, PhysicsParentDef, rudder.rudderProps.shipId);
      em.ensureComponentOn(rudder, ColorDef, vec3.clone(BOAT_COLOR));
      vec3.scale(rudder.color, rudder.color, 0.5);

      // create seperate hitbox for interacting with the rudder
      const interactBox = em.newEntity();
      em.ensureComponentOn(
        interactBox,
        PhysicsParentDef,
        rudder.rudderProps.shipId
      );
      em.ensureComponentOn(interactBox, PositionDef, [0, 0, -12]);
      em.ensureComponentOn(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: {
          min: vec3.fromValues(-1, -2, -2),
          max: vec3.fromValues(1, 2, 2.5),
        },
      });
      constructNetTurret(
        rudder,
        0,
        0,
        interactBox,
        Math.PI,
        -Math.PI / 8,
        1.5,
        [0, 20, 50]
      );

      rudder.turret.maxPitch = 0;
      rudder.turret.minPitch = 0;
      rudder.turret.maxYaw = Math.PI / 6;
      rudder.turret.minYaw = -Math.PI / 6;
      rudder.turret.invertYaw = true;

      return rudder;
    },
  });

export const { ShipPropsDef, ShipLocalDef, createShip } = defineNetEntityHelper(
  EM,
  {
    name: "ship",
    defaultProps: (uvLoc?: vec2) => ({
      uvLoc: uvLoc ?? vec2.fromValues(0.5, 0.5),
      gemId: 0,
      cannonLId: 0,
      cannonRId: 0,
      rudder: createRef(0, [RudderPropsDef, YawPitchDef]),
    }),
    serializeProps: (c, buf) => {
      buf.writeVec2(c.uvLoc);
      buf.writeUint32(c.gemId);
      buf.writeUint32(c.cannonLId);
      buf.writeUint32(c.cannonRId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec2(c.uvLoc);
      c.gemId = buf.readUint32();
      c.cannonLId = buf.readUint32();
      c.cannonRId = buf.readUint32();
    },
    defaultLocal: () => ({
      parts: [] as Ref<[typeof ShipPartDef, typeof RenderableDef]>[],
      speed: 0,
    }),
    dynamicComponents: [
      // TODO(@darzu): do we want to sync UV based stuff instead?
      UVPosDef,
      UVDirDef,
      // PositionDef,
      // RotationDef,
      // LinearVelocityDef,
      // AngularVelocityDef,
    ],
    buildResources: [MeDef, AssetsDef],
    build: (s, res) => {
      const em: EntityManager = EM;

      if (s.authority.pid === res.me.pid) {
        // s.shipProps.loc = [0, -2, 0];

        // create gem
        const gem = createGem(s.id);
        s.shipProps.gemId = gem.id;

        // create rudder
        const r = createRudderNow(res, s.id);
        s.shipProps.rudder = createRef(r);

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

      vec2.copy(s.uvPos, s.shipProps.uvLoc);

      em.ensureComponentOn(s, PositionDef);
      em.ensureComponentOn(s, RotationDef);

      em.ensureComponentOn(s, MotionSmoothingDef);

      s.shipLocal.speed = 0.0005;
      // s.shipLocal.speed = 0.005 * 3; // TODO(@darzu): DEBUG SPEED
      // em.ensureComponentOn(s, LinearVelocityDef, [0, 0, 0]);
      // em.ensureComponentOn(s, AngularVelocityDef);

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

const START_TEXT = "";
// const START_TEXT = "hit the gem to begin";

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
    [
      ShipLocalDef,
      ShipPropsDef,
      // LinearVelocityDef,
      // AngularVelocityDef,
      AuthorityDef,
      // RotationDef,
      UVPosDef,
      UVDirDef,
    ],
    [GameStateDef, MeDef, InputsDef, DevConsoleDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        if (s.authority.pid !== res.me.pid) return;
        // TODO(@darzu): handle UV heading !!
        // vec3.set(s.linearVelocity, 0, -0.01, s.shipLocal.speed);
        // vec3.transformQuat(s.linearVelocity, s.linearVelocity, s.rotation);
        // s.angularVelocity[1] = s.shipProps.rudder()!.yawpitch.yaw * 0.0005;
        // TODO(@darzu): dbg ship physics when turning
        // s.angularVelocity[1] = -0.0001;

        // SPEED
        if (res.inputs.keyDowns["z"]) s.shipLocal.speed += 0.00001;
        if (res.inputs.keyDowns["x"]) s.shipLocal.speed -= 0.00001;
        s.shipLocal.speed = Math.max(0, s.shipLocal.speed);

        // STEERING
        let yaw = s.shipProps.rudder()!.yawpitch.yaw;

        vec2.rotate(s.uvDir, s.uvDir, vec2.ZEROS, yaw * 0.02);

        // s.uvDir[0] += Math.cos(yaw);
        // s.uvDir[1] -= Math.sin(yaw);
        // console.log(`yaw: ${yaw} uvdir: ${s.uvDir[0]},${s.uvDir[1]}`);

        // MOVING
        if (s.shipLocal.speed > 0.00001) {
          // NOTE: we scale uvDir by speed so that the look-ahead used for
          //    UVDir->Rotation works.
          // TODO(@darzu): This doesn't seem great. We need a better way to
          //    do  UVDir->Rotation
          vec2.normalize(s.uvDir, s.uvDir);
          vec2.scale(s.uvDir, s.uvDir, s.shipLocal.speed);
          vec2.add(s.uvPos, s.uvPos, s.uvDir);
        }
      }
    },
    "shipMove"
  );

  em.registerSystem(
    [ShipLocalDef, ShipPropsDef, PositionDef],
    [PartyDef],
    (ships, res) => {
      if (ships[0]) vec3.copy(res.party.pos, ships[0].position);
    },
    "shipUpdateParty"
  );

  // If a rudder isn't being manned, smooth it back towards straight
  em.registerSystem(
    [RudderPropsDef, TurretDef, YawPitchDef, AuthorityDef],
    [MeDef],
    (rudders, res) => {
      for (let r of rudders) {
        if (r.authority.pid !== res.me.pid) return;
        if (r.turret.mannedId !== 0) return;
        if (Math.abs(r.yawpitch.yaw) < 0.01) r.yawpitch.yaw = 0;
        r.yawpitch.yaw *= 0.9;
      }
    },
    "easeRudder"
  );
}
