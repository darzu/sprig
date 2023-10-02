import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { avg, mathMap } from "./math.js";
import { AABB, createAABB, getAABBFromPositions } from "../physics/aabb.js";
import { tempVec2, tempVec3 } from "../matrix/temp-pool.js";
import { assertDbg, range, resizeArray, TupleN } from "./util.js";

// TODO(@darzu): a lot of these need to move into gl-matrix; or rather, we need
//  to subsume gl-matrix into our own libraries.

// math utilities
const _t1 = vec3.create();
const _t2 = vec3.create();
export function computeTriangleNormal(
  p1: vec3,
  p2: vec3,
  p3: vec3,
  out?: vec3
): vec3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = vec3.cross(vec3.sub(p2, p1, _t1), vec3.sub(p3, p1, _t2), out);
  vec3.normalize(n, n);
  return n;
}

export function randNormalVec3(out?: vec3) {
  const res = vec3.set(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
    out ?? vec3.tmp()
  );
  vec3.normalize(res, res);
  return res;
}

export function randNormalPosVec3(out?: vec3) {
  if (!out) out = vec3.create();
  vec3.set(Math.random(), Math.random(), Math.random(), out);
  vec3.normalize(out, out);
  return out;
}

export function randNormalVec2(out: vec2) {
  vec2.set(Math.random() - 0.5, Math.random() - 0.5, out);
  vec2.normalize(out, out);
  return out;
}

export function randQuat(out?: quat): quat {
  return quat.fromEuler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    out ?? quat.tmp()
  );
}

// matrix utilities
export function pitch(m: mat4, rad: number) {
  return mat4.rotateX(m, rad, m);
}
export function yaw(m: mat4, rad: number) {
  return mat4.rotateY(m, rad, m);
}
export function roll(m: mat4, rad: number) {
  return mat4.rotateZ(m, rad, m);
}
export function moveX(m: mat4, n: number) {
  return mat4.translate(m, [n, 0, 0], m);
}
export function moveY(m: mat4, n: number) {
  return mat4.translate(m, [0, n, 0], m);
}
export function moveZ(m: mat4, n: number) {
  return mat4.translate(m, [0, 0, n], m);
}
export function getPositionFromTransform(t: mat4): vec3 {
  // TODO(@darzu): not really necessary
  const pos = vec3.create();
  vec3.transformMat4(pos, t, pos);
  return pos;
}
// vec utilities
export function vec3Floor(out: vec3, v: vec3.InputT): vec3 {
  out[0] = Math.floor(v[0]);
  out[1] = Math.floor(v[1]);
  out[2] = Math.floor(v[2]);
  return out;
}

export function aabbDbg(v: AABB): string {
  return `min:${vec3Dbg(v.min)},max:${vec3Dbg(v.max)}`;
}
export function vec2Dbg(v: vec2.InputT): string {
  return `[${v[0].toFixed(2)},${v[1].toFixed(2)}]`;
}
export function vec3Dbg(v?: vec3.InputT): string {
  return v
    ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`
    : "NIL";
}
export function vec3Dbg2(v: vec3.InputT, precision = 2): string {
  return `V(${v[0].toFixed(precision)},${v[1].toFixed(
    precision
  )},${v[2].toFixed(precision)})`;
}
export function vec4Dbg(v?: vec4): string {
  return v
    ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)},${v[3].toFixed(
        2
      )}]`
    : "NIL";
}
export function vec4Dbg2(v: vec4, precision = 2): string {
  return `V(${v[0].toFixed(precision)},${v[1].toFixed(
    precision
  )},${v[2].toFixed(precision)},${v[3].toFixed(precision)})`;
}
export function quatDbg(q: quat): string {
  const axis = tempVec3();
  const n = quat.getAxisAngle(q, axis);
  return `${vec3Dbg(axis)}*${n.toFixed(2)}`;
}
export function mat4Dbg(v: mat4): string {
  const ns = [...v].map((n) => n.toFixed(2));
  return (
    "" +
    `${ns[0]}\t|${ns[4]}\t|${ns[8]}\t|${ns[12]}
 ${ns[1]}\t|${ns[5]}\t|${ns[9]}\t|${ns[13]}
 ${ns[2]}\t|${ns[6]}\t|${ns[10]}\t|${ns[14]}
 ${ns[3]}\t|${ns[7]}\t|${ns[11]}\t|${ns[15]}`
  );
}
export function centroid(...vs: vec3[]): vec3 {
  const avgX = avg(vs.map((v) => v[0]));
  const avgY = avg(vs.map((v) => v[1]));
  const avgZ = avg(vs.map((v) => v[2]));
  return V(avgX, avgY, avgZ);
}
// TODO(@darzu):  move into gl-matrix?
export function vec3Mid(out: vec3, a: vec3, b: vec3): vec3 {
  out[0] = (a[0] + b[0]) * 0.5;
  out[1] = (a[1] + b[1]) * 0.5;
  out[2] = (a[2] + b[2]) * 0.5;
  return out;
}

