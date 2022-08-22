import { EaseFn } from "./animate-to.js";
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
  const progress = (n - inMin) / (inMax - inMin);
  return progress * (outMax - outMin) + outMin;
}
export function mathWrap(n: number, max: number): number {
  // TODO(@darzu): support min?
  const r = max;
  const p = ((n % r) + r) % r; // TODO(@darzu): probably a more compact way to do this
  return p;
}
export function mathMix(a: number, b: number, p: number): number {
  return a * (1 - p) + b * p;
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
