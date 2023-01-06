import {
  EM,
  EntityManager,
  Entity,
  EntityW,
  Component,
} from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
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
import {
  CameraFollowDef,
  CAMERA_OFFSETS,
  setCameraFollowPosition,
} from "../camera.js";
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
    cameraYawOffset: 0,
    cameraPitchOffset: 0,
    invertYaw: false,
    cameraYawFactor: 0,
  };
});

export function constructNetTurret(
  e: Entity,
  startYaw: number,
  startPitch: number,
  aabbOrInteractionEntity: AABB | Entity,
  cameraYawOffset: number = 0,
  cameraPitchOffset: number = -Math.PI / 8,
  cameraYawFactor: number = 0,
  cameraFollowOffset: vec3 = CAMERA_OFFSETS.thirdPersonOverShoulder
): asserts e is EntityW<
  [
    typeof TurretDef,
    typeof YawPitchDef,
    typeof InteractableDef,
    typeof SyncDef,
    typeof RotationDef
  ]
> {
  EM.set(e, YawPitchDef);
  e.yawpitch.yaw = startYaw;
  e.yawpitch.pitch = startPitch;
  EM.set(e, TurretDef);
  e.turret.minYaw += startYaw;
  e.turret.maxYaw += startYaw;
  e.turret.cameraYawOffset = cameraYawOffset;
  e.turret.cameraPitchOffset = cameraPitchOffset;
  e.turret.cameraYawFactor = cameraYawFactor;

  EM.set(e, RotationDef);
  EM.set(e, SyncDef);
  e.sync.dynamicComponents.push(YawPitchDef.id);

  // setup camera params
  EM.set(e, CameraFollowDef, 0);
  vec3.copy(e.cameraFollow.positionOffset, cameraFollowOffset);
  e.cameraFollow.yawOffset = cameraYawOffset;
  e.cameraFollow.pitchOffset = cameraPitchOffset;

  let interactBox: Entity;
  // create separate hitbox for interacting with the turret
  if ("min" in aabbOrInteractionEntity) {
    interactBox = EM.newEntity();
    const interactAABB = copyAABB(createAABB(), aabbOrInteractionEntity);
    vec3.scale(interactAABB.min, 2, interactAABB.min);
    vec3.scale(interactAABB.max, 2, interactAABB.max);
    EM.set(interactBox, PhysicsParentDef, e.id);
    EM.set(interactBox, PositionDef, vec3.clone([0, 0, 0]));
    EM.set(interactBox, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: interactAABB,
    });
  } else {
    interactBox = aabbOrInteractionEntity;
  }
  EM.set(e, InteractableDef);
  e.interaction.colliderId = interactBox.id;
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
        if (c.turret.invertYaw)
          yawpitchToQuat(c.rotation, {
            yaw: -c.yawpitch.yaw,
            pitch: c.yawpitch.pitch,
          });
        else yawpitchToQuat(c.rotation, c.yawpitch);
      }
    },
    "turretYawPitch"
  );

  em.registerSystem(
    [TurretDef, YawPitchDef, CameraFollowDef],
    [InputsDef, LocalPlayerDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [PlayerDef])!;
      if (!player) return;
      for (let c of turrets) {
        if (DeletedDef.isOn(c)) continue;
        if (c.turret.mannedId !== player.id) continue;

        c.yawpitch.yaw += -res.inputs.mouseMov[0] * 0.005;
        c.yawpitch.yaw = clamp(
          c.yawpitch.yaw,
          c.turret.minYaw,
          c.turret.maxYaw
        );
        c.yawpitch.pitch += -res.inputs.mouseMov[1] * 0.002;
        c.yawpitch.pitch = clamp(
          c.yawpitch.pitch,
          c.turret.minPitch,
          c.turret.maxPitch
        );

        c.cameraFollow.yawOffset =
          c.turret.cameraYawOffset + c.yawpitch.yaw * c.turret.cameraYawFactor;
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
