import { clamp } from "../utils/math.js";
import { mat4, V, V2, V3 } from "../matrix/sprig-matrix.js";
import { range } from "../utils/util.js";
import { vec3Dbg2, vec3Mid } from "../utils/utils-3d.js";

const TRACK_AABB = true;

export function __resetAABBDbgCounters() {
  _doesOverlapAABBs = 0;
  _enclosedBys = 0;
}

export let _doesOverlapAABBs = 0;
export function doesOverlapAABB(a: AABB, b: AABB) {
  if (TRACK_AABB) _doesOverlapAABBs++;
  // TODO(@darzu): less then or less then and equal?
  return (
    b.min[0] < a.max[0] &&
    b.min[1] < a.max[1] &&
    b.min[2] < a.max[2] &&
    a.min[0] < b.max[0] &&
    a.min[1] < b.max[1] &&
    a.min[2] < b.max[2]
  );
}
export let _enclosedBys = 0;
export function enclosedBy(inner: AABB, outer: AABB) {
  if (TRACK_AABB) _enclosedBys++;
  return (
    inner.max[0] < outer.max[0] &&
    inner.max[1] < outer.max[1] &&
    inner.max[2] < outer.max[2] &&
    outer.min[0] < inner.min[0] &&
    outer.min[1] < inner.min[1] &&
    outer.min[2] < inner.min[2]
  );
}
export function doesTouchAABB(a: AABB, b: AABB, threshold: number) {
  if (TRACK_AABB) _doesOverlapAABBs++;
  return (
    b.min[0] < a.max[0] + threshold &&
    b.min[1] < a.max[1] + threshold &&
    b.min[2] < a.max[2] + threshold &&
    a.min[0] < b.max[0] + threshold &&
    a.min[1] < b.max[1] + threshold &&
    a.min[2] < b.max[2] + threshold
  );
}

export interface AABB {
  min: V3;
  max: V3;
}
export function createAABB(min?: V3, max?: V3): AABB {
  return {
    min: min ?? V(Infinity, Infinity, Infinity),
    max: max ?? V(-Infinity, -Infinity, -Infinity),
  };
}
export function copyAABB(out: AABB, a: AABB) {
  V3.copy(out.min, a.min);
  V3.copy(out.max, a.max);
  return out;
}
export function clampToAABB(v: V3, aabb: AABB, out?: V3): V3 {
  out = out ?? V3.tmp();
  out[0] = clamp(v[0], aabb.min[0], aabb.max[0]);
  out[1] = clamp(v[1], aabb.min[1], aabb.max[1]);
  out[2] = clamp(v[2], aabb.min[2], aabb.max[2]);
  return out;
}

export function pointInAABB(aabb: AABB, p: V3) {
  return (
    aabb.min[0] < p[0] &&
    aabb.min[1] < p[1] &&
    aabb.min[2] < p[2] &&
    p[0] < aabb.max[0] &&
    p[1] < aabb.max[1] &&
    p[2] < aabb.max[2]
  );
}

// TODO(@darzu): too much alloc
// export function getAABBCorners(aabb: AABB): V3[] {
//   const points: V3[] = [
//     V(aabb.max[0], aabb.max[1], aabb.max[2]),
//     V(aabb.max[0], aabb.max[1], aabb.min[2]),
//     V(aabb.max[0], aabb.min[1], aabb.max[2]),
//     V(aabb.max[0], aabb.min[1], aabb.min[2]),

//     V(aabb.min[0], aabb.max[1], aabb.max[2]),
//     V(aabb.min[0], aabb.max[1], aabb.min[2]),
//     V(aabb.min[0], aabb.min[1], aabb.max[2]),
//     V(aabb.min[0], aabb.min[1], aabb.min[2]),
//   ];
//   return points;
// }

const tempAabbCorners: V3[] = range(8).map((_) => V3.mk());
export function getAABBCornersTemp(aabb: AABB): V3[] {
  V3.set(aabb.max[0], aabb.max[1], aabb.max[2], tempAabbCorners[0]);
  V3.set(aabb.max[0], aabb.max[1], aabb.min[2], tempAabbCorners[1]);
  V3.set(aabb.max[0], aabb.min[1], aabb.max[2], tempAabbCorners[2]);
  V3.set(aabb.max[0], aabb.min[1], aabb.min[2], tempAabbCorners[3]);
  V3.set(aabb.min[0], aabb.max[1], aabb.max[2], tempAabbCorners[4]);
  V3.set(aabb.min[0], aabb.max[1], aabb.min[2], tempAabbCorners[5]);
  V3.set(aabb.min[0], aabb.min[1], aabb.max[2], tempAabbCorners[6]);
  V3.set(aabb.min[0], aabb.min[1], aabb.min[2], tempAabbCorners[7]);
  return tempAabbCorners;
}

// const tempAabbXZCorners = range(4).map((_) => V2.create()) as [
//   vec2,
//   vec2,
//   vec2,
//   vec2
// ];
// export function getAabbXZCornersTemp(aabb: AABB): [vec2, vec2, vec2, vec2] {
//   V2.set(aabb.max[0], aabb.max[2], tempAabbXZCorners[0]);
//   V2.set(aabb.max[0], aabb.min[2], tempAabbXZCorners[1]);
//   V2.set(aabb.min[0], aabb.max[2], tempAabbXZCorners[2]);
//   V2.set(aabb.min[0], aabb.min[2], tempAabbXZCorners[3]);
//   return tempAabbXZCorners;
// }

