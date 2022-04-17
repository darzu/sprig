import {
  EM,
  EntityManager,
  Entity,
  EntityW,
  Component,
} from "../entity-manager.js";
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
import { LocalPlayerDef, PlayerDef } from "./player.js";
import { CameraFollowDef, setCameraFollowPosition } from "../camera.js";
import { AABB, copyAABB, createAABB } from "../physics/broadphase.js";
import { InputsDef } from "../inputs.js";
import { clamp } from "../math.js";
import { DeletedDef } from "../delete.js";
import { defineSerializableComponent } from "../em_helpers.js";
import { YawPitchDef, yawpitchToQuat } from "../yawpitch.js";

export const TurretDef = EM.defineComponent("turret", () => {
  return {
    mannedId: 0,
    minYaw: -Math.PI * 0.5,
    maxYaw: +Math.PI * 0.5,
    minPitch: -Math.PI * 0.1,
    maxPitch: Math.PI * 0.3,
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

  // setup camera params
  EM.ensureComponentOn(e, CameraFollowDef, 0);
  setCameraFollowPosition(e, "thirdPersonOverShoulder");
  // e.cameraFollow.yawOffset = Math.PI / 2;
  e.cameraFollow.pitchOffset = -Math.PI / 8;

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
      [PlayerDef, AuthorityDef],
      [TurretDef, CameraFollowDef, AuthorityDef],
    ] as const,
  ([player, turret]) => {
    const localPlayer = EM.getResource(LocalPlayerDef);
    if (localPlayer?.playerId === player.id) {
      turret.cameraFollow.priority = 2;
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
  () => [[PlayerDef], [TurretDef, CameraFollowDef]] as const,
  ([player, turret]) => {
    turret.cameraFollow.priority = 0;
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
        yawpitchToQuat(c.rotation, c.yawpitch);
      }
    },
    "turretYawPitch"
  );

  em.registerSystem(
    [TurretDef, YawPitchDef],
    [InputsDef, LocalPlayerDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
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
        c.yawpitch.pitch += -res.inputs.mouseMovY * 0.002;
        c.yawpitch.pitch = clamp(
          c.yawpitch.pitch,
          c.turret.minPitch,
          c.turret.maxPitch
        );
      }
    },
    "turretAim"
  );

  em.registerSystem(
    [TurretDef, InRangeDef, AuthorityDef, CameraFollowDef],
    [InputsDef, LocalPlayerDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [
        PlayerDef,
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
