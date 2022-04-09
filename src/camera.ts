import { Component, EM, EntityManager } from "./entity-manager.js";
import { LocalPlayerDef } from "./game/player.js";
import { quat, vec3 } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/nonintersection.js";
import { computeNewError, reduceError } from "./smoothing.js";
import { tempQuat } from "./temp-pool.js";
import { PhysicsTimerDef } from "./time.js";

export type PerspectiveMode = "perspective" | "ortho";
export type CameraMode = "thirdPerson" | "thirdPersonOverShoulder";

export const CameraDef = EM.defineComponent("camera", () => {
  return {
    rotation: quat.rotateX(
      quat.create(),
      quat.identity(tempQuat()),
      -Math.PI / 8
    ),
    offset: vec3.create(),
    cameraMode: "thirdPersonOverShoulder" as CameraMode,
    perspectiveMode: "perspective" as PerspectiveMode,
    targetId: 0,
    prevTargetId: 0,
    lastRotation: quat.create(),
    lastOffset: vec3.create(),
    targetRotationError: quat.identity(quat.create()),
    targetPositionError: vec3.create(),
    cameraRotationError: quat.identity(quat.create()),
    cameraOffsetError: vec3.create(),
  };
});
export type CameraProps = Component<typeof CameraDef>;

export function registerRetargetCameraSystems(em: EntityManager) {
  em.registerSystem(
    null,
    [CameraDef, PhysicsTimerDef],
    function ([], res) {
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.steps * res.physicsTimer.period;
      reduceError(res.camera.targetPositionError, dt);
      reduceError(res.camera.targetRotationError, dt);
      reduceError(res.camera.cameraOffsetError, dt);
      reduceError(res.camera.cameraRotationError, dt);
    },
    "smoothCamera"
  );

  em.registerSystem(
    null,
    [CameraDef, LocalPlayerDef],
    function ([], res) {
      if (res.camera.prevTargetId === res.camera.targetId) {
        quat.copy(res.camera.lastRotation, res.camera.rotation);
        vec3.copy(res.camera.lastOffset, res.camera.offset);
        return;
      }
      console.log("updating camera");
      const prevTarget = em.findEntity(
        res.camera.prevTargetId || res.localPlayer.playerId,
        [WorldFrameDef]
      )!;
      const newTarget = em.findEntity(
        res.camera.targetId || res.localPlayer.playerId,
        [WorldFrameDef]
      )!;

      computeNewError(
        prevTarget.world.position,
        newTarget.world.position,
        res.camera.targetPositionError
      );

      computeNewError(
        prevTarget.world.rotation,
        newTarget.world.rotation,
        res.camera.targetRotationError
      );

      computeNewError(
        res.camera.lastOffset,
        res.camera.offset,
        res.camera.cameraOffsetError
      );
      computeNewError(
        res.camera.lastRotation,
        res.camera.rotation,
        res.camera.cameraRotationError
      );

      res.camera.prevTargetId = res.camera.targetId;
    },
    "retargetCamera"
  );
}