export function transformAABB(out: AABB, t: mat4) {
  // TODO(@darzu): PERF. is there a more performant way to do this?
  const wCorners = getAABBCornersTemp(out);
  wCorners.forEach((p) => V3.tMat4(p, t, p));
  getAABBFromPositions(out, wCorners);
  return out;
}

export function aabbCenter(out: V3, a: AABB): V3 {
  out[0] = (a.min[0] + a.max[0]) * 0.5;
  out[1] = (a.min[1] + a.max[1]) * 0.5;
  out[2] = (a.min[2] + a.max[2]) * 0.5;
  return out;
}
export function updateAABBWithPoint(aabb: AABB, pos: V3): AABB {
  return updateAABBWithPoint_(aabb, pos[0], pos[1], pos[2]);
}
export function updateAABBWithPoint_(
  aabb: AABB,
  x: number,
  y: number,
  z: number
): AABB {
  aabb.min[0] = Math.min(x, aabb.min[0]);
  aabb.min[1] = Math.min(y, aabb.min[1]);
  aabb.min[2] = Math.min(z, aabb.min[2]);
  aabb.max[0] = Math.max(x, aabb.max[0]);
  aabb.max[1] = Math.max(y, aabb.max[1]);
  aabb.max[2] = Math.max(z, aabb.max[2]);
  return aabb;
}

export function mergeAABBs(out: AABB, a: AABB, b: AABB): AABB {
  out.min[0] = Math.min(a.min[0], b.min[0]);
  out.min[1] = Math.min(a.min[1], b.min[1]);
  out.min[2] = Math.min(a.min[2], b.min[2]);
  out.max[0] = Math.max(a.max[0], b.max[0]);
  out.max[1] = Math.max(a.max[1], b.max[1]);
  out.max[2] = Math.max(a.max[2], b.max[2]);
  return out;
}

export function getAABBFromPositions(out: AABB, positions: V3[]): AABB {
  V3.set(Infinity, Infinity, Infinity, out.min);
  V3.set(-Infinity, -Infinity, -Infinity, out.max);

  for (let pos of positions) {
    updateAABBWithPoint(out, pos);
  }

  return out;
}

// 2D AABB stuff

export interface AABB2 {
  min: V2;
  max: V2;
}

export function updateAABBWithPoint2(aabb: AABB2, pos: V2): AABB2 {
  return updateAABBWithPoint2_(aabb, pos[0], pos[1]);
}
export function updateAABBWithPoint2_(
  aabb: AABB2,
  x: number,
  y: number
): AABB2 {
  aabb.min[0] = Math.min(x, aabb.min[0]);
  aabb.min[1] = Math.min(y, aabb.min[1]);
  aabb.max[0] = Math.max(x, aabb.max[0]);
  aabb.max[1] = Math.max(y, aabb.max[1]);
  return aabb;
}
export function aabbCenter2(out: V2, a: AABB2): V2 {
  out[0] = (a.min[0] + a.max[0]) * 0.5;
  out[1] = (a.min[1] + a.max[1]) * 0.5;
  return out;
}

// TODO(@darzu): add out param
// TODO(@darzu): MOVE to gl-matrix
export function getCenterFromAABB(aabb: AABB): V3 {
  return vec3Mid(V3.mk(), aabb.min, aabb.max);
}
export function getSizeFromAABB(aabb: AABB, out?: V3): V3 {
  out = out ?? V3.tmp();
  out[0] = aabb.max[0] - aabb.min[0];
  out[1] = aabb.max[1] - aabb.min[1];
  out[2] = aabb.max[2] - aabb.min[2];
  return out;
}
export function getHalfsizeFromAABB(aabb: AABB, out?: V3): V3 {
  out = out ?? V3.tmp();
  out[0] = (aabb.max[0] - aabb.min[0]) * 0.5;
  out[1] = (aabb.max[1] - aabb.min[1]) * 0.5;
  out[2] = (aabb.max[2] - aabb.min[2]) * 0.5;
  return out;
}

export function aabbListToStr(aabbs: AABB[]): string {
  let resStr = "";
  resStr += `const aabbs: AABB[] = [`;
  for (let aabb of aabbs) {
    resStr += `{min: ${vec3Dbg2(aabb.min)}, max: ${vec3Dbg2(aabb.max)}},`;
  }
  resStr += `];`;
  return resStr;
}

export function isValidVec3(v: V3) {
  return (
    !isNaN(v[0]) &&
    isFinite(v[0]) &&
    !isNaN(v[1]) &&
    isFinite(v[1]) &&
    !isNaN(v[2]) &&
    isFinite(v[2])
  );
}

export function isValidAABB(aabb: AABB) {
  const validBounds =
    aabb.min[0] <= aabb.max[0] &&
    aabb.min[1] <= aabb.max[1] &&
    aabb.min[2] <= aabb.max[2];
  const validNums = isValidVec3(aabb.min) && isValidVec3(aabb.max);
  return validBounds && validNums;
}
