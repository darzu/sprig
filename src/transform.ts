import { Component, EM, EntityManager } from "./entity-manager.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { tempVec, tempQuat } from "./temp-pool.js";

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
// const TransformLocalDef = EM.defineComponent("transformLocal", () => {
//   return mat4.create();
// });
// type TransformLocal = mat4;

// POSITION
export const PositionDef = EM.defineComponent(
  "position",
  (p?: vec3) => p || vec3.fromValues(0, 0, 0)
);
export type Position = Component<typeof PositionDef>;
EM.registerSerializerPair(
  PositionDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

// ROTATION
export const RotationDef = EM.defineComponent(
  "rotation",
  (r?: quat) => r || quat.create()
);
export type Rotation = Component<typeof RotationDef>;
EM.registerSerializerPair(
  RotationDef,
  (o, buf) => buf.writeQuat(o),
  (o, buf) => buf.readQuat(o)
);

// SCALE
export const ScaleDef = EM.defineComponent(
  "scale",
  (by?: vec3) => by || vec3.fromValues(1, 1, 1)
);
export type Scale = Component<typeof ScaleDef>;
EM.registerSerializerPair(
  ScaleDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

export const ParentTransformDef = EM.defineComponent(
  "parentTransform",
  (p?: number) => {
    return { id: p || 0 };
  }
);
export type ParentTransform = Component<typeof ParentTransformDef>;

type Transformable = {
  id: number;
  position?: Position;
  rotation?: Rotation;
  // transformLocal: TransformLocal;
  transformWorld: TransformWorld;
  // optional components
  // TODO(@darzu): let the query system specify optional components
  parentTransform?: ParentTransform;
  scale?: Scale;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateWorldTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  // first, update from motion (optionally)
  if (PositionDef.isOn(o)) {
    mat4.fromRotationTranslationScale(
      o.transformWorld,
      RotationDef.isOn(o) ? o.rotation : quat.identity(tempQuat()),
      o.position,
      ScaleDef.isOn(o) ? o.scale : vec3.set(tempVec(), 1, 1, 1)
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
  }

  _hasTransformed.add(o.id);
}

export function registerUpdateTransforms(em: EntityManager, suffix: string) {
  // TODO(@darzu): do this for location, rotation, etc
  // // all transformLocal components need a transformWorld
  // em.registerSystem(
  //   [TransformLocalDef],
  //   [],
  //   (objs) => {
  //     for (let o of objs) {
  //       if (!TransformWorldDef.isOn(o))
  //         em.addComponent(o.id, TransformWorldDef);
  //     }
  //   },
  //   "createWorldTransforms"
  // );

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
    "updateWorldTransforms" + suffix
  );
}
