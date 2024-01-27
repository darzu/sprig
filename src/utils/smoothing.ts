import { V2, V3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { tempQuat } from "../matrix/temp-pool.js";

const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;
const QUAT_EPSILON = 0.001;

const identityQuat: quat = quat.identity(quat.create());

function isVec3(v: quat | V3): v is V3 {
  return v.length === 3;
}

export function reduceError(
  v: quat | V3,
  dt: number,
  smoothing_factor = ERROR_SMOOTHING_FACTOR
) {
  if (isVec3(v)) {
    const magnitude = V3.len(v);
    if (magnitude > EPSILON) {
      V3.scale(v, smoothing_factor ** dt, v);
    } else if (magnitude > 0) {
      V3.set(0, 0, 0, v);
    }
  } else {
    const magnitude = Math.abs(quat.getAngle(v, identityQuat));
    if (magnitude > QUAT_EPSILON) {
      quat.slerp(v, identityQuat, 1 - smoothing_factor ** dt, v);
      quat.normalize(v, v);
    } else if (magnitude > 0) {
      quat.copy(v, identityQuat);
    }
  }
}

export function computeNewError(old: quat, curr: quat, error: quat): void;
export function computeNewError(old: V3, curr: V3, error: V3): void;
export function computeNewError(
  old: V3 | quat,
  curr: V3 | quat,
  error: V3 | quat
) {
  if (isVec3(old)) {
    V3.add(error as V3, old, error as V3);
    V3.sub(error as V3, curr as V3, error as V3);
  } else {
    const prevComputed = quat.mul(old, error as quat);
    quat.invert(curr as quat, error as quat);
    quat.mul(error as quat, prevComputed, prevComputed);
    quat.copy(error as quat, prevComputed);
    quat.normalize(error as quat, error as quat);
  }
}
