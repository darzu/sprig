import { EntityManager, EM, Component } from "./entity-manager.js";
import { vec3, quat, mat4 } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/nonintersection.js";
import { tempQuat, tempVec } from "./temp-pool.js";
import { Timer, PhysicsTimerDef } from "./time.js";
import {
  Position,
  Rotation,
  PositionDef,
  PhysicsParentDef,
  RotationDef,
  ScaleDef,
} from "./physics/transform.js";
import { computeNewError, reduceError } from "./smoothing.js";
import { RemoteUpdatesDef } from "./net/components.js";

// Determined via binary search--smaller -> jerky, larger -> floaty
const ERROR_SMOOTHING_FACTOR = 0.75 ** (60 / 1000);

export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
  return {
    havePrevious: false,
    prevParentId: 0,
    prevPosition: vec3.create(),
    prevRotation: quat.create(),

    positionError: vec3.create(),
    rotationError: quat.create(),
  };
});
export type MotionSmoothing = Component<typeof MotionSmoothingDef>;

export function registerMotionSmoothingRecordLocationsSystem(
  em: EntityManager
) {
  em.registerSystem(
    [MotionSmoothingDef],
    [],
    (es) => {
      for (let e of es) {
        e.motionSmoothing.havePrevious = true;
        if (PositionDef.isOn(e))
          vec3.copy(e.motionSmoothing.prevPosition, e.position);
        if (RotationDef.isOn(e))
          quat.copy(e.motionSmoothing.prevRotation, e.rotation);
        e.motionSmoothing.prevParentId = PhysicsParentDef.isOn(e)
          ? e.physicsParent.id
          : 0;
      }
    },
    "recordPreviousLocations"
  );
}

export function registerMotionSmoothingSystems(em: EntityManager) {
  em.registerSystem(
    [MotionSmoothingDef],
    [PhysicsTimerDef],
    (es, res) => {
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.steps * res.physicsTimer.period;
      for (let e of es) {
        reduceError(
          e.motionSmoothing.positionError,
          dt,
          ERROR_SMOOTHING_FACTOR
        );
        reduceError(
          e.motionSmoothing.rotationError,
          dt,
          ERROR_SMOOTHING_FACTOR
        );
      }
    },
    "smoothMotion"
  );

  em.registerSystem(
    [MotionSmoothingDef],
    [],
    (es) => {
      for (let e of es) {
        if (RemoteUpdatesDef.isOn(e) && e.motionSmoothing.havePrevious) {
          const parentId = PhysicsParentDef.isOn(e) ? e.physicsParent.id : 0;
          if (parentId === e.motionSmoothing.prevParentId) {
            computeNewError(
              e.motionSmoothing.prevPosition,
              PositionDef.isOn(e) ? e.position : vec3.create(),
              e.motionSmoothing.positionError
            );
            computeNewError(
              e.motionSmoothing.prevRotation,
              RotationDef.isOn(e) ? e.rotation : quat.identity(quat.create()),
              e.motionSmoothing.rotationError
            );
          } else {
            // if we change parents just snap to the new location
            vec3.set(e.motionSmoothing.positionError, 0, 0, 0);
            quat.identity(e.motionSmoothing.rotationError);
          }
        }
      }
    },
    "updateMotionSmoothing"
  );
}
