import { quat, ReadonlyQuat, vec3 } from "./gl-matrix.js";
import { tempQuat } from "./temp-pool.js";

const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;
const QUAT_EPSILON = 0.001;

const identityQuat: ReadonlyQuat = quat.identity(quat.create());

function isVec3(v: quat | vec3): v is vec3 {
  return v.length === 3;
}

export function reduceError(
  v: quat | vec3,
  dt: number,
  smoothing_factor = ERROR_SMOOTHING_FACTOR
) {
  if (isVec3(v)) {
    const magnitude = vec3.length(v);
    if (magnitude > EPSILON) {
      vec3.scale(v, v, smoothing_factor ** dt);
    } else if (magnitude > 0) {
      vec3.set(v, 0, 0, 0);
    }
  } else {
    const magnitude = Math.abs(quat.getAngle(v, identityQuat));
    if (magnitude > QUAT_EPSILON) {
      console.log("mag > EPSILON");
      quat.slerp(v, v, identityQuat, 1 - smoothing_factor ** dt);
      quat.normalize(v, v);
    } else if (magnitude > 0) {
      console.log("normalizing");
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
    vec3.add(error as vec3, error as vec3, old);
    vec3.sub(error as vec3, error as vec3, curr as vec3);
  } else {
    const prevComputed = quat.mul(tempQuat(), old, error as quat);
    quat.invert(error as quat, curr as quat);
    quat.mul(prevComputed, error as quat, prevComputed);
    quat.copy(error as quat, prevComputed);
    quat.normalize(error as quat, error as quat);
  }
}
