import { DBG_ASSERT, VERBOSE_LOG } from "../flags.js";
import { randInt } from "./math.js";

// TODO(@darzu): When we need a util, check here first:
//    https://github.com/microsoft/TypeScript/blob/main/src/compiler/core.ts
//    https://github.com/microsoft/TypeScript/blob/main/src/compiler/corePublic.ts

// TODO(@darzu): MOVE to util-no-import
export function assert(cond: any, msg?: string): asserts cond {
  // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
  if (!cond)
    throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}

export function assertDbg(cond: any, msg?: string): asserts cond {
  if (DBG_ASSERT) assert(cond, msg);
}

export type Intersect<A> = A extends [infer X, ...infer Y]
  ? X & Intersect<Y>
  : {};
export type Union<A> = A extends [infer X, ...infer Y] ? X | Union<Y> : never;

// TODO(@darzu): consider using a non recursive definition for performance
export type TupleN<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleN<T, N, []>
  : never;
export type _TupleN<
  T,
  N extends number,
  R extends unknown[]
> = R["length"] extends N ? R : _TupleN<T, N, [T, ...R]>;

export function range(length: number): number[] {
  return ((new Array(length) as any).fill(null) as number[]).map((_, i) => i);
}

export function edges<T>(ts: T[]): [T | null, T | null][] {
  return range(ts.length + 1).map((i) => [ts[i - 1] || null, ts[i] || null]);
}

export function zip<T, U>(ts: T[], us: U[]): [T, U][] {
  return ts.map((t, i) => <[T, U]>[t, us[i]]);
}

export function __isSMI(n: number): boolean {
  // Checks if a number is within the "small integer" range
  //  that V8 uses on 64-bit platforms to efficiently represent
  //  small ints. Keeping numbers within this range _should_
  //  lead to better perf esp. for arrays.
  return -(2 ** 31) < n && n < 2 ** 31 - 1;
}
const CHECK_PAIR_RANGE = true;

export type IdPair = number;
export function idPair(aId: number, bId: number): IdPair {
  // TODO(@darzu): need a better hash?
  // TODO(@darzu): for perf, ensure this always produces a V8 SMI when given two <2^16 SMIs.
  //                Also maybe constrain ids to <2^16
  // if (CHECK_PAIR_RANGE) {
  //   assert(aId < 2 ** 16 && bId < 2 ** 16, "IDs r too big for idPair!");
  // }
  const h = aId < bId ? (aId << 16) ^ bId : (bId << 16) ^ aId;
  // TODO(@darzu): DEBUGGING for perf, see comments in __isSMI
  // if (CHECK_PAIR_RANGE && !__isSMI(h))
  //   console.error(`id pair hash isn't SMI: ${h}`);
  return h;
}
export function packI16s(a: number, b: number): number {
  // if (CHECK_PAIR_RANGE && (a >= 2 ** 15 || a <= -(2 ** 15)))
  //   console.error(`numbers in num pair r too big!`);
  // if (CHECK_PAIR_RANGE && (b >= 2 ** 15 || b <= -(2 ** 15)))
  //   console.error(`numbers in num pair r too big!`);
  // console.log(
  //   `${aNeg}${bNeg}\n${toBinary(aP)}\n${toBinary(bP)}\n${toBinary(h)}\n`
  // );
  // if (CHECK_PAIR_RANGE && !__isSMI(h))
  //   console.error(`id pair hash isn't SMI: ${h}`);
  return (a << 16) | (b & 0xffff);
}
// NOTE:
//  using [number, number] takes ~1500ms for 1,000,000,000 pack/unpacks
//  using { a: number; b: number } takes ~640ms for 1,000,000,000 pack/unpacks
// but the [,] notation is more convenient and fast enough for now.
export function unpackI16s(ab: number): [number, number] {
  return [ab >> 16, (ab << 16) >> 16];
}
// export function unpackI16s(ab: number): { a: number; b: number } {
//   return { a: ab >> 16, b: (ab << 16) >> 16 };
// }

