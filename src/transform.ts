import { Component, EM, EntityManager } from "./entity-manager.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { Motion, MotionDef } from "./phys_motion.js";
import { Scale, ScaleDef } from "./scale.js";
import { tempVec, tempQuat } from "./temp-pool.js";

const DO_SMOOTH = true;

export const TransformWorldDef = EM.defineComponent("transformWorld", () => {
  return mat4.create();
});
export type TransformWorld = mat4;

// TODO(@darzu): implement local transform instead of Motion's position & rotation?
//  one problem is that the order in which you interleave rotation/translations matters if it
//  is all in one matrix
// transforms we might care about:
//  on mesh load, one time transform it
//  object placement in "local" space (what motion did)
//  final object placement in "global" space for the renderer
//  final object placement in "global" space for physics
const TransformLocalDef = EM.defineComponent("transformLocal", () => {
  return mat4.create();
});
type TransformLocal = mat4;

export const ParentTransformDef = EM.defineComponent(
  "parentTransform",
  (p?: number) => {
    return { id: p || 0 };
  }
);
export type ParentTransform = Component<typeof ParentTransformDef>;

export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
  return {
    locationTarget: vec3.create(),
    locationDiff: vec3.create(),
    rotationTarget: quat.create(),
    rotationDiff: quat.create(),
  };
});
export type MotionSmoothing = Component<typeof MotionSmoothingDef>;


type Transformable = {
  id: number;
  motion?: Motion;
  // transformLocal: TransformLocal;
  transformWorld: TransformWorld;
  // optional components
  // TODO(@darzu): let the query system specify optional components
  parentTransform?: ParentTransform;
  motionSmoothing?: MotionSmoothing;
  scale?: Scale;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateWorldTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  let scale = ScaleDef.isOn(o) ? o.scale.by : vec3.set(tempVec(), 1, 1, 1);

  // first, update from motion (optionally)
  if (MotionDef.isOn(o)) {
    mat4.fromRotationTranslationScale(
      o.transformWorld,
      o.motion.rotation,
      o.motion.location,
      scale
    );
  }

  if (ParentTransformDef.isOn(o) && o.parentTransform.id > 0) {
    // update relative to parent
    if (!_hasTransformed.has(o.parentTransform.id))
      updateWorldTransform(_transformables.get(o.parentTransform.id)!);

    mat4.mul(
      o.transformWorld,
      _transformables.get(o.parentTransform.id)!.transformWorld,
      o.transformWorld
    );
  } else if (DO_SMOOTH && MotionSmoothingDef.isOn(o) && MotionDef.isOn(o)) {
    // update with smoothing
    const working_quat = tempQuat();
    quat.mul(working_quat, o.motion.rotation, o.motionSmoothing.rotationDiff);
    quat.normalize(working_quat, working_quat);
    mat4.fromRotationTranslationScale(
      o.transformWorld,
      working_quat,
      vec3.add(tempVec(), o.motion.location, o.motionSmoothing.locationDiff),
      scale
    );
  }

  _hasTransformed.add(o.id);
}

export function registerUpdateTransforms(em: EntityManager) {
  // all transformLocal components need a transformWorld
  em.registerSystem(
    [TransformLocalDef],
    [],
    (objs) => {
      for (let o of objs) {
        if (!TransformWorldDef.isOn(o))
          em.addComponent(o.id, TransformWorldDef);
      }
    },
    "createWorldTransforms"
  );

  // calculate the world transform
  em.registerSystem(
    [
      TransformWorldDef,
      // TODO(@darzu): USE transformLocal
      // TransformLocalDef,
    ],
    [],
    (objs) => {
      _transformables.clear();
      _hasTransformed.clear();

      for (let o of objs) {
        _transformables.set(o.id, o);
      }

      for (let o of objs) {
        updateWorldTransform(o);
      }
    },
    "updateWorldTransforms"
  );
}
