import { mat3, mat4, quat, vec2, vec3, vec4 } from "./gl-matrix.js";
import { avg, mathMap } from "./math.js";
import { AABB } from "./physics/broadphase.js";
import { tempVec2, tempVec3 } from "./temp-pool.js";

// TODO(@darzu): a lot of these need to move into gl-matrix; or rather, we need
//  to subsume gl-matrix into our own libraries.

// math utilities
export function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = vec3.cross(
    vec3.create(),
    vec3.sub(vec3.create(), p2, p1),
    vec3.sub(vec3.create(), p3, p1)
  );
  vec3.normalize(n, n);
  return n;
}

export function randNormalVec3(out: vec3) {
  vec3.set(out, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  vec3.normalize(out, out);
  return out;
}

export function randNormalVec2(out: vec2) {
  vec2.set(out, Math.random() - 0.5, Math.random() - 0.5);
  vec2.normalize(out, out);
  return out;
}

// matrix utilities
export function pitch(m: mat4, rad: number) {
  return mat4.rotateX(m, m, rad);
}
export function yaw(m: mat4, rad: number) {
  return mat4.rotateY(m, m, rad);
}
export function roll(m: mat4, rad: number) {
  return mat4.rotateZ(m, m, rad);
}
export function moveX(m: mat4, n: number) {
  return mat4.translate(m, m, [n, 0, 0]);
}
export function moveY(m: mat4, n: number) {
  return mat4.translate(m, m, [0, n, 0]);
}
export function moveZ(m: mat4, n: number) {
  return mat4.translate(m, m, [0, 0, n]);
}
export function getPositionFromTransform(t: mat4): vec3 {
  // TODO(@darzu): not really necessary
  const pos = vec3.create();
  vec3.transformMat4(pos, pos, t);
  return pos;
}
// vec utilities
export function vec3Floor(out: vec3, v: vec3): vec3 {
  out[0] = Math.floor(v[0]);
  out[1] = Math.floor(v[1]);
  out[2] = Math.floor(v[2]);
  return out;
}

export function aabbDbg(v: AABB): string {
  return `min:${vec3Dbg(v.min)},max:${vec3Dbg(v.max)}`;
}
export function vec2Dbg(v: vec2): string {
  return `[${v[0].toFixed(2)},${v[1].toFixed(2)}]`;
}
export function vec3Dbg(v: vec3): string {
  return `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`;
}
export function vec4Dbg(v: vec4): string {
  return `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(
    2
  )},${v[3].toFixed(2)}]`;
}
export function quatDbg(q: quat): string {
  const axis = tempVec3();
  const n = quat.getAxisAngle(axis, q);
  return `${vec3Dbg(axis)}*${n.toFixed(2)}`;
}
export function mat4Dbg(v: mat4): string {
  const ns = [...v].map((n) => n.toFixed(2));
  return (
    "" +
    `[${ns[0]},${ns[1]},${ns[2]},${ns[3]}
 ${ns[4]},${ns[5]},${ns[6]},${ns[7]}
 ${ns[8]},${ns[9]},${ns[10]},${ns[11]}
 ${ns[12]},${ns[13]},${ns[14]},${ns[15]}]`
  );
}
export function centroid(vs: vec3[]): vec3 {
  const avgX = avg(vs.map((v) => v[0]));
  const avgY = avg(vs.map((v) => v[1]));
  const avgZ = avg(vs.map((v) => v[2]));
  return vec3.fromValues(avgX, avgY, avgZ);
}
// TODO(@darzu):  move into gl-matrix?
export function vec3Mid(out: vec3, a: vec3, b: vec3): vec3 {
  out[0] = (a[0] + b[0]) * 0.5;
  out[1] = (a[1] + b[1]) * 0.5;
  out[2] = (a[2] + b[2]) * 0.5;
  return out;
}

// quat utilities
// assumes local up axis is [0,1,0] and forward is [0,0,1]
export function quatFromUpForward(out: quat, up: vec3, forwardish: vec3): quat {
  // https://stackoverflow.com/questions/52413464/look-at-quaternion-using-up-vector/52551983#52551983
  const side = vec3.cross(tempVec3(), forwardish, up);
  vec3.negate(side, side); // TODO(@darzu): is this negate right?
  vec3.normalize(side, side);
  const backward = vec3.cross(tempVec3(), side, up);

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
  return [
    (((((i % 7) + 1) & 1) >> 0) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 2) >> 1) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
    (((((i % 7) + 1) & 4) >> 2) * (Math.floor(i / 7) + 1)) / Math.ceil(max / 7),
  ];
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

export function positionAndTargetToOrthoViewProjMatrix(
  out: mat4,
  position: vec3,
  target: vec3
): mat4 {
  const viewMatrix = out;
  mat4.lookAt(viewMatrix, position, target, [0, 1, 0]);
  const projectionMatrix = mat4.create();
  const dist = vec3.dist(position, target);
  {
    const left = -80;
    const right = 80;
    const bottom = -80;
    const top = 80;
    const near = dist * 0.2;
    // TODO: examine this carefully-derived constant
    const far = dist * 1.5;
    mat4.ortho(projectionMatrix, left, right, bottom, top, near, far);
  }
  mat4.multiply(viewMatrix, projectionMatrix, viewMatrix);
  return viewMatrix;
}

export function signedAreaOfTriangle(a: vec2, b: vec2, c: vec2): number {
  const ab = tempVec2();
  const ac = tempVec2();
  vec2.subtract(ab, b, a);
  vec2.subtract(ac, c, a);
  let cross = vec2.cross(tempVec3(), ab, ac);
  return 0.5 * cross[2];
}

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
