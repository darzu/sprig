import { EM, EntityManager, Entity, EntityW } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, SyncDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { LocalPlayerDef, PlayerEntDef } from "./player.js";
import { CameraDef } from "../camera.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { InputsDef } from "../inputs.js";
import { clamp } from "../math.js";
import { DeletedDef } from "../delete.js";
import { defineSerializableComponent } from "../em_helpers.js";

export const YawPitchDef = defineSerializableComponent(
  EM,
  "yawpitch",
  (yaw?: number, pitch?: number) => {
    return {
      yaw: yaw ?? 0,
      pitch: pitch ?? 0,
    };
  },
  (o, buf) => {
    buf.writeFloat32(o.yaw);
    buf.writeFloat32(o.pitch);
  },
  (o, buf) => {
    o.yaw = buf.readFloat32();
    o.pitch = buf.readFloat32();
  }
);

export const TurretDef = EM.defineComponent("turret", () => {
  return {
    mannedId: 0,
    minYaw: -Math.PI * 0.5,
    maxYaw: +Math.PI * 0.5,
    minPitch: -Math.PI * 0.3,
    maxPitch: Math.PI * 0.1,
  };
});

export function constructNetTurret(
  e: Entity,
  startYaw: number,
  startPitch: number,
  meshAABB: AABB
): e is EntityW<
  [
    typeof TurretDef,
    typeof YawPitchDef,
    typeof InteractableDef,
    typeof SyncDef,
    typeof RotationDef
  ]
> {
  EM.ensureComponentOn(e, YawPitchDef);
  e.yawpitch.yaw = startYaw;
  e.yawpitch.pitch = startPitch;
  EM.ensureComponentOn(e, TurretDef);
  e.turret.minYaw += startYaw;
  e.turret.maxYaw += startYaw;
  EM.ensureComponentOn(e, RotationDef);
  EM.ensureComponentOn(e, SyncDef);
  e.sync.dynamicComponents.push(YawPitchDef.id);

  // create seperate hitbox for interacting with the turret
  const interactBox = EM.newEntity();
  const interactAABB = copyAABB(createAABB(), meshAABB);
  vec3.scale(interactAABB.min, interactAABB.min, 2);
  vec3.scale(interactAABB.max, interactAABB.max, 2);
  EM.ensureComponentOn(interactBox, PhysicsParentDef, e.id);
  EM.ensureComponentOn(interactBox, PositionDef, [0, 0, 0]);
  EM.ensureComponentOn(interactBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: interactAABB,
  });
  EM.ensureComponentOn(e, InteractableDef);
  e.interaction.colliderId = interactBox.id;
  return true;
}

export const raiseManTurret = eventWizard(
  "man-turret",
  () =>
    [
      [PlayerEntDef, AuthorityDef],
      [TurretDef, AuthorityDef],
    ] as const,
  ([player, turret]) => {
    const localPlayer = EM.getResource(LocalPlayerDef);
    if (localPlayer?.playerId === player.id) {
      const camera = EM.getResource(CameraDef)!;
      quat.identity(camera.rotation);
      camera.targetId = turret.id;

      turret.authority.pid = player.authority.pid;
      turret.authority.seq++;
      turret.authority.updateSeq = 0;
    }
    player.player.manning = true;
    turret.turret.mannedId = player.id;
  },
  {
    legalEvent: ([player, turret]) => {
      return turret.turret.mannedId === 0;
    },
  }
);

export const raiseUnmanTurret = eventWizard(
  "unman-turret",
  () => [[PlayerEntDef], [TurretDef]] as const,
  ([player, turret]) => {
    const camera = EM.getResource(CameraDef);
    if (camera?.targetId === turret.id) {
      quat.identity(camera.rotation);
      camera.targetId = 0;
    }
    player.player.manning = false;
    turret.turret.mannedId = 0;
  },
  {
    legalEvent: ([player, turret]) => {
      return turret.turret.mannedId === player.id;
    },
  }
);

export function registerTurretSystems(em: EntityManager) {
  em.registerSystem(
    [TurretDef, RotationDef, YawPitchDef],
    [],
    (turrets, res) => {
      for (let c of turrets) {
        quat.copy(c.rotation, quat.IDENTITY);
        quat.rotateY(c.rotation, c.rotation, c.yawpitch.yaw);
        quat.rotateZ(c.rotation, c.rotation, c.yawpitch.pitch);
      }
    },
    "turretYawPitch"
  );

  em.registerSystem(
    [TurretDef, YawPitchDef],
    [InputsDef, CameraDef, LocalPlayerDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerEntDef])!;
      if (!player) return;
      for (let c of turrets) {
        if (DeletedDef.isOn(c)) continue;
        if (c.turret.mannedId !== player.id) continue;

        c.yawpitch.yaw += -res.inputs.mouseMovX * 0.005;
        c.yawpitch.yaw = clamp(
          c.yawpitch.yaw,
          c.turret.minYaw,
          c.turret.maxYaw
        );
        c.yawpitch.pitch += res.inputs.mouseMovY * 0.002;
        c.yawpitch.pitch = clamp(
          c.yawpitch.pitch,
          c.turret.minPitch,
          c.turret.maxPitch
        );

        quat.rotateY(res.camera.rotation, quat.IDENTITY, +Math.PI / 2);
        quat.rotateX(res.camera.rotation, res.camera.rotation, -Math.PI * 0.15);
      }
    },
    "turretAim"
  );

  em.registerSystem(
    [TurretDef, InRangeDef, AuthorityDef],
    [InputsDef, LocalPlayerDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [
        PlayerEntDef,
        AuthorityDef,
      ])!;
      if (!player) return;
      for (let c of turrets) {
        if (DeletedDef.isOn(c)) continue;

        if (res.inputs.keyClicks["e"]) {
          if (c.turret.mannedId === player.id) raiseUnmanTurret(player, c);
          if (c.turret.mannedId === 0) raiseManTurret(player, c);
        }
      }
    },
    "turretManUnman"
  );
}
