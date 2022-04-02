import { EM } from "../entity-manager.js";
import { mat4, quat, vec3, } from "../gl-matrix.js";
import { WorldFrameDef } from "./nonintersection.js";
export const IDENTITY_FRAME = {
    transform: mat4.IDENTITY,
    position: vec3.ZEROS,
    rotation: quat.IDENTITY,
    scale: vec3.ONES,
};
export function updateFrameFromTransform(f) {
    var _a, _b, _c, _d;
    // TODO(@darzu): oh shoot, this skips EM's addComponent which is needed for query updates
    f.transform = (_a = f.transform) !== null && _a !== void 0 ? _a : mat4.create();
    f.position = mat4.getTranslation((_b = f.position) !== null && _b !== void 0 ? _b : vec3.create(), f.transform);
    f.rotation = mat4.getRotation((_c = f.rotation) !== null && _c !== void 0 ? _c : quat.create(), f.transform);
    f.scale = mat4.getScaling((_d = f.scale) !== null && _d !== void 0 ? _d : vec3.create(), f.transform);
}
export function updateFrameFromPosRotScale(f) {
    var _a, _b, _c, _d;
    f.transform = mat4.fromRotationTranslationScale((_a = f.transform) !== null && _a !== void 0 ? _a : mat4.create(), (_b = f.rotation) !== null && _b !== void 0 ? _b : quat.IDENTITY, (_c = f.position) !== null && _c !== void 0 ? _c : vec3.ZEROS, (_d = f.scale) !== null && _d !== void 0 ? _d : vec3.ONES);
}
export function copyFrame(out, frame) {
    if (out.position || frame.position)
        out.position = vec3.copy(out.position || vec3.create(), frame.position || vec3.ZEROS);
    if (out.scale || frame.scale)
        out.scale = vec3.copy(out.scale || vec3.create(), frame.scale || vec3.ONES);
    if (out.rotation || frame.rotation)
        out.rotation = quat.copy(out.rotation || quat.create(), frame.rotation || quat.IDENTITY);
    if (out.transform || frame.transform)
        out.transform = mat4.copy(out.transform || mat4.create(), frame.transform || mat4.IDENTITY);
}
// TRANSFORM
export const TransformDef = EM.defineComponent("transform", (t) => {
    return t !== null && t !== void 0 ? t : mat4.create();
});
// POSITION
export const PositionDef = EM.defineComponent("position", (p) => p || vec3.fromValues(0, 0, 0));
EM.registerSerializerPair(PositionDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
// ROTATION
export const RotationDef = EM.defineComponent("rotation", (r) => r || quat.create());
EM.registerSerializerPair(RotationDef, (o, buf) => buf.writeQuat(o), (o, buf) => buf.readQuat(o));
// SCALE
export const ScaleDef = EM.defineComponent("scale", (by) => by || vec3.fromValues(1, 1, 1));
EM.registerSerializerPair(ScaleDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
// PARENT
export const PhysicsParentDef = EM.defineComponent("physicsParent", (p) => {
    return { id: p || 0 };
});
EM.registerSerializerPair(PhysicsParentDef, (o, buf) => buf.writeUint32(o.id), (o, buf) => (o.id = buf.readUint32()));
const _transformables = new Map();
const _hasTransformed = new Set();
function updateWorldFromLocalAndParent(o) {
    if (_hasTransformed.has(o.id))
        return;
    if (TransformDef.isOn(o))
        if (PhysicsParentDef.isOn(o) && _transformables.has(o.physicsParent.id)) {
            const parent = _transformables.get(o.physicsParent.id);
            // update parent first
            if (!_hasTransformed.has(o.physicsParent.id)) {
                updateWorldFromLocalAndParent(parent);
            }
            // update relative to parent
            mat4.mul(o.world.transform, parent.world.transform, o.transform);
            updateFrameFromTransform(o.world);
        }
        else {
            // no parent
            copyFrame(o.world, o);
        }
    _hasTransformed.add(o.id);
}
export function registerInitTransforms(em) {
    // ensure we have a world transform if we're using the physics system
    // TODO(@darzu): have some sort of "usePhysics" marker component instead of pos?
    em.registerSystem([PositionDef], [], (objs) => {
        for (let o of objs)
            if (!TransformDef.isOn(o)) {
                em.ensureComponentOn(o, TransformDef);
                updateFrameFromPosRotScale(o);
            }
    }, "ensureTransform");
    // TODO(@darzu): WorldFrame should be optional, only needed
    //  for parented objs (which is maybe the uncommon case).
    em.registerSystem([TransformDef], [], (objs) => {
        for (let o of objs) {
            if (!PositionDef.isOn(o))
                // TODO(@darzu): it'd be great if we didn't have to force PosRotScale on every entity
                updateFrameFromTransform(o);
            if (!WorldFrameDef.isOn(o)) {
                em.ensureComponentOn(o, WorldFrameDef);
                copyFrame(o.world, o);
            }
        }
    }, "ensureWorldFrame");
}
export function registerUpdateLocalFromPosRotScale(em, suffix = "") {
    // calculate the world transform
    em.registerSystem([TransformDef, PositionDef], [], (objs) => {
        for (let o of objs)
            updateFrameFromPosRotScale(o);
    }, "updateLocalFromPosRotScale" + suffix);
}
export function registerUpdateWorldFromLocalAndParent(em, suffix = "") {
    // calculate the world transform
    em.registerSystem([WorldFrameDef], [], (objs) => {
        _transformables.clear();
        _hasTransformed.clear();
        for (let o of objs) {
            _transformables.set(o.id, o);
        }
        for (let o of objs) {
            updateWorldFromLocalAndParent(o);
        }
    }, "updateWorldFromLocalAndParent" + suffix);
}
//# sourceMappingURL=transform.js.map