import { Component, EM, EntityManager } from "./entity-manager.js";
import {
  mat4,
  quat,
  ReadonlyMat4,
  ReadonlyQuat,
  ReadonlyVec3,
  vec3,
} from "./gl-matrix.js";
import { WorldFrameDef } from "./phys_nonintersection.js";
import { tempVec, tempQuat } from "./temp-pool.js";
import { FALSE } from "./util.js";

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
  transform: ReadonlyMat4;
  position: ReadonlyVec3;
  rotation: ReadonlyQuat;
  scale: ReadonlyVec3;
}

export const IDENTITY_FRAME: ReadonlyFrame = {
  transform: mat4.IDENTITY,
  position: vec3.ZEROS,
  rotation: quat.IDENTITY,
  scale: vec3.ONES,
};

export function updateFrameFromTransform(
  f: Partial<Frame>
): asserts f is Frame {
  f.transform = f.transform ?? mat4.create();
  f.position = mat4.getTranslation(f.position ?? vec3.create(), f.transform);
  f.rotation = mat4.getRotation(f.rotation ?? quat.create(), f.transform);
  f.scale = mat4.getScaling(f.scale ?? vec3.create(), f.transform);
}

export function updateFrameFromPosRotScale(
  f: Partial<Frame>
): asserts f is Partial<Frame> & { transform: mat4 } {
  f.transform = mat4.fromRotationTranslationScale(
    f.transform ?? mat4.create(),
    f.rotation ?? quat.IDENTITY,
    f.position ?? vec3.ZEROS,
    f.scale ?? vec3.ONES
  );
}

export function copyFrame(out: Partial<Frame>, frame: Partial<Frame>) {
  if (out.position || frame.position)
    out.position = vec3.copy(
      out.position || vec3.create(),
      frame.position || vec3.ZEROS
    );
  if (out.scale || frame.scale)
    out.scale = vec3.copy(out.scale || vec3.create(), frame.scale || vec3.ONES);
  if (out.rotation || frame.rotation)
    out.rotation = quat.copy(
      out.rotation || quat.create(),
      frame.rotation || quat.IDENTITY
    );
  if (out.transform || frame.transform)
    out.transform = mat4.copy(
      out.transform || mat4.create(),
      frame.transform || mat4.IDENTITY
    );
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
  transform?: mat4;
  physicsParent?: PhysicsParent;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateWorldFromLocalAndParent(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  if (TransformDef.isOn(o))
    if (PhysicsParentDef.isOn(o) && _transformables.has(o.physicsParent.id)) {
      const parent = _transformables.get(o.physicsParent.id)!;

      // update parent first
      if (!_hasTransformed.has(o.physicsParent.id)) {
        updateWorldFromLocalAndParent(parent);
      }

      // update relative to parent
      mat4.mul(o.world.transform, parent.world.transform, o.transform);
      updateFrameFromTransform(o.world);
    } else {
      // no parent
      copyFrame(o.world, o);
    }

  _hasTransformed.add(o.id);
}

export function registerInitTransforms(em: EntityManager) {
  // ensure we have a world transform if we're using the physics system
  // TODO(@darzu): have some sort of "usePhysics" marker component instead of pos?
  em.registerSystem(
    [PositionDef],
    [],
    (objs) => {
      for (let o of objs)
        if (!TransformDef.isOn(o)) {
          em.ensureComponentOn(o, TransformDef);
          updateFrameFromPosRotScale(o);
        }
    },
    "ensureTransform"
  );
  // TODO(@darzu): WorldFrame should be optional, only needed
  //  for parented objs (which is maybe the uncommon case).
  em.registerSystem(
    [TransformDef],
    [],
    (objs) => {
      for (let o of objs) {
        if (!PositionDef.isOn(o))
          // TODO(@darzu): it'd be great if we didn't have to force PosRotScale on every entity
          updateFrameFromTransform(o);
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
  // calculate the world transform
  em.registerSystem(
    [TransformDef, PositionDef],
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
    [WorldFrameDef],
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
