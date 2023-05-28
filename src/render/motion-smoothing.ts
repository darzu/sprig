import { EntityManager, EM, Component, Entity } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import {
  PositionDef,
  PhysicsParentDef,
  RotationDef,
  TransformDef,
  copyFrame,
  updateFrameFromPosRotScale,
  updateFrameFromTransform,
} from "../physics/transform.js";
import { computeNewError, reduceError } from "../utils/smoothing.js";
import { RemoteUpdatesDef } from "../net/components.js";
import { Phase } from "../ecs/sys-phase.js";
import { RenderableDef } from "./renderer-ecs.js";
import { DONT_SMOOTH_WORLD_FRAME } from "../flags.js";
import { DeletedDef } from "../ecs/delete.js";
import { createFrame } from "../physics/nonintersection.js";

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

export function initNetMotionRecordingSystem(em: EntityManager) {
  em.addSystem(
    "recordPreviousLocations",
    Phase.NETWORK,
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

const _hasRendererWorldFrame = new Set();

export const SmoothedWorldFrameDef = EM.defineComponent(
  "smoothedWorldFrame",
  () => createFrame()
);

export const PrevSmoothedWorldFrameDef = EM.defineComponent(
  "prevSmoothedWorldFrame",
  () => createFrame()
);

function updateSmoothedWorldFrame(em: EntityManager, o: Entity) {
  if (DeletedDef.isOn(o)) return;
  if (!TransformDef.isOn(o)) return;
  let parent = null;
  if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
    if (!_hasRendererWorldFrame.has(o.physicsParent.id)) {
      updateSmoothedWorldFrame(em, em.findEntity(o.physicsParent.id, [])!);
    }
    parent = em.findEntity(o.physicsParent.id, [SmoothedWorldFrameDef]);
    if (!parent) return;
  }
  let firstFrame = false;
  if (!SmoothedWorldFrameDef.isOn(o)) firstFrame = true;
  em.ensureComponentOn(o, SmoothedWorldFrameDef);
  em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
  copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  mat4.copy(o.smoothedWorldFrame.transform, o.transform);
  updateFrameFromTransform(o.smoothedWorldFrame);
  if (MotionSmoothingDef.isOn(o)) {
    vec3.add(
      o.smoothedWorldFrame.position,
      o.motionSmoothing.positionError,
      o.smoothedWorldFrame.position
    );
    quat.mul(
      o.smoothedWorldFrame.rotation,
      o.motionSmoothing.rotationError,
      o.smoothedWorldFrame.rotation
    );
    updateFrameFromPosRotScale(o.smoothedWorldFrame);
  }
  if (parent) {
    mat4.mul(
      parent.smoothedWorldFrame.transform,
      o.smoothedWorldFrame.transform,
      o.smoothedWorldFrame.transform
    );
    updateFrameFromTransform(o.smoothedWorldFrame);
  }
  if (firstFrame) copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  _hasRendererWorldFrame.add(o.id);
}

export function initMotionSmoothingSystems(em: EntityManager) {
  em.addSystem(
    "smoothMotion",
    Phase.PRE_RENDER,
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

  em.addSystem(
    "updateMotionSmoothing",
    Phase.PRE_RENDER,
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

  em.addSystem(
    "updateSmoothedWorldFrames",
    Phase.PRE_RENDER,
    [RenderableDef, TransformDef],
    [],
    (objs, res) => {
      _hasRendererWorldFrame.clear();

      for (const o of objs) {
        // TODO(@darzu): PERF HACK!
        if (DONT_SMOOTH_WORLD_FRAME) {
          em.ensureComponentOn(o, SmoothedWorldFrameDef);
          em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
          continue;
        }

        updateSmoothedWorldFrame(em, o);
      }
    }
  );
}
