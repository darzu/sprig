import { mat3, mat4, vec3 } from "../matrix/sprig-matrix.js";
import { AABB } from "../physics/aabb.js";

// USAGE NOTE: When a model was designed originally for e.g. YUpZFwdXLeft, then
//  to use it in ZUpXFwdYLeft, you need to use convert_ZUpXFwdYLeft_to_YUpZFwdXLeft,
//  so backwards from how you might intuit. I don't have a pithy explanation why..

// TODO(@darzu): PERF. If we end up using these a lot, we could speed up the matrix multiply
//  and vec transform by inlining these since they're just 1s and 0s

// y->z, x->y, z->x
export const YUpZFwdXLeft_to_ZUpXFwdYLeft = new Float32Array([
  // column 1, x-basis
  0, 0, 1, 0,
  // column 2, y-basis
  1, 0, 0, 0,
  // column 3, z-basis
  0, 1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;
// export function convert_YUpZFwdXLeft_to_ZUpXFwdYLeft(v: vec3): vec3 {
//   return vec3.transformMat4(v, YUpZFwdXLeft_to_ZUpXFwdYLeft, v);
// }
export const YUpZFwdXLeft_to_ZUpXFwdYLeft_mat3 = new Float32Array([
  // column 1, x-basis
  0, 0, 1,
  // column 2, y-basis
  1, 0, 0,
  // column 3, z-basis
  0, 1, 0,
]) as mat3;
export function convert_YUpZFwdXLeft_to_ZUpXFwdYLeft(v: vec3): vec3 {
  return vec3.transformMat3(v, YUpZFwdXLeft_to_ZUpXFwdYLeft_mat3, v);
}

export const ZUpXFwdYLeft_to_YUpZFwdXLeft = mat4.invert(
  YUpZFwdXLeft_to_ZUpXFwdYLeft,
  mat4.create()
);

export function convert_ZUpXFwdYLeft_to_YUpZFwdXLeft(v: vec3): vec3 {
  return vec3.transformMat4(v, ZUpXFwdYLeft_to_YUpZFwdXLeft, v);
}

// y->z, x->x, z->-y
// e.g. <3,4,5> (4 units up, -5 units forward) becomes <3,-5,4> (or just invert zUpRH_to_yUpRH)
export const YUpNZFwdXRight_to_ZUpYFwdXRight = new Float32Array([
  // column 1, x-basis
  1, 0, 0, 0,
  // column 2, y-basis, -Z goes to Y
  0, 0, -1, 0,
  // column 3, z-basis, Y goes to Z
  0, 1, 0, 0,
  // column 4, translation
  0, 0, 0, 1,
]) as mat4;

export function convert_YUpNZFwdXRight_to_ZUpYFwdXRight(v: vec3): vec3 {
  return vec3.transformMat4(v, YUpNZFwdXRight_to_ZUpYFwdXRight, v);
}
export const ZUpYFwdXRight_YUpNZFwdXRight = mat4.invert(
  YUpNZFwdXRight_to_ZUpYFwdXRight,
  mat4.create()
);

export function convert_ZUpYFwdXRight_YUpNZFwdXRight(v: vec3): vec3 {
  return vec3.transformMat4(v, ZUpYFwdXRight_YUpNZFwdXRight, v);
}
export function convert_ZUpYFwdXRight_YUpNZFwdXRight_AABB(aabb: AABB): AABB {
  vec3.transformMat4(aabb.min, ZUpYFwdXRight_YUpNZFwdXRight, aabb.min);
  vec3.transformMat4(aabb.max, ZUpYFwdXRight_YUpNZFwdXRight, aabb.max);
  return aabb;
}