export function testPackUnpackI16() {
  _testPackUnpackI16(0, 0);
  _testPackUnpackI16(1, -1);
  _testPackUnpackI16(-1, 1);
  _testPackUnpackI16(-1000, -1000);
  _testPackUnpackI16(2 ** 15 - 1, -(2 ** 15) + 1);
  _testPackUnpackI16(-(2 ** 15) + 1, 2 ** 15 - 1);
  _testPackUnpackI16(-2747, 1);

  for (let i = 0; i < 10; i++) {
    const a = randInt(-(2 ** 15) + 1, 2 ** 15 - 1);
    const b = randInt(-(2 ** 15) + 1, 2 ** 15 - 1);
    _testPackUnpackI16(a, b);
  }

  // speed test
  // const before = performance.now();
  // let x = -2747;
  // let y = 100;
  // for (let i = 0; i < 1000000000; i++) {
  //   // let { a, b } = unpackI16s(packI16s(x, y));
  //   let [x1, y2] = unpackI16s(packI16s(x, y));
  //   // [x, y] = unpackI16s(packI16s(x, y));
  // }
  // const after = performance.now();
  // console.log(`PackUnpack took ${(after - before).toFixed(2)}ms`);

  function _testPackUnpackI16(a: number, b: number) {
    const ab = packI16s(a, b);
    const [a2, b2] = unpackI16s(ab);
    assert(
      a === a2 && b === b2,
      `PackUnpackI16 failure\n${a} & ${b}\nbecame ${a2} & ${b2}`
    );
  }
}

export function isString(val: any): val is string {
  return typeof val === "string";
}

export function hashCode(s: string) {
  var hash = 0,
    i,
    chr;
  if (s.length === 0) return hash;
  for (i = 0; i < s.length; i++) {
    chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
    // TODO: is the next line necessary?
    hash >>>= 0; // Convert to unsigned
  }
  return hash;
}

export function objMap<A extends {}, V1 extends A[keyof A], V2>(
  a: A,
  map: (v1: V1, n: keyof A) => V2
): { [P in keyof A]: V2 } {
  const res: { [k: string]: V2 } = {};
  Object.entries(a).forEach(([n, v1]) => {
    res[n] = map(v1 as V1, n as keyof A);
  });
  return res as { [P in keyof A]: V2 };
}
export function toRecord<A, V, K extends string | number = string>(
  as: A[],
  key: (a: A, i: number) => K,
  val: (a: A, i: number) => V
): Record<K, V> {
  const res: { [k: string]: V } = {};
  as.forEach((a, i) => (res[key(a, i)] = val(a, i)));
  return res as Record<K, V>;
}
export function toMap<A, V, K extends string | number = string>(
  as: readonly A[],
  key: (a: A) => K,
  val: (a: A) => V
): Map<K, V> {
  const res = new Map();
  as.forEach((a) => res.set(key(a), val(a)));
  return res as Map<K, V>;
}

// TODO(@darzu): this is is a typescript hack for the fact that just using "false"
//  causes type inference (specifically type narrowing) to not work right in
//  dead code sometimes (last tested with tsc v4.2.3)
export const FALSE: boolean = false;

export type NumberTuple<ES> = { [_ in keyof ES]: number };

export function toBinary(n: number, digits = 32): string {
  let s = (n >>> 0).toString(2);
  while (s.length < digits) s = "0" + s;
  return s;
}

let _logOnceKeys: Set<string> = new Set();
export function dbgLogOnce(key: string, msg?: string, warn = false) {
  if (!_logOnceKeys.has(key)) {
    _logOnceKeys.add(key);
    console[warn ? "warn" : "log"](msg ?? key);
  }
}
export function dbgDirOnce(key: string, obj?: any) {
  if (!_logOnceKeys.has(key)) {
    _logOnceKeys.add(key);
    console.dir(obj ?? key);
  }
}
export function dbgOnce(key: string): boolean {
  if (!_logOnceKeys.has(key)) {
    _logOnceKeys.add(key);
    return true;
  } else return false;
}

// HACK: these two functions are just to make copying text out of the
//  browser's console window easier b/c by batching you don't get line
//  numbers.
let __logBatch = "";
export function dbgLogLineBatch(msg: string) {
  __logBatch += msg + "\n";
}
export function dbgLogNextBatch() {
  if (__logBatch) console.log(__logBatch);
  __logBatch = "";
}

// TODO(@darzu): do more sophisticated perf milestone tracking
export function dbgLogMilestone(msg: string) {
  if (dbgOnce(msg)) console.log(`${performance.now().toFixed(2)}ms: ${msg}`);
}

export function isArray(t: any): t is readonly unknown[] {
  // See: https://github.com/microsoft/TypeScript/issues/17002
  return Array.isArray(t);
}
export function isFunction(t: any): t is (...args: any[]) => any {
  return typeof t === "function";
}
export function isNumber(t: any): t is number {
  return typeof t === "number";
}

export function capitalize<S extends string>(s: S): Capitalize<S> {
  return `${s[0].toUpperCase()}${s.slice(1)}` as any;
}
export function uncapitalize<S extends string>(s: S): Uncapitalize<S> {
  return `${s[0].toLowerCase()}${s.slice(1)}` as any;
}
export function pluralize<S extends string>(s: S): `${S}s` {
  return `${s}s`; // lol
}

