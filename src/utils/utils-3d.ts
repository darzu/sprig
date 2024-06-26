import {
  V2,
  V3,
  V4,
  quat,
  mat4,
  V,
  orthonormalize,
  mat3,
} from "../matrix/sprig-matrix.js";
import { avg, remap } from "./math.js";
import { AABB, createAABB, getAABBFromPositions } from "../physics/aabb.js";
import { assertDbg, range, resizeArray, TupleN } from "./util.js";

// TODO(@darzu): a lot of these need to move into gl-matrix; or rather, we need
//  to subsume gl-matrix into our own libraries.

// math utilities
const _t1 = V3.mk();
const _t2 = V3.mk();
export function computeTriangleNormal(p1: V3, p2: V3, p3: V3, out?: V3): V3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = V3.cross(V3.sub(p2, p1, _t1), V3.sub(p3, p1, _t2), out);
  V3.norm(n, n);
  return n;
}

export function randFromNormalDist() {
  // https://stackoverflow.com/a/6178290
  // https://youtu.be/Qz0KTGYJtUk?t=770
  const theta = 2 * Math.PI * Math.random();
  const rho = Math.sqrt(-2 * Math.log(Math.random()));
  return rho * Math.cos(theta);
}

export function randNormalVec3_cheap(out?: V3) {
  // NOTE: this isn't evenly distributed along a sphere; it's in a box
  const res = V3.set(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
    out ?? V3.tmp()
  );
  V3.norm(res, res);
  return res;
}
export function randNormalVec3(out?: V3) {
  const res = V3.set(
    randFromNormalDist(),
    randFromNormalDist(),
    randFromNormalDist(),
    out ?? V3.tmp()
  );
  V3.norm(res, res);
  return res;
}
export const randDir3 = randNormalVec3;

let _tmp_jitterVec3 = V3.mk();
// NOTE: preserves length.
// TODO(@darzu): eh, maybe we want a better way to jitter a normal?
export function jitterVec3(v: V3.InputT, d: number, out?: V3) {
  out = out ?? V3.tmp();
  const startLen = V3.len(v);
  const norm = randNormalVec3(_tmp_jitterVec3);
  V3.scale(norm, d, norm);
  V3.add(v, norm, out);
  const newLen = V3.len(out);
  V3.scale(out, startLen / newLen, out);
  return out;
}

export function randVec3OfLen(r: number = 1, out?: V3) {
  out = out ?? V3.tmp();
  randNormalVec3(out);
  V3.scale(out, r, out);
  return out;
}

export function randNormalPosVec3(out?: V3) {
  // TODO(@darzu): not evenly distributed on sphere!
  if (!out) out = V3.mk();
  V3.set(Math.random(), Math.random(), Math.random(), out);
  V3.norm(out, out);
  return out;
}

export function randNormalVec2(out: V2) {
  // TODO(@darzu): not evenly distributed on sphere!
  V2.set(Math.random() - 0.5, Math.random() - 0.5, out);
  V2.norm(out, out);
  return out;
}

export function randQuat(out?: quat): quat {
  // TODO(@darzu): evenly distributed on sphere?
  return quat.fromEuler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    out ?? quat.tmp()
  );
}

// matrix utilities
// TODO(@darzu): most of these should move to sprig-matrix

export function moveX(m: mat4, n: number) {
  return mat4.translate(m, [n, 0, 0], m);
}
export function moveY(m: mat4, n: number) {
  return mat4.translate(m, [0, n, 0], m);
}
export function moveZ(m: mat4, n: number) {
  return mat4.translate(m, [0, 0, n], m);
}
export function getPositionFromTransform(t: mat4): V3 {
  // TODO(@darzu): not really necessary
  const pos = V3.mk();
  V3.tMat4(pos, t, pos);
  return pos;
}
// vec utilities
export function vec3Floor(out: V3, v: V3.InputT): V3 {
  out[0] = Math.floor(v[0]);
  out[1] = Math.floor(v[1]);
  out[2] = Math.floor(v[2]);
  return out;
}

export function aabbDbg(v: AABB): string {
  return `min:${vec3Dbg(v.min)},max:${vec3Dbg(v.max)}`;
}
export function vec2Dbg(v: V2.InputT): string {
  return `[${v[0].toFixed(2)},${v[1].toFixed(2)}]`;
}
// TODO(@darzu): RENAME AND MOVE
export function vec3Dbg(v?: V3.InputT): string {
  return v
    ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`
    : "NIL";
}
export function vec3Dbg2(v: V3.InputT, precision = 2): string {
  return `V(${v[0].toFixed(precision)},${v[1].toFixed(
    precision
  )},${v[2].toFixed(precision)})`;
}
export function vec4Dbg(v?: V4.InputT): string {
  return v
    ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)},${v[3].toFixed(
        2
      )}]`
    : "NIL";
}
export function vec4Dbg2(v: V4.InputT, precision = 2): string {
  return `V(${v[0].toFixed(precision)},${v[1].toFixed(
    precision
  )},${v[2].toFixed(precision)},${v[3].toFixed(precision)})`;
}
export function quatDbg(q: quat): string {
  const axis = V3.tmp();
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
export function mat3Dbg(v: mat3): string {
  const ns = [...v].map((n) => n.toFixed(2));
  return (
    "" +
    `${ns[0]}\t|${ns[3]}\t|${ns[6]}\t
${ns[1]}\t|${ns[4]}\t|${ns[7]}\t
${ns[2]}\t|${ns[5]}\t|${ns[8]}\t`
  );
}

// TODO(@darzu): PERF! Add , out?: V3
export function centroid(...vs: V3[]): V3 {
  const avgX = avg(vs.map((v) => v[0]));
  const avgY = avg(vs.map((v) => v[1]));
  const avgZ = avg(vs.map((v) => v[2]));
  return V(avgX, avgY, avgZ);
}

// quat utilities
// TODO(@darzu): replace all usages with the new, better version in sprig-matrix
// TODO(@darzu): This impl assumes +y is up, +z is fwd
// assumes local up axis is [0,1,0] and forward is [0,0,1]
// TODO(@darzu): Z_UP: merge into sprig-matrix
const __t1 = V3.mk();
const __t2 = V3.mk();
export function quatFromUpForward_OLD(
  out: quat,
  up: V3.InputT,
  forwardish: V3.InputT
): quat {
  // https://stackoverflow.com/questions/52413464/look-at-quaternion-using-up-vector/52551983#52551983
  // TODO(@darzu): swap this with orthonormalize()
  const side = V3.cross(forwardish, up, __t1);
  V3.neg(side, side); // TODO(@darzu): is this negate right?
  V3.norm(side, side);
  const backward = V3.cross(side, up, __t2);

  // TODO(@darzu): replace this with using quat.fromMat3
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

export type SupportFn = (d: V3) => V3;
export function farthestPointInDir(points: V3[], d: V3): V3 {
  let max = -Infinity;
  let maxP: V3 | null = null;
  for (let p of points) {
    const n = V3.dot(p, d);
    if (n > max) {
      max = n;
      maxP = p;
    }
  }
  return maxP!;
}

export function uintToVec3unorm(i: number, max: number): V3 {
  return V3.clone([
    (((((i % 7) + 1) & 1) >> 0) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 2) >> 1) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 4) >> 2) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
  ]);
}

