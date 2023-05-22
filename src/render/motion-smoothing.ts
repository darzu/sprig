import { EntityManager, EM, Component } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import {
  PositionDef,
  PhysicsParentDef,
  RotationDef,
} from "../physics/transform.js";
import { computeNewError, reduceError } from "../utils/smoothing.js";
import { RemoteUpdatesDef } from "../net/components.js";

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
  em.registerSystem2(
    "recordPreviousLocations",
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
    }
  );
}

export function registerMotionSmoothingSystems(em: EntityManager) {
  em.registerSystem2(
    "smoothMotion",
    [MotionSmoothingDef],
    [TimeDef],
    (es, res) => {
      for (let e of es) {
        reduceError(
          e.motionSmoothing.positionError,
          res.time.dt,
          ERROR_SMOOTHING_FACTOR
        );
        reduceError(
          e.motionSmoothing.rotationError,
          res.time.dt,
          ERROR_SMOOTHING_FACTOR
        );
      }
    }
  );

  em.registerSystem2(
    "updateMotionSmoothing",
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
            vec3.set(0, 0, 0, e.motionSmoothing.positionError);
            quat.identity(e.motionSmoothing.rotationError);
          }
        }
      }
    }
  );
}