export function arraySortedEqual<T>(vs: T[], us: T[]): boolean {
  if (vs.length !== us.length) return false;
  for (let i = 0; i < vs.length; i++) if (vs[i] !== us[i]) return false;
  return true;
}
export function arrayUnsortedEqual<T>(vs: T[], us: T[]): boolean {
  // NOTE: inefficient for large lengths
  if (vs.length !== us.length) return false;
  for (let i1 = 0; i1 < vs.length; i1++) {
    let match = false;
    for (let i2 = 0; i2 < vs.length; i2++) {
      if (vs[i1] === us[i2]) {
        match = true;
        break;
      }
    }
    if (!match) return false;
  }
  return true;
}

export async function asyncTimeout(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, ms);
  });
}

export function createIntervalTracker(maxSep: number) {
  let min = Infinity;
  let max = -Infinity;

  const intervals: { min: number; max: number }[] = [];

  function addRange(rMin: number, rMax: number) {
    if (
      min === Infinity ||
      (min - maxSep <= rMin && rMin <= max + maxSep) || // rMin is inside
      (min - maxSep <= rMax && rMax <= max + maxSep) // rMax is inside
    ) {
      // update interval
      min = Math.min(min, rMin);
      max = Math.max(max, rMax);
    } else {
      // start new interval
      intervals.push({ min, max });
      min = rMin;
      max = rMax;
    }
  }
  function finishInterval() {
    if (min !== Infinity) {
      intervals.push({ min, max });
      min = Infinity;
      max = -Infinity;
    }
  }

  return {
    intervals,
    addRange,
    finishInterval,
  };
}

// Takes in a bounding width/height (e.g. viewport width/height), the aspect-ratio
//   of a child rectangle we want to enclose, and returns the maximum child rectangle
//   width that can be bound and maintain its aspect ratio.
export function boxInBox(
  boundW: number,
  boundH: number,
  childAR: number
): number {
  const boundAR = boundW / boundH;
  // smaller aspect-ratio means "more portrait", so we're width-constrained
  if (boundAR < childAR) return boundW;
  // larger aspect-ratio means "more landscape", so we're height-constrained
  else return boundH * childAR;
}

// TODO(@darzu): would be nice to have a dbg mode where we assert that this isn't
//    being triggered at different lengths at a callsite in the steady state
// TODO(@darzu): actually we probably don't want this fn, better to just do a while loop + assert length hasn't shrunk?
export function resizeArray<T, T2 extends T>(
  arr: T[],
  len: number,
  make: () => T2 // TS HACK: we have to use `T2 extends T` here otherwise TS would allow T to infer as that intersection of arr and make
) {
  // if it's too small, append new elements
  while (arr.length < len) arr.push(make());
  // if it's too big, chop off the extra (hacky JS pattern)
  if (arr.length > len) arr.length = len;
}

export function enumNamesAsList<T extends {}>(e: T): (keyof T)[] {
  return Object.keys(e)
    .filter((key) => !isNaN(Number(key)))
    .map((key) => e[key as keyof T] as keyof T);
}
export function enumAsList<T extends {}>(e: T): T[keyof T][] {
  const values: number[] = Object.keys(e)
    .map((key) => Number(key))
    .filter((key) => !isNaN(key));
  // TODO(@darzu): sort?
  return values as T[keyof T][];
}

export function isPromise(p: unknown): p is Promise<unknown> {
  return p instanceof Promise;
}

export type NonNull = string | number | boolean | symbol | object;

export type TAssert<A extends true> = A;

// export type TEquals<X, Y> =
//     (<T>() => T extends X ? 1 : 2) extends
//     (<T>() => T extends Y ? 1 : 2) ? true : false;

export type IsOptional<T> = T | undefined extends T ? true : false;

export interface WeakCache<V extends object> {
  _create: (key: string) => V;
  getOrCreate: (key: string) => V;
}
export function makeWeakCache<V extends object>(
  create: (key: string) => V
): WeakCache<V> {
  // From: https://github.com/tc39/proposal-weakrefs
  const cache = new Map<string, WeakRef<V>>();
  const cleanup = new FinalizationRegistry<string>((key) => {
    // TODO(@darzu): check notes concurrency considerations
    const ref = cache.get(key);
    if (ref && !ref.deref()) cache.delete(key);
  });

  function getOrCreate(key: string): V {
    const cached = cache.get(key)?.deref();
    if (cached !== undefined) return cached;
    const fresh = create(key);
    cache.set(key, new WeakRef(fresh));
    cleanup.register(fresh, key);
    return fresh;
  }

  return {
    _create: create,
    getOrCreate,
  };
}
