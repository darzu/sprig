import { EM } from "../ecs/entity-manager.js";
import { TimeDef } from "../time/time.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { ColorDef } from "../color/color-ecs.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { PhysicsParentDef, PositionDef } from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { fireBullet } from "./bullet.js";
import { InRangeDef } from "../input/interact.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { CannonLD51Mesh } from "../meshes/mesh-list.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { AudioDef, randChordId } from "../audio/audio.js";
import { InputsDef } from "../input/inputs.js";
import { DeletedDef } from "../ecs/delete.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { CanManDef, constructNetTurret, TurretDef } from "../turret/turret.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3Dbg } from "../utils/utils-3d.js";

export const { CannonPropsDef, CannonLocalDef, createCannon, createCannonNow } =
  defineNetEntityHelper({
    name: "cannon",
    defaultProps: () => {
      return {
        location: V(0, 0, 0),
        yaw: 0,
        pitch: 0,
        parentId: 0,
      };
    },
    updateProps: (
      p,
      location?: vec3,
      yaw?: number,
      pitch?: number,
      parentId?: number
    ) => {
      if (location) vec3.copy(p.location, location);
      if (yaw !== undefined) p.yaw = yaw;
      if (pitch !== undefined) p.pitch = pitch;
      if (parentId !== undefined) p.parentId = parentId;
      return p;
    },
    serializeProps: (c, buf) => {
      buf.writeVec3(c.location);
      buf.writeFloat32(c.yaw);
      buf.writeFloat32(c.pitch);
      buf.writeUint32(c.parentId);
    },
    deserializeProps: (c, buf) => {
      buf.readVec3(c.location);
      c.yaw = buf.readFloat32();
      c.pitch = buf.readFloat32();
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
    buildResources: [CannonLD51Mesh.def, MeDef],
    build: (e, res) => {
      const props = e.cannonProps;
      EM.set(e, PositionDef, props.location);
      constructNetTurret(
        e,
        props.yaw,
        props.pitch,
        res.mesh_ld51_cannon.aabb,
        0,
        undefined,
        undefined,
        undefined,
        true,
        1.0,
        Math.PI / 4,
        "W/S: pitch, A/D: turn, left click: fire, E: drop cannon"
      );
      EM.set(e, ColorDef, V(0, 0, 0));
      EM.set(
        e,
        RenderableConstructDef,
        res.mesh_ld51_cannon.mesh // TODO(@darzu): PERF: use .proto?
      );
      EM.set(e, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.mesh_ld51_cannon.aabb,
      });
      EM.set(e, PhysicsParentDef, props.parentId);
      return e;
    },
  });

EM.addEagerInit([CannonPropsDef], [], [], () => {
  EM.addSystem(
    "reloadCannon",
    Phase.GAME_WORLD,
    [CannonLocalDef],
    [TimeDef],
    (cannons, res) => {
      for (let c of cannons) {
        if (c.cannonLocal.fireMs > 0) {
          c.cannonLocal.fireMs -= res.time.dt;
        }
      }
    }
  );

  const raiseFireCannon = eventWizard(
    "fire-cannon",
    [[CanManDef], [CannonLocalDef, WorldFrameDef]] as const,
    ([player, cannon]) => {
      // only the firing player creates a bullet
      if (player.id === EM.getResource(LocalPlayerEntityDef)?.playerId) {
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
          2,
          firePos,
          fireDir,
          v,
          0.02,
          g,
          // 2.0,
          20.0,
          [0, 1, 0]
        );
      }

      // but everyone resets the cooldown and plays sound effects
      cannon.cannonLocal.fireMs = cannon.cannonLocal.fireDelayMs;
      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("cannonS", res.soundSet["cannonS.mp3"], 0.2);
      });

      // TODO(@darzu): AUDIO. unify old and new system.
      //const chord = randChordId();
      //EM.getResource(AudioDef)!.playChords([chord], "major", 2.0, 3.0, -2);
    },
    {
      legalEvent: ([player, cannon]) => {
        return cannon.cannonLocal.fireMs <= 0;
      },
    }
  );

  EM.addSystem(
    "playerControlCannon",
    Phase.GAME_PLAYERS,
    [CannonLocalDef, TurretDef, WorldFrameDef],
    [InputsDef, LocalPlayerEntityDef],
    (cannons, res) => {
      const player = EM.findEntity(res.localPlayerEnt.playerId, [CanManDef])!;
      if (!player) return;
      for (let c of cannons) {
        if (DeletedDef.isOn(c)) continue;
        if (c.turret.mannedId !== player.id) continue;
        if (res.inputs.lclick && c.cannonLocal.fireMs <= 0) {
          raiseFireCannon(player, c);
        }
      }
    }
  );

  EM.addSystem(
    "playerManCanon",
    Phase.GAME_PLAYERS,
    [CannonLocalDef, TurretDef, InRangeDef, AuthorityDef, WorldFrameDef],
    [DetectedEventsDef, InputsDef, LocalPlayerEntityDef],
    (cannons, res) => {
      const player = EM.findEntity(res.localPlayerEnt.playerId, [
        CanManDef,
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
    }
  );
});
