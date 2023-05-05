import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
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
import { AssetsDef } from "../meshes/assets.js";
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
import { LocalHsPlayerDef, HsPlayerDef } from "./hs-player.js";
import { CameraDef } from "../camera/camera.js";
import { InputsDef } from "../input/inputs.js";
import { InRangeDef, InteractableDef } from "../input/interact.js";
import {
  endGame,
  HyperspaceGameState,
  GameStateDef,
  startGame,
} from "./hyperspace-gamestate.js";
import { createRef, defineNetEntityHelper, Ref } from "../ecs/em_helpers.js";
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

// TODO(@darzu): impl. occassionaly syncable components with auto-versioning

// export const BOAT_COLOR: vec3 = V(0.2, 0.1, 0.05);

export const ShipPartDef = EM.defineComponent(
  "shipPart",
  (critical: boolean) => ({
    critical,
    damaged: false,
  })
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

      em.ensureComponentOn(rudder, PositionDef, V(0, 0.5, -15));

      em.ensureComponentOn(
        rudder,
        RenderableConstructDef,
        res.assets.rudder.mesh
      );
      em.ensureComponentOn(rudder, PhysicsParentDef, rudder.rudderProps.shipId);
      em.ensureComponentOn(rudder, ColorDef, ENDESGA16.lightBrown);
      vec3.scale(rudder.color, 0.5, rudder.color);

      // create seperate hitbox for interacting with the rudder
      const interactBox = em.new();
      em.ensureComponentOn(
        interactBox,
        PhysicsParentDef,
        rudder.rudderProps.shipId
      );
      em.ensureComponentOn(interactBox, PositionDef, V(0, 0, -12));
      em.ensureComponentOn(interactBox, ColliderDef, {
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
  defineNetEntityHelper(EM, {
    name: "hsShip",
    defaultProps: (uvPos?: vec2) => ({
      uvPos: uvPos ?? vec2.fromValues(0.5, 0.5),
      gemId: 0,
      cannonLId: 0,
      cannonRId: 0,
      rudder: createRef(0, [RudderPropsDef, YawPitchDef]),
      mast: createRef(0, [HypMastPropsDef, HypMastLocalDef]),
    }),
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
    buildResources: [MeDef, AssetsDef],
    build: async (s, res) => {
      const em: EntityManager = EM;

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
        const cannonR = createCannon(
          V(-6, 3, 5),
          Math.PI * 0.5,
          cannonPitch,
          s.id
        );
        s.hsShipProps.cannonRId = cannonR.id;
        const cannonL = createCannon(
          V(6, 3, 5),
          Math.PI * 1.5,
          cannonPitch,
          s.id
        );
        s.hsShipProps.cannonLId = cannonL.id;
      }

      vec2.copy(s.uvPos, s.hsShipProps.uvPos);
      vec2.set(1, 0, s.uvDir);

      em.ensureComponentOn(s, PositionDef);
      em.ensureComponentOn(s, RotationDef);

      em.ensureComponentOn(s, MotionSmoothingDef);

      em.ensureComponentOn(s, UVShipDef);

      s.uvship.speed = 0;
      // s.hsShipLocal.speed = 0.005 * 3; // TODO(@darzu): DEBUG SPEED
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
      const shipFloor = min(BARGE_AABBS.map((c) => c.max[1]));
      for (let i = 0; i < res.assets.ship_broken.length; i++) {
        const m = res.assets.ship_broken[i];
        const part = em.new();
        em.ensureComponentOn(part, PhysicsParentDef, s.id);
        em.ensureComponentOn(part, RenderableConstructDef, m.proto);
        em.ensureComponentOn(part, ColorDef, ENDESGA16.lightBrown);
        em.ensureComponentOn(part, PositionDef, V(0, 0, 0));
        const isCritical = criticalPartIdxes.includes(i);
        em.ensureComponentOn(part, ShipPartDef, isCritical);
        em.ensureComponentOn(part, ColliderDef, {
          shape: "AABB",
          solid: false,
          aabb: m.aabb,
        });
        (part.collider as AABBCollider).aabb.max[1] = shipFloor;
        s.hsShipLocal.parts.push(
          createRef(part.id, [ShipPartDef, RenderableDef])
        );
      }

      makeOrrery(em, s.id);
      // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
      // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
    },
  });

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
    [GameStateDef, PhysicsResultsDef, MeDef, InputsDef, LocalHsPlayerDef],
    (gems, res) => {
      for (let gem of gems) {
        if (DeletedDef.isOn(gem)) continue;
        if (res.hsGameState.state !== HyperspaceGameState.LOBBY) continue;
        if (res.inputs.keyClicks["e"]) {
          let player = EM.findEntity(res.localHsPlayer.playerId, [
            HsPlayerDef,
          ])!;
          startGame(player);
        }
      }
    },
    "startGame"
  );

  const raiseShipHit = eventWizard(
    "ship-hit",
    [[HsShipLocalDef]] as const,
    ([ship], partIdx: number) => {
      const music = em.getResource(AudioDef)!;
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

  em.registerSystem(
    [HsShipPropsDef, HsShipLocalDef, PositionDef, AuthorityDef],
    [
      AudioDef,
      InputsDef,
      CameraDef,
      GameStateDef,
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
      UVShipDef,
      HsShipLocalDef,
      HsShipPropsDef,
      // LinearVelocityDef,
      // AngularVelocityDef,
      AuthorityDef,
      // RotationDef,
      UVDirDef,
    ],
    [GameStateDef, MeDef, InputsDef, DevConsoleDef],
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

        vec2.rotate(s.uvDir, vec2.ZEROS, yaw * 0.02, s.uvDir);
      }
    },
    "playerShipMove"
  );

  em.registerSystem(
    [HsShipLocalDef, HsShipPropsDef, PositionDef],
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
