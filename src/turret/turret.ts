import {
  EM,
  EntityManager,
  Entity,
  EntityW,
  Component,
} from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, SyncDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { InRangeDef, InteractableDef } from "../games/interact.js";
import { LocalPlayerDef, PlayerDef } from "../games/player.js";
import {
  CameraFollowDef,
  CAMERA_OFFSETS,
  setCameraFollowPosition,
} from "../camera/camera.js";
import { AABB, copyAABB, createAABB } from "../physics/aabb.js";
import { InputsDef } from "../input/inputs.js";
import { clamp } from "../utils/math.js";
import { DeletedDef } from "../ecs/delete.js";
import { defineSerializableComponent } from "../ecs/em_helpers.js";
import { YawPitchDef, yawpitchToQuat } from "./yawpitch.js";
import { TextDef } from "../games/ui.js";

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
    keyboardControls: false,
    keyboardSpeed: 1,
    helpText: "",
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
  cameraFollowOffset: vec3 = CAMERA_OFFSETS.thirdPersonOverShoulder,
  keyboardControls: boolean = false,
  keyboardSpeed: number = 1,
  yawRange: number = Math.PI,
  helpText: string = ""
): asserts e is EntityW<
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
  e.turret.minYaw = startYaw - yawRange / 2;
  e.turret.maxYaw = startYaw + yawRange / 2;
  e.turret.cameraYawOffset = cameraYawOffset;
  e.turret.cameraPitchOffset = cameraPitchOffset;
  e.turret.cameraYawFactor = cameraYawFactor;
  e.turret.keyboardControls = keyboardControls;
  e.turret.keyboardSpeed = keyboardSpeed;
  e.turret.helpText = helpText;

  EM.ensureComponentOn(e, RotationDef);
  EM.ensureComponentOn(e, SyncDef);
  e.sync.dynamicComponents.push(YawPitchDef.id);

  // setup camera params
  EM.ensureComponentOn(e, CameraFollowDef, 0);
  vec3.copy(e.cameraFollow.positionOffset, cameraFollowOffset);
  e.cameraFollow.yawOffset = cameraYawOffset;
  e.cameraFollow.pitchOffset = cameraPitchOffset;

  let interactBox: Entity;
  // create separate hitbox for interacting with the turret
  if ("min" in aabbOrInteractionEntity) {
    interactBox = EM.new();
    const interactAABB = copyAABB(createAABB(), aabbOrInteractionEntity);
    vec3.scale(interactAABB.min, 2, interactAABB.min);
    vec3.scale(interactAABB.max, 2, interactAABB.max);
    EM.ensureComponentOn(interactBox, PhysicsParentDef, e.id);
    EM.ensureComponentOn(interactBox, PositionDef, V(0, 0, 0));
    EM.ensureComponentOn(interactBox, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: interactAABB,
    });
  } else {
    interactBox = aabbOrInteractionEntity;
  }
  EM.ensureComponentOn(e, InteractableDef);
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
        if (c.turret.keyboardControls) {
          if (res.inputs.keyDowns["a"])
            c.yawpitch.yaw += c.turret.keyboardSpeed * 0.005;
          if (res.inputs.keyDowns["d"])
            c.yawpitch.yaw -= c.turret.keyboardSpeed * 0.005;
        } else {
          c.yawpitch.yaw += -res.inputs.mouseMov[0] * 0.005;
        }
        c.yawpitch.yaw = clamp(
          c.yawpitch.yaw,
          c.turret.minYaw,
          c.turret.maxYaw
        );

        if (c.turret.keyboardControls) {
          if (res.inputs.keyDowns["s"])
            c.yawpitch.pitch -= c.turret.keyboardSpeed * 0.002;
          if (res.inputs.keyDowns["w"])
            c.yawpitch.pitch += c.turret.keyboardSpeed * 0.002;
        } else {
          c.yawpitch.pitch += -res.inputs.mouseMov[1] * 0.002;
        }
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
    [InputsDef, LocalPlayerDef, TextDef],
    (turrets, res) => {
      const player = em.findEntity(res.localPlayer.playerId, [
        PlayerDef,
        AuthorityDef,
      ])!;
      if (!player) return;
      for (let c of turrets) {
        if (DeletedDef.isOn(c)) continue;

        if (res.inputs.keyClicks["e"]) {
          if (c.turret.mannedId === player.id) {
            // TODO(@darzu): HACK. shouldn't have the non-turret help text in here
            res.text.lowerText =
              "W/A/S/D: move, mouse: look, E: use rudder or cannon, shift: run";
            raiseUnmanTurret(player, c);
          }
          if (c.turret.mannedId === 0) {
            res.text.lowerText = c.turret.helpText;
            raiseManTurret(player, c);
          }
        }
      }
    },
    "turretManUnman"
  );
}