// mutates forward and upish and outputs to outRight such that all three are
//  orthogonal to eachother.
export function orthonormalize(forward: vec3, upish: vec3, outRight: vec3) {
  // TODO(@darzu): there's a pattern somewhat similar in many places:
  //    orthonormalizing, Gram–Schmidt
  //    quatFromUpForward, getControlPoints, tripleProd?
  //    targetTo, lookAt ?
  // Also this can be more efficient by inlining
  vec3.normalize(forward, forward);
  vec3.cross(forward, upish, outRight);
  vec3.normalize(outRight, outRight);
  vec3.cross(outRight, forward, upish);
}

// quat utilities
// assumes local up axis is [0,1,0] and forward is [0,0,1]
const __t1 = vec3.create();
const __t2 = vec3.create();
export function quatFromUpForward(
  out: quat,
  up: vec3.InputT,
  forwardish: vec3.InputT
): quat {
  // https://stackoverflow.com/questions/52413464/look-at-quaternion-using-up-vector/52551983#52551983
  const side = vec3.cross(forwardish, up, __t1);
  vec3.negate(side, side); // TODO(@darzu): is this negate right?
  vec3.normalize(side, side);
  const backward = vec3.cross(side, up, __t2);

  const trace = side[0] + up[1] + backward[2];
  if (trace > 0.0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    out[3] = 0.25 / s;
    out[0] = (up[2] - backward[1]) * s;
    out[1] = (backward[0] - side[2]) * s;
    out[2] = (side[1] - up[0]) * s;
  } else {
    if (side[0] > up[1] && side[0] > backward[2]) {
      const s = 2.0 * Math.sqrt(1.0 + side[0] - up[1] - backward[2]);
      out[3] = (up[2] - backward[1]) / s;
      out[0] = 0.25 * s;
      out[1] = (up[0] + side[1]) / s;
      out[2] = (backward[0] + side[2]) / s;
    } else if (up[1] > backward[2]) {
      const s = 2.0 * Math.sqrt(1.0 + up[1] - side[0] - backward[2]);
      out[3] = (backward[0] - side[2]) / s;
      out[0] = (up[0] + side[1]) / s;
      out[1] = 0.25 * s;
      out[2] = (backward[1] + up[2]) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + backward[2] - side[0] - up[1]);
      out[3] = (side[1] - up[0]) / s;
      out[0] = (backward[0] + side[2]) / s;
      out[1] = (backward[1] + up[2]) / s;
      out[2] = 0.25 * s;
    }
  }
  return out;
}

export type SupportFn = (d: vec3) => vec3;
export function farthestPointInDir(points: vec3[], d: vec3): vec3 {
  let max = -Infinity;
  let maxP: vec3 | null = null;
  for (let p of points) {
    const n = vec3.dot(p, d);
    if (n > max) {
      max = n;
      maxP = p;
    }
  }
  return maxP!;
}

export function uintToVec3unorm(i: number, max: number): vec3 {
  return vec3.clone([
    (((((i % 7) + 1) & 1) >> 0) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 2) >> 1) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 4) >> 2) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
  ]);
}

// Changes all vec2s to be in the range [0,1] based on the max and min values
//   of the whole array.
export function normalizeVec2s(vs: vec2[], min: number, max: number): void {
  const minX = vs.reduce((p, n) => (n[0] < p ? n[0] : p), Infinity);
  const maxX = vs.reduce((p, n) => (n[0] > p ? n[0] : p), -Infinity);
  const minY = vs.reduce((p, n) => (n[1] < p ? n[1] : p), Infinity);
  const maxY = vs.reduce((p, n) => (n[1] > p ? n[1] : p), -Infinity);
  const xRange = maxX - minX;
  const yRange = maxY - minY;
  const newRange = max - min;
  const oldRange = Math.max(xRange, yRange);
  const scalar = newRange / oldRange;
  for (let v of vs) {
    v[0] = (v[0] - minX) * scalar + min;
    v[1] = (v[1] - minY) * scalar + min;
  }
}

// corners of the WebGPU NDC clip-space (-1,-1,0):(1,1,1)
const screenCorners: TupleN<vec3, 8> = [
  V(+1.0, +1.0, +1.0),
  V(+1.0, +1.0, 0.0),
  V(+1.0, -1.0, +1.0),
  V(+1.0, -1.0, 0.0),
  V(-1.0, +1.0, +1.0),
  V(-1.0, +1.0, 0.0),
  V(-1.0, -1.0, +1.0),
  V(-1.0, -1.0, 0.0),
];

