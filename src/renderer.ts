import { ComponentDef, EntityManager, EM, TimeDef } from "./entity-manager.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { Mesh } from "./mesh-pool.js";
import { Motion, MotionDef } from "./phys_motion.js";
import { tempQuat, tempVec } from "./temp-pool.js";

export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

const SMOOTH = true;

export const TransformDef = EM.defineComponent("transform", () => {
  return mat4.create();
});
export type Transform = mat4;

export const MotionErrorDef = EM.defineComponent("motionError", () => {
  return {
    rotation_error: quat.create(),
    location_error: vec3.create(),
  };
});
export type MotionError = Component<typeof MotionErrorDef>;

export const ParentDef = EM.defineComponent("parent", () => {
  return { id: 0 };
});
export type Parent = Component<typeof ParentDef>;

export const RenderableDef = EM.defineComponent("renderable", () => {
  return {
    mesh: {
      pos: [],
      tri: [],
      colors: [],
    } as Mesh,
  };
});
export type Renderable = Component<typeof RenderableDef>;

type Transformable = {
  id: number;
  motion: Motion;
  transform: Transform;
  renderable: Renderable;
  parent: Parent;
  motionError: MotionError;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  // update transform based on new rotations and positions
  if (o.parent.id > 0) {
    if (!_hasTransformed.has(o.parent.id))
      updateTransform(_transformables.get(o.parent.id)!);

    mat4.fromRotationTranslation(
      o.transform,
      o.motion.rotation,
      o.motion.location
    );
    mat4.mul(
      o.transform,
      _transformables.get(o.parent.id)!.transform,
      o.transform
    );
  } else if (SMOOTH) {
    const working_quat = tempQuat();
    quat.mul(working_quat, o.motion.rotation, o.motionError.rotation_error);
    quat.normalize(working_quat, working_quat);
    mat4.fromRotationTranslation(
      o.transform,
      working_quat,
      vec3.add(tempVec(), o.motion.location, o.motionError.location_error)
    );
  } else {
    mat4.fromRotationTranslation(
      o.transform,
      o.motion.rotation,
      o.motion.location
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
  em.registerSystem(
    [MotionDef, TransformDef, RenderableDef, ParentDef, MotionErrorDef],
    [],
    updateTransforms
  );
}

interface RenderableObj {
  renderable: Renderable;
  transform: Transform;
}

function stepRenderer(
  objs: RenderableObj[],
  { time }: { time: { dt: number } }
) {
  // TODO(@darzu):
}

export function registerRenderer() {
  EM.registerSystem([RenderableDef, TransformDef], [TimeDef], stepRenderer);
}
