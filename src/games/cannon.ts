import { EM, EntityManager } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { ColorDef } from "../color-ecs.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { PhysicsParentDef, PositionDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { InRangeDef } from "./interact.js";
import { LocalPlayerDef, PlayerDef } from "./player.js";
import { AssetsDef } from "../assets.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { AudioDef, randChordId } from "../audio.js";
import { InputsDef } from "../inputs.js";
import { DeletedDef } from "../delete.js";
import { defineNetEntityHelper } from "../em_helpers.js";
import { constructNetTurret, TurretDef } from "./turret.js";
import { SoundSetDef } from "../ld53/sound-loader.js";

export const { CannonPropsDef, CannonLocalDef, createCannon, createCannonNow } =
  defineNetEntityHelper(EM, {
    name: "cannon",
    defaultProps: (
      loc?: vec3,
      yaw?: number,
      pitch?: number,
      parentId?: number
    ) => {
      return {
        location: loc ?? V(0, 0, 0),
        yaw: yaw ?? 0,
        pitch: pitch ?? 0,
        parentId: parentId ?? 0,
      };
    },
    serializeProps: (c, buf) => {
      buf.writeVec3(c.location);
      buf.writeFloat32(c.yaw);
      buf.writeUint32(c.parentId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.location);
      c.yaw = buf.readFloat32();
      c.parentId = buf.readUint32();
    },
    defaultLocal: () => {
      return {
        loaded: true,
        fireMs: 0,
        fireDelayMs: 1000,
        loadedId: 0,
      };
    },
    dynamicComponents: [],
    buildResources: [AssetsDef, MeDef],
    build: (e, res) => {
      const em: EntityManager = EM;
      const props = e.cannonProps;
      em.ensureComponentOn(e, PositionDef, props.location);
      constructNetTurret(
        e,
        props.yaw,
        props.pitch,
        res.assets.ld51_cannon.aabb,
        0,
        undefined,
        undefined,
        undefined,
        true,
        1.0,
        Math.PI / 4,
        "W/S: pitch, A/D: turn, left click: fire, E: drop cannon"
      );
      em.ensureComponentOn(e, ColorDef, V(0, 0, 0));
      em.ensureComponentOn(
        e,
        RenderableConstructDef,
        res.assets.ld51_cannon.mesh
      );
      em.ensureComponentOn(e, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: res.assets.cannon.aabb,
      });
      em.ensureComponentOn(e, PhysicsParentDef, props.parentId);
      return e;
    },
  });

export function registerCannonSystems(em: EntityManager) {
  em.registerSystem(
    [CannonLocalDef],
    [TimeDef],
    (cannons, res) => {
      for (let c of cannons) {
        if (c.cannonLocal.fireMs > 0) {
          c.cannonLocal.fireMs -= res.time.dt;
        }
      }
    },
    "reloadCannon"
  );

  const raiseFireCannon = eventWizard(
    "fire-cannon",
    [[PlayerDef], [CannonLocalDef, WorldFrameDef]] as const,
    ([player, cannon]) => {
      // only the firing player creates a bullet
      if (player.id === EM.getResource(LocalPlayerDef)?.playerId) {
        const fireDir = cannon.world.rotation;
        // const fireDir = quat.create();
        // quat.rotateY(fireDir, cannon.world.rotation, Math.PI * 0.5);
        const firePos = vec3.create();
        vec3.transformQuat(firePos, fireDir, firePos);
        vec3.add(firePos, cannon.world.position, firePos);
        // TODO(@darzu): MULTIPLAYER BULLETS broken b/c LD51
        // console.log("fire-cannon");
        const v = 0.18;
        const g = 6.0 * 0.00001;
        const b = fireBullet(
          EM,
          2,
          firePos,
          fireDir,
          v,
          0.02,
          g,
          // 2.0,
          20.0,
          [0, 0, -1]
        );
      }

      // but everyone resets the cooldown and plays sound effects
      cannon.cannonLocal.fireMs = cannon.cannonLocal.fireDelayMs;
      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("cannonS", res.soundSet["cannonS.mp3"], 0.2);
      });

      //const chord = randChordId();
      //EM.getResource(AudioDef)!.playChords([chord], "major", 2.0, 3.0, -2);
    },
    {
      legalEvent: ([player, cannon]) => {
        return cannon.cannonLocal.fireMs <= 0;
      },
    }
  );

  em.registerSystem(
    [CannonLocalDef, TurretDef, WorldFrameDef],
    [InputsDef, LocalPlayerDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;
        if (c.turret.mannedId !== player.id) continue;
        if (res.inputs.lclick && c.cannonLocal.fireMs <= 0) {
          raiseFireCannon(player, c);
        }
      }
    },
    "playerControlCannon"
  );

  em.registerSystem(
    [CannonLocalDef, TurretDef, InRangeDef, AuthorityDef, WorldFrameDef],
    [DetectedEventsDef, InputsDef, LocalPlayerDef],
    (cannons, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [
        PlayerDef,
        AuthorityDef,
      ])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;
        // allow firing un-manned cannons
        if (
          res.inputs.lclick &&
          c.turret.mannedId === 0 &&
          c.cannonLocal.fireMs <= 0
        ) {
          raiseFireCannon(player, c);
        }
      }
    },
    "playerManCanon"
  );
}
