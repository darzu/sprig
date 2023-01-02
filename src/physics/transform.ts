import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { createFrame, WorldFrameDef } from "./nonintersection.js";
import { tempVec3, tempQuat } from "../temp-pool.js";
import { FALSE, dbgLogOnce } from "../util.js";

// Axis:
//  z is positive forward
//  x is positive to the right
//  y is positive up

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

// FRAME
export interface Frame {
  transform: mat4;
  position: vec3;
  rotation: quat;
  scale: vec3;
}
export interface ReadonlyFrame {
  transform: mat4;
  position: vec3;
  rotation: quat;
  scale: vec3;
}

export const IDENTITY_FRAME: ReadonlyFrame = {
  transform: mat4.IDENTITY,
  position: vec3.ZEROS,
  rotation: quat.IDENTITY,
  scale: vec3.ONES,
};

export function updateFrameFromTransform(f: Frame): asserts f is Frame {
  f.position = mat4.getTranslation(f.transform, f.position);
  f.rotation = mat4.getRotation(f.transform, f.rotation);
  f.scale = mat4.getScaling(f.transform, f.scale);
}

export function updateFrameFromPosRotScale(f: Frame) {
  f.transform = mat4.fromRotationTranslationScale(f.rotation, f.position, f.scale, f.transform);
}

export function copyFrame(out: Frame, frame: Frame) {
  vec3.copy(out.position, frame.position);
  vec3.copy(out.scale, frame.scale);
  quat.copy(out.rotation, frame.rotation);
  mat4.copy(out.transform, frame.transform);
}

export function identityFrame(out: Frame) {
  vec3.zero(out.position);
  vec3.copy(out.scale, vec3.ONES);
  quat.identity(out.rotation);
  mat4.identity(out.transform);
}

// TRANSFORM
export const TransformDef = EM.defineComponent("transform", (t?: mat4) => {
  return t ?? mat4.create();
});
export type Transform = mat4;

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

// LOCAL FRAME HELPER
export const LocalFrameDefs = [
  PositionDef,
  RotationDef,
  ScaleDef,
  TransformDef,
] as const;

// PARENT
export const PhysicsParentDef = EM.defineComponent(
  "physicsParent",
  (p?: number) => {
    return { id: p || 0 };
  }
);
export type PhysicsParent = Component<typeof PhysicsParentDef>;
EM.registerSerializerPair(
  PhysicsParentDef,
  (o, buf) => buf.writeUint32(o.id),
  (o, buf) => (o.id = buf.readUint32())
);

type Transformable = {
  id: number;
  // transformLocal: TransformLocal;
  world: Frame;
  // optional components
  // TODO(@darzu): let the query system specify optional components
  physicsParent?: PhysicsParent;
} & Frame;

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateWorldFromLocalAndParent(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  // logOnce(`first updateWorldFromLocalAndParent for ${o.id}`);
  if (PhysicsParentDef.isOn(o) && _transformables.has(o.physicsParent.id)) {
    const parent = _transformables.get(o.physicsParent.id)!;

    // update parent first
    if (!_hasTransformed.has(o.physicsParent.id)) {
      updateWorldFromLocalAndParent(parent);
    }

    // update relative to parent
    // update relative to parent
mat4.mul(parent.world.transform, o.transform, o.world.transform);
    updateFrameFromTransform(o.world);
  } else {
    // no parent
    copyFrame(o.world, o);
  }

  _hasTransformed.add(o.id);
}

export function registerInitTransforms(em: EntityManager) {
  // TODO(@darzu): WorldFrame should be optional, only needed
  //  for parented objs (which is maybe the uncommon case).
  em.registerSystem(
    [...LocalFrameDefs],
    [],
    (objs) => {
      for (let o of objs) {
        if (!WorldFrameDef.isOn(o)) {
          em.ensureComponentOn(o, WorldFrameDef);
          copyFrame(o.world, o);
        }
      }
    },
    "ensureWorldFrame"
  );
}
export function registerUpdateLocalFromPosRotScale(
  em: EntityManager,
  suffix: string = ""
) {
  em.registerSystem(
    null,
    [],
    (objs) => {
      // TODO(@darzu): PERF. Hacky custom query! Not cached n stuff.
      for (let o of em.entities.values()) {
        if (!o.id) continue;
        // TODO(@darzu): do we really want these on every entity?
        if (
          PositionDef.isOn(o) ||
          RotationDef.isOn(o) ||
          ScaleDef.isOn(o) ||
          TransformDef.isOn(o)
        ) {
          em.ensureComponentOn(o, PositionDef);
          em.ensureComponentOn(o, RotationDef);
          em.ensureComponentOn(o, ScaleDef);
          em.ensureComponentOn(o, TransformDef);
        }
      }
    },
    "ensureFillOutLocalFrame"
  );

  // calculate the world transform
  em.registerSystem(
    [...LocalFrameDefs],
    [],
    (objs) => {
      for (let o of objs) updateFrameFromPosRotScale(o);
    },
    "updateLocalFromPosRotScale" + suffix
  );
}

export function registerUpdateWorldFromLocalAndParent(
  em: EntityManager,
  suffix: string = ""
) {
  // calculate the world transform
  em.registerSystem(
    [WorldFrameDef, ...LocalFrameDefs],
    [],
    (objs) => {
      _transformables.clear();
      _hasTransformed.clear();

      for (let o of objs) {
        _transformables.set(o.id, o);
      }

      for (let o of objs) {
        updateWorldFromLocalAndParent(o);
      }
    },
    "updateWorldFromLocalAndParent" + suffix
  );
}
