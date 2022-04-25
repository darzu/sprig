import { assert } from "./test.js";

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
  if (n < min) return min;
  else if (n > max) return max;
  return n;
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

export function align(x: number, size: number): number {
  return Math.ceil(x / size) * size;
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
  assert(inMin < inMax, "must be: inMin < inMax");
  assert(outMin <= outMax, "must be: outMin <= outMax");
  assert(inMin <= n && n <= inMax, "must be: inMin <= n && n <= inMax");
  const s = (n - inMin) / (inMax - inMin);
  return s * (outMax - outMin) + outMin;
}