const _tempWorldCorners: TupleN<vec3, 8> = screenCorners.map((_) =>
  V(0, 0, 0)
) as TupleN<vec3, 8>;
export function getFrustumWorldCorners(
  invViewProj: mat4,
  out?: TupleN<vec3, 8>
) {
  out = out ?? _tempWorldCorners;
  assertDbg(out.length === screenCorners.length);
  for (let i = 0; i < screenCorners.length; i++)
    vec3.transformMat4(screenCorners[i], invViewProj, out[i]);
  return out;
}

// TODO(@darzu): kinda hate this fn..
export function positionAndTargetToOrthoViewProjMatrix(
  out: mat4,
  position: vec3,
  target: vec3
): mat4 {
  const viewMatrix = out;
  mat4.lookAt(position, target, [0, 1, 0], viewMatrix);
  const projectionMatrix = mat4.tmp();
  const dist = vec3.dist(position, target);
  {
    const left = -80;
    const right = 80;
    const bottom = -80;
    const top = 80;
    const near = dist * 0.2;
    // TODO: examine this carefully-derived constant
    const far = dist * 1.5;
    mat4.ortho(left, right, bottom, top, near, far, projectionMatrix);
  }
  mat4.mul(projectionMatrix, viewMatrix, viewMatrix);
  return viewMatrix;
}

export function signedAreaOfTriangle(a: vec2, b: vec2, c: vec2): number {
  const ab = tempVec2();
  const ac = tempVec2();
  vec2.sub(b, a, ab);
  vec2.sub(c, a, ac);
  let cross = vec2.cross(ab, ac);
  return 0.5 * cross[2];
}

// TODO(@darzu):  move to sprig-matrix.ts

export function vec3Reverse(out: vec3) {
  const t = out[0];
  out[0] = out[2];
  out[2] = t;
  return out;
}

export function vec4Reverse(out: vec4) {
  let t = out[0];
  out[0] = out[3];
  out[3] = t;
  t = out[1];
  out[1] = out[2];
  out[2] = t;
  return out;
}

export function vec4RotateLeft(out: vec4) {
  let t = out[0];
  out[0] = out[1];
  out[1] = out[2];
  out[2] = out[3];
  out[3] = t;
  return out;
}

const _tempViewCorners: vec3[] = [];
const _tempViewAABB = createAABB();
export function frustumFromBounds(
  worldCorners: vec3[],
  eyePos: vec3,
  outFrust: mat4
) {
  // view matrix
  const viewTmp = mat4.lookAt(eyePos, [0, 0, 0], [0, 1, 0]);

  // resize temp buffers if needed
  // TODO(@darzu): PERF. doesn't work so well if we get variable numbers of world points
  resizeArray(_tempViewCorners, worldCorners.length, () => vec3.create());

  // translate & rotate camera frustum world corners into light view
  worldCorners.forEach((p, i) =>
    vec3.transformMat4(p, viewTmp, _tempViewCorners[i])
  );

  // get view-space bounds
  getAABBFromPositions(_tempViewAABB, _tempViewCorners);

  // create view-space orthographic projection
  const projTmp = mat4.ortho(
    // left/right
    _tempViewAABB.min[0],
    _tempViewAABB.max[0],
    // bottom/top
    _tempViewAABB.min[1],
    _tempViewAABB.max[1],
    // near/far
    -1.0, // TODO(@darzu): HACK?
    // -_tempViewAABB.max[2],
    -_tempViewAABB.min[2]
  );

  // compose final view-projection matrix
  mat4.mul(projTmp, viewTmp, outFrust);
}

export const UP = V(0, 1, 0); // TODO(@darzu): formalize coordinate system somewhere?
const __angleBetweenXZTmp0 = vec3.create();
const __angleBetweenXZTmp1 = vec3.create();
const __angleBetweenXZTmp2 = vec3.create();
export function angleBetweenPosXZ(
  pos: vec3,
  rot: quat,
  fwd: vec3, // NOTE: fwd needs to be normalized and with 0 y component
  target: vec3
): number {
  const toward = vec3.normalize(
    [target[0] - pos[0], 0, target[2] - pos[2]],
    __angleBetweenXZTmp0
  );
  const currFwd = vec3.transformQuat(fwd, rot, __angleBetweenXZTmp1);
  return angleBetweenXZ(currFwd, toward);
}

// NOTE: assumes dir1 and dir2 are normalized
export function angleBetweenXZ(norm1: vec3, norm2: vec3): number {
  // const currSide = vec3.cross(dir1, UP, __angleBetweenXZTmp2);
  // const sign = -Math.sign(vec3.dot(currSide, dir2));
  // const angleBetween = sign * Math.acos(vec3.dot(dir1, dir2));
  // return angleBetween;

  return angleBetween(norm1[2], norm1[0], norm2[2], norm2[0]);
}

// NOTE: assumes <x0, y0> and <x1, y1> are normalized
export function angleBetween(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const cross = x0 * y1 - x1 * y0;
  const sign = Math.sign(cross);
  const dot = x0 * x1 + y0 * y1;
  return sign * Math.acos(dot);
}
