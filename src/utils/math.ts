import { mat3, vec3 } from "../matrix/sprig-matrix.js";
import { EaseFn } from "./util-ease.js";
import { assert } from "./util.js";
import { vec3Dbg } from "./utils-3d.js";

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
export function min(ns: number[]): number {
  return ns.reduce((p, n) => (p < n ? p : n), Infinity);
}
export function even(n: number) {
  return n % 2 == 0;
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
export function mathMap(
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
  const progress = (n - inMin) / (inMax - inMin);
  return progress * (outMax - outMin) + outMin;
}
export function mathMapNEase(
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
  let progress = (n - inMin) / (inMax - inMin);
  if (easeFn) progress = easeFn(progress);
  return progress * (outMax - outMin) + outMin;
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
): vec3 {
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
  const abc = vec3.transformMat3([y0, y1, y2], inv, vec3.create());
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