// Changes all vec2s to be in the range [0,1] based on the max and min values
//   of the whole array.
export function normalizeVec2s(vs: V2[], min: number, max: number): void {
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
const screenCorners: TupleN<V3, 8> = [
  V(+1.0, +1.0, +1.0),
  V(+1.0, +1.0, 0.0),
  V(+1.0, -1.0, +1.0),
  V(+1.0, -1.0, 0.0),
  V(-1.0, +1.0, +1.0),
  V(-1.0, +1.0, 0.0),
  V(-1.0, -1.0, +1.0),
  V(-1.0, -1.0, 0.0),
];

const _tempWorldCorners: TupleN<V3, 8> = screenCorners.map((_) =>
  V(0, 0, 0)
) as TupleN<V3, 8>;
export function getFrustumWorldCorners(invViewProj: mat4, out?: TupleN<V3, 8>) {
  out = out ?? _tempWorldCorners;
  assertDbg(out.length === screenCorners.length);
  for (let i = 0; i < screenCorners.length; i++)
    V3.tMat4(screenCorners[i], invViewProj, out[i]);
  return out;
}

// TODO(@darzu): kinda hate this fn..
export function positionAndTargetToOrthoViewProjMatrix(
  out: mat4,
  position: V3,
  target: V3
): mat4 {
  const viewMatrix = out;
  mat4.lookAt(position, target, [0, 1, 0], viewMatrix);
  const projectionMatrix = mat4.tmp();
  const dist = V3.dist(position, target);
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

export function signedAreaOfTriangle(a: V2, b: V2, c: V2): number {
  const ab = V2.sub(b, a);
  const ac = V2.sub(c, a);
  let cross = V2.cross(ab, ac);
  return 0.5 * cross[2];
}
export function signedAreaOfTriangle3(a: V3, b: V3, c: V3): number {
  const ab = V3.sub(b, a);
  const ac = V3.sub(c, a);
  let cross = V3.cross(ab, ac);
  return 0.5 * V3.len(cross);
}

// TODO(@darzu):  move to sprig-matrix.ts

export function vec3Reverse(out: V3) {
  const t = out[0];
  out[0] = out[2];
  out[2] = t;
  return out;
}

export function vec4Reverse(out: V4) {
  let t = out[0];
  out[0] = out[3];
  out[3] = t;
  t = out[1];
  out[1] = out[2];
  out[2] = t;
  return out;
}

export function vec4RotateLeft(out: V4) {
  let t = out[0];
  out[0] = out[1];
  out[1] = out[2];
  out[2] = out[3];
  out[3] = t;
  return out;
}

const _tempViewCorners: V3[] = [];
const _tempViewAABB = createAABB();
export function frustumFromBounds(
  worldCorners: V3[],
  eyePos: V3,
  outFrust: mat4
) {
  // view matrix
  const viewTmp = mat4.lookAt(eyePos, [0, 0, 0], [0, 1, 0]);

  // resize temp buffers if needed
  // TODO(@darzu): PERF. doesn't work so well if we get variable numbers of world points
  resizeArray(_tempViewCorners, worldCorners.length, () => V3.mk());

  // translate & rotate camera frustum world corners into light view
  worldCorners.forEach((p, i) => V3.tMat4(p, viewTmp, _tempViewCorners[i]));

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

// TODO(@darzu): Z_UP: we probably don't need angleBetweenPosXZ instead of just XY
const __angleBetweenXZTmp0 = V3.mk();
const __angleBetweenXZTmp1 = V3.mk();
const __angleBetweenXZTmp2 = V3.mk();
export function angleBetweenPosXZ(
  pos: V3,
  rot: quat,
  fwd: V3, // NOTE: fwd needs to be normalized and with 0 y component
  target: V3
): number {
  const toward = V3.norm(
    [target[0] - pos[0], 0, target[2] - pos[2]],
    __angleBetweenXZTmp0
  );
  const currFwd = V3.tQuat(fwd, rot, __angleBetweenXZTmp1);
  return angleBetweenXZ(currFwd, toward);
}

// NOTE: assumes dir1 and dir2 are normalized
export function angleBetweenXZ(norm1: V3, norm2: V3): number {
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
