import { Component, EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { WorldFrameDef } from "./nonintersection.js";
import { tempVec3, tempQuat } from "../matrix/temp-pool.js";
import { FALSE, dbgLogOnce } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";

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
  f.transform = mat4.fromRotationTranslationScale(
    f.rotation,
    f.position,
    f.scale,
    f.transform
  );
}
export function createFrame(): Frame {
  return {
    position: vec3.create(),
    rotation: quat.create(),
    scale: V(1, 1, 1),
    transform: mat4.create(),
  };
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
export const TransformDef = EM.defineComponent2(
  "transform",
  () => mat4.create(),
  (p, t?: mat4.InputT) => (t ? mat4.copy(p, t) : p)
);
export type Transform = mat4;

// POSITION
export const PositionDef = EM.defineComponent2(
  "position",
  () => V(0, 0, 0),
  (p, v?: vec3.InputT) => (v ? vec3.copy(p, v) : p)
);
export type Position = Component<typeof PositionDef>;
EM.registerSerializerPair(
  PositionDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

// ROTATION
export const RotationDef = EM.defineComponent2(
  "rotation",
  () => quat.create(),
  (p, r?: quat.InputT) => (r ? quat.copy(p, r) : p)
);
export type Rotation = Component<typeof RotationDef>;
EM.registerSerializerPair(
  RotationDef,
  (o, buf) => buf.writeQuat(o),
  (o, buf) => buf.readQuat(o)
);

// SCALE
export const ScaleDef = EM.defineComponent2(
  "scale",
  () => V(1, 1, 1),
  (p, by?: vec3.InputT) => (by ? vec3.copy(p, by) : p)
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
export const PhysicsParentDef = EM.defineComponent2(
  "physicsParent",
  () => {
    return { id: 0 };
  },
  (p, parentId?: number) => {
    if (parentId) p.id = parentId;
    return p;
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

export function registerInitTransforms() {
  // TODO(@darzu): WorldFrame should be optional, only needed
  //  for parented objs (which is maybe the uncommon case).
  EM.addSystem(
    "ensureWorldFrame",
    Phase.PRE_PHYSICS,
    [...LocalFrameDefs],
    [],
    (objs) => {
      for (let o of objs) {
        if (!WorldFrameDef.isOn(o)) {
          EM.ensureComponentOn(o, WorldFrameDef);
          copyFrame(o.world, o);
        }
      }
    }
  );
}
export function registerUpdateLocalFromPosRotScale() {
  EM.addSystem(
    "ensureFillOutLocalFrame",
    Phase.PRE_PHYSICS,
    null,
    [],
    (objs) => {
      // TODO(@darzu): PERF. Hacky custom query! Not cached n stuff.
      for (let o of EM.entities.values()) {
        if (!o.id) continue;
        // TODO(@darzu): do we really want these on every entity?
        if (
          PositionDef.isOn(o) ||
          RotationDef.isOn(o) ||
          ScaleDef.isOn(o) ||
          TransformDef.isOn(o)
        ) {
          EM.ensureComponentOn(o, PositionDef);
          EM.ensureComponentOn(o, RotationDef);
          EM.ensureComponentOn(o, ScaleDef);
          EM.ensureComponentOn(o, TransformDef);
        }
      }
    }
  );

  // calculate the world transform
  EM.addSystem(
    "updateLocalFromPosRotScale",
    Phase.PHYSICS_FINISH_LOCAL,
    [...LocalFrameDefs],
    [],
    (objs) => {
      for (let o of objs) updateFrameFromPosRotScale(o);
    }
  );
}

export function registerUpdateWorldFromLocalAndParent(
  suffix: string,
  phase: Phase
) {
  // calculate the world transform
  EM.addSystem(
    "updateWorldFromLocalAndParent" + suffix,
    phase,
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
    }
  );
}
