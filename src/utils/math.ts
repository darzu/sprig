import { V, mat3, orthonormalize, quat, V3 } from "../matrix/sprig-matrix.js";
import { EaseFn } from "./util-ease.js";
import { assert } from "./util.js";
import { quatDbg, vec3Dbg } from "./utils-3d.js";

// functions
export function sum(ns: number[]): number {
  return ns.reduce((p, n) => p + n, 0);
}
export function max(ns: number[]): number {
  return ns.reduce((p, n) => (p > n ? p : n), -Infinity);
}
export function avg(ns: number[]): number {
  return sum(ns) / ns.length;
}
export function clamp(n: number, min: number, max: number): number {
  return Math.max(Math.min(n, max), min);
}
export function wrap(n: number, min: number, max: number): number {
  // TODO(@darzu): use while instead?
  if (n < min) n += max - min;
  if (max < n) n -= max - min;
  return n;
}
export function min(ns: number[]): number {
  return ns.reduce((p, n) => (p < n ? p : n), Infinity);
}
export function even(n: number) {
  return n % 2 == 0;
}

// TODO(@darzu): useful? idea from freya
// TODO(@darzu): extend number's prototype?
export function atLeast(val: number, min: number) {
  return Math.max(val, min);
}
export function atMost(val: number, max: number) {
  return Math.min(val, max);
}

export const radToDeg = 180 / Math.PI;

export function jitter(radius: number): number {
  return (Math.random() - 0.5) * radius * 2;
}

export function randInt(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function randRadian(min = 0, max = Math.PI * 2.0) {
  return Math.random() * (max - min) + min;
}

export function align(x: number, size: number): number {
  return Math.ceil(x / size) * size;
}
export function alignDown(x: number, size: number): number {
  return Math.floor(x / size) * size;
}

export function chance(zeroToOne: number): boolean {
  return Math.random() < zeroToOne;
}

// maps a number from [inMin, inMax] to [outMin, outMax]
export function remap(
  n: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  // TODO(@darzu): actually, this works even if inMin > inMax, and/or outMin > outMax. idk why
  // assert(inMin < inMax, "must be: inMin < inMax");
  // assert(outMin <= outMax, "must be: outMin <= outMax");
  // assert(inMin <= n && n <= inMax, "must be: inMin <= n && n <= inMax");
  const progress = unlerp(inMin, inMax, n);
  return lerp(outMin, outMax, progress);
}
export function remapEase(
  n: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  easeFn?: EaseFn
): number {
  assert(inMin < inMax, "must be: inMin < inMax");
  assert(outMin <= outMax, "must be: outMin <= outMax");
  n = Math.max(n, inMin);
  n = Math.min(n, inMax);
  let progress = unlerp(inMin, inMax, n);
  if (easeFn) progress = easeFn(progress);
  return lerp(outMin, outMax, progress);
}

// returns [a,b,c] from y = a*x^2 + b*x + c
// given [x0, y0], [x1, y1], [x2, y2]
export function parabolaFromPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): V3 {
  const inv = mat3.invert([
    // column 1
    x0 ** 2,
    x1 ** 2,
    x2 ** 2,
    // column 2
    x0,
    x1,
    x2,
    // column 3
    1,
    1,
    1,
  ]);
  const abc = V3.tMat3([y0, y1, y2], inv, V3.mk());
  return abc;

  // // parabola test:
  // // y = x**2 + 1 from [0,1], [-2, 5], [1,2]
  // console.log(`parabolaFromPoints test: `);
  // console.log(vec3Dbg(parabolaFromPoints(0, 1, -2, 5, 1, 2)));
  // // y = 1.2x**2 -1x+ 2.3
  // console.log(
  //   vec3Dbg(parabolaFromPoints(1, 2.5, -0.48, 3.056, 3, 10.1))
  // );
}

export function sphereRadiusFromVolume(v: number) {
  return Math.pow(((3 / 4) * v) / Math.PI, 1 / 3);
}
export function sphereVolumeFromRadius(r: number) {
  return (4 / 3) * Math.PI * Math.pow(r, 3);
}

export function lerp(a: number, b: number, t: number): number {
  return (1.0 - t) * a + t * b;
}
export function unlerp(min: number, max: number, val: number): number {
  return (val - min) / (max - min);
}

// enable w/ RUN_UNIT_TESTS
export function testMath() {
  const fwd = V(0, 1, 0);
  const upish = V(0.2, 0.2, 1.0);
  // const right = V(0, 0, 0);
  const right = new Float32Array([0, 0, 0]) as V3;
  // console.log("orthonormalize:");
  // console.log(`fwd: ${vec3Dbg(fwd)}`);
  // console.log(`up: ${vec3Dbg(upish)}`);
  // console.log(`right: ${vec3Dbg(right)}`);
  // console.log("->");
  orthonormalize(fwd, upish, right);
  // console.log(`fwd: ${vec3Dbg(fwd)}`);
  // console.log(`up: ${vec3Dbg(upish)}`);
  // console.log(`right: ${vec3Dbg(right)}`);
  assert(V3.dist(right, [1, 0, 0]) < 0.3, "orthonormalize test");

  // test quat.fromForward
  {
    const vs = [
      V(0, 3, 0),
      V(3, 3, 0),
      V(0, 3, 3),
      V(0, 0, 3),
      V(3, 3, 3),
      V(0, 0, -3),
      V(-3, -3, 3),
      V(0, -3, 0),
      V(0, 0.3, 0),
      V(0.3, 0, 0),
    ];
    console.log("test quat.fromForward");
    const fwd = V(0, 1, 0);
    for (let v of vs) {
      const rot = quat.fromForward(v);
      const v2 = V3.tQuat(fwd, rot, V3.mk());
      console.log(`${vec3Dbg(v)} ==${quatDbg(rot)}==> ${vec3Dbg(v2)}`);
    }
  }

  // understand atan2
  if (false) {
    const dir = V(1, 0, 0);
    const steps = 10;
    const stepRad = (Math.PI * 2) / steps;
    for (let i = 0; i < steps; i++) {
      V3.rotZ(dir, [0, 0, 0], stepRad, dir);
      const angle = Math.atan2(dir[1], dir[0]);
      console.log(`dir: ${vec3Dbg(dir)}, atan2: ${angle}`);
    }
  }
}
