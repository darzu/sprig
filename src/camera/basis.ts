import { mat4, vec3 } from "../matrix/sprig-matrix.js";
import { AABB } from "../physics/aabb.js";

// e.g. <3,4,5> (5 units up, 4 units forward) becomes <3,5,-4>
export const zUpRH_to_yUpRH = new Float32Array([
  // column 1, x-basis
  1, 0, 0, 0,
  // column 2, y-basis, Z goes to Y
  0, 0, 1, 0,
  // column 3, z-basis, Y goes to -Z
  0, -1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;

export function convertZUpToYUp(v: vec3): vec3 {
  return vec3.transformMat4(v, zUpRH_to_yUpRH, v);
}

// e.g. <3,4,5> (4 units up, -5 units forward) becomes <3,-5,4> (or just invert zUpRH_to_yUpRH)
export const yUpRH_to_zUpRH = new Float32Array([
  // column 1, x-basis
  1, 0, 0, 0,
  // column 2, y-basis, -Z goes to Y
  0, 0, -1, 0,
  // column 3, z-basis, Y goes to Z
  0, 1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;

export function convertYUpToZUp(v: vec3): vec3 {
  return vec3.transformMat4(v, yUpRH_to_zUpRH, v);
}
export function convertYUpToZUpAABB(aabb: AABB): AABB {
  vec3.transformMat4(aabb.min, yUpRH_to_zUpRH, aabb.min);
  vec3.transformMat4(aabb.max, yUpRH_to_zUpRH, aabb.max);
  return aabb;
}
