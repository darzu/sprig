import { EM } from "../ecs/entity-manager.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { BARGE_AABBS } from "../meshes/primatives.js";
import {
  AABBCollider,
  ColliderDef,
  MultiCollider,
} from "../physics/collider.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { BulletDef } from "../cannons/bullet.js";
import { DeletedDef } from "../ecs/delete.js";
import { clamp, min } from "../utils/math.js";
import { createCannon } from "../cannons/cannon.js";
import { AudioDef } from "../audio/audio.js";
import { LocalPlayerEntityDef, HsPlayerDef } from "./hs-player.js";
import { CameraDef } from "../camera/camera.js";
import { InputsDef } from "../input/inputs.js";
import { InRangeDef, InteractableDef } from "../input/interact.js";
import {
  endGame,
  HyperspaceGameState,
  HSGameStateDef,
  startGame,
} from "./hyperspace-gamestate.js";
import { createRef, defineNetEntityHelper, Ref } from "../ecs/em-helpers.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { MotionSmoothingDef } from "../render/motion-smoothing.js";
import { DevConsoleDef } from "../debug/console.js";
import { constructNetTurret, TurretDef } from "../turret/turret.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { UVPosDef, UVDirDef } from "../ocean/ocean.js";
import { PartyDef } from "../camera/party.js";
import { UVShipDef } from "./uv-ship.js";
import {
  createHypMastNow,
  HypMastLocalDef,
  HypMastPropsDef,
} from "./hypersail.js";
import { makeOrrery, OrreryDef } from "./orrery.js";
import { ColorDef } from "../color/color-ecs.js";
import { createGem, GemPropsDef } from "./gem.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys-phase.js";

// TODO(@darzu): impl. occassionaly syncable components with auto-versioning

// export const BOAT_COLOR: V3 = V(0.2, 0.1, 0.05);

export const ShipPartDef = EM.defineNonupdatableComponent(
  "shipPart",
  (critical: boolean) => ({
    critical,
    damaged: false,
  })
);

