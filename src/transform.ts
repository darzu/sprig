import { Component, EM, EntityManager } from "./entity-manager.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { Motion, MotionDef } from "./phys_motion.js";
import { Scale, ScaleDef } from "./scale.js";
import { tempVec, tempQuat } from "./temp-pool.js";

const DO_SMOOTH = true;

export const TransformDef = EM.defineComponent("transform", () => {
  return mat4.create();
});
export type Transform = mat4;

export const ParentDef = EM.defineComponent("parent", (p?: number) => {
  return { id: p || 0 };
});
export type Parent = Component<typeof ParentDef>;

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
  transform: Transform;
  // optional components
  // TODO(@darzu): let the query system specify optional components
  parent?: Parent;
  motionSmoothing?: MotionSmoothing;
  scale?: Scale;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  let scale = ScaleDef.isOn(o) ? o.scale.by : vec3.set(tempVec(), 1, 1, 1);

  // first, update from motion (optionally)
  if (MotionDef.isOn(o)) {
    mat4.fromRotationTranslationScale(
      o.transform,
      o.motion.rotation,
      o.motion.location,
      scale
    );
  }

  if (ParentDef.isOn(o) && o.parent.id > 0) {
    // update relative to parent
    if (!_hasTransformed.has(o.parent.id))
      updateTransform(_transformables.get(o.parent.id)!);

    mat4.mul(
      o.transform,
      _transformables.get(o.parent.id)!.transform,
      o.transform
    );
  } else if (DO_SMOOTH && o.motionSmoothing && MotionDef.isOn(o)) {
    // update with smoothing
    const working_quat = tempQuat();
    quat.mul(working_quat, o.motion.rotation, o.motionSmoothing.rotationDiff);
    quat.normalize(working_quat, working_quat);
    mat4.fromRotationTranslationScale(
      o.transform,
      working_quat,
      vec3.add(tempVec(), o.motion.location, o.motionSmoothing.locationDiff),
      scale
    );
  }

  _hasTransformed.add(o.id);
}

function updateTransforms(objs: Transformable[]) {
  _transformables.clear();
  _hasTransformed.clear();

  for (let o of objs) {
    _transformables.set(o.id, o);
  }

  for (let o of objs) {
    updateTransform(o);
  }
}

export function registerUpdateTransforms(em: EntityManager) {
  em.registerSystem([TransformDef], [], updateTransforms);
}
