import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { tempQuat } from "../matrix/temp-pool.js";

const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;
const QUAT_EPSILON = 0.001;

const identityQuat: quat = quat.identity(quat.create());

function isVec3(v: quat | vec3): v is vec3 {
  return v.length === 3;
}

export function reduceError(
  v: quat | vec3,
  dt: number,
  smoothing_factor = ERROR_SMOOTHING_FACTOR
) {
  if (isVec3(v)) {
    const magnitude = vec3.len(v);
    if (magnitude > EPSILON) {
      vec3.scale(v, smoothing_factor ** dt, v);
    } else if (magnitude > 0) {
      vec3.set(0, 0, 0, v);
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
export function computeNewError(old: vec3, curr: vec3, error: vec3): void;
export function computeNewError(
  old: vec3 | quat,
  curr: vec3 | quat,
  error: vec3 | quat
) {
  if (isVec3(old)) {
    vec3.add(error as vec3, old, error as vec3);
    vec3.sub(error as vec3, curr as vec3, error as vec3);
  } else {
    const prevComputed = quat.mul(old, error as quat);
    quat.invert(curr as quat, error as quat);
    quat.mul(error as quat, prevComputed, prevComputed);
    quat.copy(error as quat, prevComputed);
    quat.normalize(error as quat, error as quat);
  }
}
