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

export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
  return {
    prevPosition: null as vec3 | null,
    positionError: vec3.create(),
    prevRotation: null as quat | null,
    rotationError: quat.create(),
  };
});
export type MotionSmoothing = Component<typeof MotionSmoothingDef>;

export function registerMotionSmoothingSystems(em: EntityManager) {
  em.registerSystem(
    [MotionSmoothingDef],
    [PhysicsTimerDef],
    (es, res) => {
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.steps * res.physicsTimer.period;
      for (let e of es) {
        reduceError(e.motionSmoothing.positionError, dt);
        reduceError(e.motionSmoothing.rotationError, dt);
      }
    },
    "smoothMotion"
  );

  em.registerSystem(
    [MotionSmoothingDef, WorldFrameDef],
    [],
    (es) => {
      for (let e of es) {
        if (RemoteUpdatesDef.isOn(e)) {
          if (e.motionSmoothing.prevPosition) {
            computeNewError(
              e.motionSmoothing.prevPosition,
              e.world.position,
              e.motionSmoothing.positionError
            );
          }
          if (e.motionSmoothing.prevRotation) {
            computeNewError(
              e.motionSmoothing.prevRotation,
              e.world.rotation,
              e.motionSmoothing.rotationError
            );
          }
        } else {
          e.motionSmoothing.prevPosition = vec3.copy(
            e.motionSmoothing.prevPosition || vec3.create(),
            e.world.position
          );
          e.motionSmoothing.prevRotation = quat.copy(
            e.motionSmoothing.prevRotation || quat.create(),
            e.world.rotation
          );
        }
      }
    },
    "updateMotionSmoothing"
  );
}
