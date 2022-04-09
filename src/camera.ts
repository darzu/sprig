import { Component, EM, EntityManager, EntityW } from "./entity-manager.js";
import { LocalPlayerDef } from "./game/player.js";
import { quat, vec3, ReadonlyQuat } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/nonintersection.js";
import { tempQuat, tempVec } from "./temp-pool.js";
import { PhysicsTimerDef } from "./time.js";

export type PerspectiveMode = "perspective" | "ortho";
export type CameraMode = "thirdPerson" | "thirdPersonOverShoulder";

// TODO: consider importing these from smoothing.ts
const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;

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

const identityQuat: ReadonlyQuat = quat.identity(quat.create());

function isVec3(v: quat | vec3): v is vec3 {
  return v.length === 3;
}

function reduceError(v: quat | vec3, dt: number) {
  if (isVec3(v)) {
    const magnitude = vec3.length(v);
    if (magnitude > EPSILON) {
      vec3.scale(v, v, ERROR_SMOOTHING_FACTOR ** dt);
    } else if (magnitude > 0) {
      vec3.set(v, 0, 0, 0);
    }
  } else {
    const magnitude = Math.abs(quat.getAngle(v, identityQuat));
    if (magnitude > EPSILON) {
      quat.slerp(v, v, identityQuat, 1 - ERROR_SMOOTHING_FACTOR ** dt);
      quat.normalize(v, v);
    } else if (magnitude > 0) {
      quat.copy(v, identityQuat);
    }
  }
}

function computeNewError(old: quat, curr: quat, error: quat): void;
function computeNewError(old: vec3, curr: vec3, error: vec3): void;
function computeNewError(
  old: vec3 | quat,
  curr: vec3 | quat,
  error: vec3 | quat
) {
  if (isVec3(old)) {
    vec3.add(error as vec3, error as vec3, old);
    vec3.sub(error as vec3, error as vec3, curr as vec3);
  } else {
    const prevComputed = quat.mul(tempQuat(), old, error as quat);
    quat.invert(error as quat, curr as quat);
    quat.mul(prevComputed, error as quat, prevComputed);
    quat.copy(error as quat, prevComputed);
    quat.normalize(error as quat, error as quat);
  }
}

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
