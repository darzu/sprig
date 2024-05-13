// TODO(@darzu): REMOVE!

// types
export type V2 = { x: number; y: number };
export interface Sized {
  size: V2;
}

// vectors
export function add(a: V2, b: V2): V2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: V2, b: V2): V2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function div(a: V2, c: number): V2 {
  return { x: a.x / c, y: a.y / c };
}
export function dist2(v: V2): number {
  return v.x ** 2 + v.y ** 2;
}
export function dist(v: V2): number {
  return Math.sqrt(dist2(v));
}

// functions
export function sum(ns: number[]): number {
  return ns.reduce((p, n) => p + n, 0);
}
export function max(ns: number[]): number {
  return ns.reduce((p, n) => (p > n ? p : n), -9999999);
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
  return ns.reduce((p, n) => (p < n ? p : n), 9999999);
}
export function even(n: number) {
  return n % 2 == 0;
}

export type N3 = [number, number, number];
export type Mat = [N3, N3, N3];
export function multiplyMatrices(a: Mat, b: N3): N3 {
  return [
    a[0][0] * b[0] + a[0][1] * b[1] + a[0][2] * b[2],
    a[1][0] * b[0] + a[1][1] * b[1] + a[1][2] * b[2],
    a[2][0] * b[0] + a[2][1] * b[1] + a[2][2] * b[2],
  ];
}
