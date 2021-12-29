import { EntityManager, EM, Component } from "./entity-manager.js";
import { vec3, quat, mat4 } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/phys_nonintersection.js";
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

const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;

export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
  return {
    positionTarget: vec3.create(),
    positionDiff: vec3.create(),
    rotationTarget: quat.create(),
    rotationDiff: quat.create(),
  };
});
export type MotionSmoothing = Component<typeof MotionSmoothingDef>;

function updateLocSmoothingTarget(
  oldTarget: vec3,
  diff: vec3,
  newTarget: vec3
) {
  vec3.add(oldTarget, oldTarget, diff);
  vec3.sub(oldTarget, oldTarget, newTarget);
  // The order of these copies is important. At this point, the calculated
  // position error actually lives in loc. So we copy it over
  // to locErr, then copy the new position into loc.
  vec3.copy(diff, oldTarget);
  vec3.copy(oldTarget, newTarget);
}
function updateRotSmoothingTarget(
  oldTarget: quat,
  diff: quat,
  newTarget: quat
) {
  quat.mul(oldTarget, oldTarget, diff);
  // sort of a hack--reuse our current rotation error quat to store the
  // rotation inverse to avoid a quat alposition
  quat.invert(diff, newTarget);
  quat.mul(oldTarget, oldTarget, diff);
  // The order of these copies is important--see the similar comment in
  // snapLocation above.
  quat.copy(diff, oldTarget);
  oldTarget = quat.copy(oldTarget, newTarget);
}

function updateSmoothingTargetSmoothChange(
  objs: {
    position: Position;
    rotation?: Rotation;
    motionSmoothing: MotionSmoothing;
  }[]
) {
  for (let o of objs) {
    updateLocSmoothingTarget(
      o.motionSmoothing.positionTarget,
      o.motionSmoothing.positionDiff,
      o.position
    );
    if (o.rotation) {
      updateRotSmoothingTarget(
        o.motionSmoothing.rotationTarget,
        o.motionSmoothing.rotationDiff,
        o.rotation
      );
    }
  }
}
function updateSmoothingTargetSnapChange(
  objs: {
    position: Position;
    rotation?: Rotation;
    motionSmoothing: MotionSmoothing;
  }[]
) {
  for (let o of objs) {
    vec3.copy(o.motionSmoothing.positionTarget, o.position);
    if (o.rotation) quat.copy(o.motionSmoothing.rotationTarget, o.rotation);
  }
}

function updateSmoothingLerp(
  objs: {
    motionSmoothing: MotionSmoothing;
  }[],
  resources: { physicsTimer: Timer }
) {
  const {
    physicsTimer: { period: dt },
  } = resources;

  for (let o of objs) {
    // lerp position
    const { positionDiff, rotationDiff } = o.motionSmoothing;
    vec3.scale(positionDiff, positionDiff, ERROR_SMOOTHING_FACTOR ** dt);
    let position_error_magnitude = vec3.length(positionDiff);
    if (position_error_magnitude !== 0 && position_error_magnitude < EPSILON) {
      //console.log(`Object ${id} reached 0 position error`);
      vec3.set(positionDiff, 0, 0, 0);
    }

    // lerp rotation
    const identity_quat = quat.identity(tempQuat());
    quat.slerp(
      rotationDiff,
      rotationDiff,
      identity_quat,
      1 - ERROR_SMOOTHING_FACTOR ** dt
    );
    quat.normalize(rotationDiff, rotationDiff);
    let rotation_error_magnitude = Math.abs(
      quat.getAngle(rotationDiff, identity_quat)
    );
    if (rotation_error_magnitude !== 0 && rotation_error_magnitude < EPSILON) {
      //console.log(`Object ${id} reached 0 rotation error`);
      quat.copy(rotationDiff, identity_quat);
    }
  }
}

export function registerUpdateSmoothingTargetSnapChange(em: EntityManager) {
  em.registerSystem(
    [PositionDef, MotionSmoothingDef],
    [],
    updateSmoothingTargetSnapChange
  );
}
export function registerUpdateSmoothingTargetSmoothChange(em: EntityManager) {
  em.registerSystem(
    [PositionDef, MotionSmoothingDef],
    [],
    updateSmoothingTargetSmoothChange
  );
}
export function registerUpdateSmoothingLerp(em: EntityManager) {
  em.registerSystem(
    [MotionSmoothingDef],
    [PhysicsTimerDef],
    (objs, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++)
        updateSmoothingLerp(objs, res);
    },
    "updateSmoothingLerp"
  );
}

export function registerUpdateSmoothedTransform(em: EntityManager) {
  em.registerSystem(
    [WorldFrameDef, MotionSmoothingDef, PositionDef],
    [],
    (objs) => {
      for (let o of objs) {
        // don't smooth when parented
        if (PhysicsParentDef.isOn(o)) return;

        // update with smoothing
        // TODO(@darzu): seperate the smoothed result from the snapped result for rendering vs physics respectively
        const rotation = RotationDef.isOn(o)
          ? o.rotation
          : quat.identity(tempQuat());
        const smoothRot = tempQuat();
        quat.mul(smoothRot, rotation, o.motionSmoothing.rotationDiff);
        quat.normalize(smoothRot, smoothRot);
        // TODO(@darzu): don't mutate the world frame here
        mat4.fromRotationTranslationScale(
          o.world.transform,
          smoothRot,
          vec3.add(tempVec(), o.position, o.motionSmoothing.positionDiff),
          ScaleDef.isOn(o) ? o.scale : vec3.set(tempVec(), 1, 1, 1)
        );
      }
    },
    "updateSmoothedTransform"
  );
}