export const { RudderPropsDef, RudderLocalDef, createRudderNow } =
  defineNetEntityHelper({
    name: "rudder",
    defaultProps: () => ({
      shipId: 0,
    }),
    updateProps: (p, shipId?: number) =>
      Object.assign(p, {
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
    buildResources: [AllMeshesDef, MeDef],
    build: (rudder, res) => {
      EM.set(rudder, PositionDef, V(0, 0.5, -15));

      EM.set(rudder, RenderableConstructDef, res.allMeshes.rudder.mesh);
      EM.set(rudder, PhysicsParentDef, rudder.rudderProps.shipId);
      EM.set(rudder, ColorDef, ENDESGA16.lightBrown);
      V3.scale(rudder.color, 0.5, rudder.color);

      // create seperate hitbox for interacting with the rudder
      const interactBox = EM.new();
      EM.set(interactBox, PhysicsParentDef, rudder.rudderProps.shipId);
      EM.set(interactBox, PositionDef, V(0, 0, -12));
      EM.set(interactBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: {
          min: V(-1, -2, -2),
          max: V(1, 2, 2.5),
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
        V(0, 20, 50)
      );

      rudder.turret.maxPitch = 0;
      rudder.turret.minPitch = 0;
      rudder.turret.maxYaw = Math.PI / 6;
      rudder.turret.minYaw = -Math.PI / 6;
      rudder.turret.invertYaw = true;

      return rudder;
    },
  });

// hyperspace ship
export const { HsShipPropsDef, HsShipLocalDef, createHsShip } =
  defineNetEntityHelper({
    name: "hsShip",
    defaultProps: () => ({
      uvPos: V(0.5, 0.5),
      gemId: 0,
      cannonLId: 0, // TODO(@darzu): use refs?
      cannonRId: 0,
      rudder: createRef(0, [RudderPropsDef, YawPitchDef]),
      mast: createRef(0, [HypMastPropsDef, HypMastLocalDef]),
    }),
    updateProps: (p, uvPos?: V2.InputT) => {
      if (uvPos) V2.copy(p.uvPos, uvPos);
      return p;
    },
    serializeProps: (c, buf) => {
      buf.writeVec2(c.uvPos);
      buf.writeUint32(c.gemId);
      buf.writeUint32(c.cannonLId);
      buf.writeUint32(c.cannonRId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec2(c.uvPos);
      c.gemId = buf.readUint32();
      c.cannonLId = buf.readUint32();
      c.cannonRId = buf.readUint32();
    },
    defaultLocal: () => ({
      parts: [] as Ref<[typeof ShipPartDef, typeof RenderableDef]>[],
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
    buildResources: [MeDef, AllMeshesDef],
    build: async (s, res) => {
      if (s.authority.pid === res.me.pid) {
        // s.hsShipProps.loc = [0, -2, 0];

        // create gem
        const gem = createGem(s.id);
        s.hsShipProps.gemId = gem.id;

        // create rudder
        const r = createRudderNow(res, s.id);
        s.hsShipProps.rudder = createRef(r);

        const m = createHypMastNow(res, s.id);
        s.hsShipProps.mast = createRef(m);

        // create cannons
        const cannonPitch = Math.PI * +0.05;
        const cannonR = createCannon(V(-6, 3, 5), Math.PI * 0.5, cannonPitch);
        EM.set(cannonR, PhysicsParentDef, s.id);
        s.hsShipProps.cannonRId = cannonR.id;
        const cannonL = createCannon(V(6, 3, 5), Math.PI * 1.5, cannonPitch);
        EM.set(cannonL, PhysicsParentDef, s.id);
        s.hsShipProps.cannonLId = cannonL.id;
      }

      V2.copy(s.uvPos, s.hsShipProps.uvPos);
      V2.set(1, 0, s.uvDir);

      EM.set(s, PositionDef);
      EM.set(s, RotationDef);

      EM.set(s, MotionSmoothingDef);

      EM.set(s, UVShipDef);

      s.uvship.speed = 0;
      // s.hsShipLocal.speed = 0.005 * 3; // TODO(@darzu): DEBUG SPEED
      // EM.set(s, LinearVelocityDef, [0, 0, 0]);
      // EM.set(s, AngularVelocityDef);

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
      EM.set(s, ColliderDef, mc);

      // NOTE: since their is no network important state on the parts themselves
      //    they can be created locally
      const shipFloor = min(BARGE_AABBS.map((c) => c.max[1]));
      for (let i = 0; i < res.allMeshes.ship_broken.length; i++) {
        const m = res.allMeshes.ship_broken[i];
        const part = EM.new();
        EM.set(part, PhysicsParentDef, s.id);
        EM.set(part, RenderableConstructDef, m.proto);
        EM.set(part, ColorDef, ENDESGA16.lightBrown);
        EM.set(part, PositionDef, V(0, 0, 0));
        const isCritical = criticalPartIdxes.includes(i);
        EM.set(part, ShipPartDef, isCritical);
        EM.set(part, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: m.aabb,
        });
        (part.collider as AABBCollider).aabb.max[1] = shipFloor;
        s.hsShipLocal.parts.push(
          createRef(part.id, [ShipPartDef, RenderableDef])
        );
      }

      makeOrrery(s.id);
      // EM.addComponent(EM.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
      // EM.addComponent(EM.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
    },
  });

const criticalPartIdxes = [0, 3, 5, 6];

// export function createNewShip() {
//   EM.registerOneShotSystem(null, [AssetsDef], (_, res) => {
//     // create ship
//     const s = EM.newEntity();
//     EM.set(s, ShipConstructDef);
//   });
// }

const START_TEXT = "";
// const START_TEXT = "hit the gem to begin";

export function registerShipSystems() {
  EM.addSystem(
    "startGame",
    Phase.GAME_WORLD,
    [GemPropsDef, InRangeDef],
    [HSGameStateDef, PhysicsResultsDef, MeDef, InputsDef, LocalPlayerEntityDef],
    (gems, res) => {
      for (let gem of gems) {
        if (DeletedDef.isOn(gem)) continue;
        if (res.hsGameState.state !== HyperspaceGameState.LOBBY) continue;
        if (res.inputs.keyClicks["e"]) {
          let player = EM.findEntity(res.localPlayerEnt.playerId, [
            HsPlayerDef,
          ])!;
          startGame(player);
        }
      }
    }
  );

  const raiseShipHit = eventWizard(
    "ship-hit",
    [[HsShipLocalDef]] as const,
    ([ship], partIdx: number) => {
      const music = EM.getResource(AudioDef)!;
      const part = ship.hsShipLocal.parts[partIdx]()!;
      part.renderable.enabled = false;
      part.shipPart.damaged = true;
      // TODO(@darzu): AUDIO. unify old and new audio system
      //music.playChords([2, 3], "minor", 0.2, 5.0, -2);
    },
    {
      legalEvent: ([ship], partIdx) => !!ship.hsShipLocal.parts[partIdx](),
      serializeExtra: (buf, o) => buf.writeUint8(o),
      deserializeExtra: (buf) => buf.readUint8(),
    }
  );

  EM.addSystem(
    "shipHealthCheck",
    Phase.GAME_WORLD,
    [HsShipPropsDef, HsShipLocalDef, PositionDef, AuthorityDef],
    [
      AudioDef,
      InputsDef,
      CameraDef,
      HSGameStateDef,
      MeDef,
      PhysicsResultsDef,
      DetectedEventsDef,
    ],
    (ships, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) return;

      for (let ship of ships) {
        if (ship.authority.pid !== res.me.pid) continue;

        let numCriticalDamaged = 0;
        // TODO(@darzu): EVENT! Notify players of dmg
        for (let i = 0; i < ship.hsShipLocal.parts.length; i++) {
          const part = ship.hsShipLocal.parts[i]();
          if (part) {
            if (part.shipPart.damaged) {
              if (part.shipPart.critical) numCriticalDamaged += 1;
              continue;
            }
            const bullets = res.physicsResults.collidesWith
              .get(part.id)
              ?.map((h) => EM.findEntity(h, [BulletDef]))
              .filter((h) => h && h.bullet.team === 2);
            if (bullets && bullets.length) {
              for (let b of bullets) if (b) EM.set(b, DeletedDef);

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
    }
  );

  EM.addSystem(
    "playerShipMove",
    Phase.GAME_PLAYERS,
    [
      UVShipDef,
      HsShipLocalDef,
      HsShipPropsDef,
      // LinearVelocityDef,
      // AngularVelocityDef,
      AuthorityDef,
      // RotationDef,
      UVDirDef,
    ],
    [HSGameStateDef, MeDef, InputsDef, DevConsoleDef],
    (ships, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) {
        return;
      }
      for (let s of ships) {
        if (s.authority.pid !== res.me.pid) return;
        // TODO(@darzu): handle UV heading !!
        // vec3.set(s.linearVelocity, 0, -0.01, s.hsShipLocal.speed);
        // vec3.transformQuat(s.linearVelocity, s.linearVelocity, s.rotation);
        // s.angularVelocity[1] = s.hsShipProps.rudder()!.yawpitch.yaw * 0.0005;
        // TODO(@darzu): dbg ship physics when turning
        // s.angularVelocity[1] = -0.0001;

        // SPEED
        if (res.inputs.keyDowns["z"]) s.uvship.speed += 0.00001;
        if (res.inputs.keyDowns["x"]) s.uvship.speed -= 0.00001;
        s.uvship.speed = clamp(s.uvship.speed, -0.001, 0.001);
        //s.ship.speed = Math.max(0, s.ship.speed);

        // STEERING
        let yaw = s.hsShipProps.rudder()!.yawpitch.yaw;

        V2.rotate(s.uvDir, V2.ZEROS, yaw * 0.02, s.uvDir);
      }
    }
  );

  EM.addSystem(
    "shipUpdateParty",
    Phase.GAME_WORLD,
    [HsShipLocalDef, HsShipPropsDef, PositionDef],
    [PartyDef],
    (ships, res) => {
      if (ships[0]) V3.copy(res.party.pos, ships[0].position);
    }
  );

  // If a rudder isn't being manned, smooth it back towards straight
  EM.addSystem(
    "easeRudderHS",
    Phase.GAME_WORLD,
    [RudderPropsDef, TurretDef, YawPitchDef, AuthorityDef],
    [MeDef],
    (rudders, res) => {
      for (let r of rudders) {
        if (r.authority.pid !== res.me.pid) return;
        if (r.turret.mannedId !== 0) return;
        if (Math.abs(r.yawpitch.yaw) < 0.01) r.yawpitch.yaw = 0;
        r.yawpitch.yaw *= 0.9;
      }
    }
  );
}
