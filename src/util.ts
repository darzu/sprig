import { randInt } from "./math.js";
import { assert } from "./test.js";

export function range(length: number): number[] {
  return ((new Array(length) as any).fill(null) as number[]).map((_, i) => i);
}

export function edges<T>(ts: T[]): [T | null, T | null][] {
  return range(ts.length + 1).map((i) => [ts[i - 1] || null, ts[i] || null]);
}

export function zip<T, U>(ts: T[], us: U[]): [T, U][] {
  return ts.map((t, i) => <[T, U]>[t, us[i]]);
}

export function never(x: never, msg?: string): never {
  throw new Error(msg ?? "Unexpected object: " + x);
}

export function __isSMI(n: number): boolean {
  // Checks if a number is within the "small integer" range
  //  that V8 uses on 64-bit platforms to efficiently represent
  //  small ints. Keeping numbers within this range _should_
  //  lead to better perf esp. for arrays.
  return -(2 ** 31) < n && n < 2 ** 31 - 1;
}
const CHECK_PAIR_RANGE = false;

export type IdPair = number;
export function idPair(aId: number, bId: number): IdPair {
  // TODO(@darzu): need a better hash?
  // TODO(@darzu): for perf, ensure this always produces a V8 SMI when given two <2^16 SMIs.
  //                Also maybe constrain ids to <2^16
  if (CHECK_PAIR_RANGE) {
    assert(aId < 2 ** 16 && bId < 2 ** 16, "IDs r too big for idPair!");
  }
  const h = aId < bId ? (aId << 16) ^ bId : (bId << 16) ^ aId;
  // TODO(@darzu): DEBUGGING for perf, see comments in __isSMI
  if (CHECK_PAIR_RANGE && !__isSMI(h))
    console.error(`id pair hash isn't SMI: ${h}`);
  return h;
}
export function packI16(a: number, b: number): number {
  const aNeg = a < 0;
  const bNeg = b < 0;
  const aP = aNeg ? -a : a;
  const bP = bNeg ? -b : b;
  if (CHECK_PAIR_RANGE && (aP >= 2 ** 15 || bP >= 2 ** 15))
    console.error(`numbers in num pair r too big!`);
  const h =
    (aP << 17) | (bP << 2) | (aNeg ? 0b10 : 0b00) | (bNeg ? 0b01 : 0b00);
  if (CHECK_PAIR_RANGE && !__isSMI(h))
    console.error(`num pair hash isn't SMI: ${h}`);
  // console.log(
  //   `${aNeg}${bNeg}\n${toBinary(aP)}\n${toBinary(bP)}\n${toBinary(h)}\n`
  // );
  return h;
}
export function unpackI16(ab: number): [number, number] {
  const aNeg = (ab & 0b10) !== 0;
  const bNeg = (ab & 0b01) !== 0;
  const aP = (ab >>> 17) & 0b111111111111111;
  const bP = (ab >>> 2) & 0b111111111111111;
  const a = aNeg ? -aP : aP;
  const b = bNeg ? -bP : bP;
  return [a, b];
}

export function testPackUnpackI16() {
  _testPackUnpackI16(0, 0);
  _testPackUnpackI16(1, -1);
  _testPackUnpackI16(-1, 1);
  _testPackUnpackI16(-1000, -1000);
  _testPackUnpackI16(2 ** 15 - 1, -(2 ** 15) + 1);
  _testPackUnpackI16(-2747, 1);

  for (let i = 0; i < 10; i++) {
    const a = randInt(-(2 ** 15) + 1, 2 ** 15 - 1);
    const b = randInt(-(2 ** 15) + 1, 2 ** 15 - 1);
    _testPackUnpackI16(a, b);
  }

  // speed test
  const before = performance.now();
  let x = -2747;
  let y = 100;
  for (let i = 0; i < 10000000; i++) {
    const ab = packI16(x, y);
    [x, y] = unpackI16(ab);
  }
  const after = performance.now();
  console.log(`PackUnpack took ${(after - before).toFixed(2)}ms`);

  function _testPackUnpackI16(a: number, b: number) {
    const ab = packI16(a, b);
    const [a2, b2] = unpackI16(ab);
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

export function objMap<A, V1 extends A[keyof A], V2>(
  a: A,
  map: (v1: V1, n: keyof A) => V2
): { [P in keyof A]: V2 } {
  const res: { [k: string]: V2 } = {};
  Object.entries(a).forEach(([n, v1]) => {
    res[n] = map(v1, n as keyof A);
  });
  return res as { [P in keyof A]: V2 };
}
export function toRecord<A, V>(
  as: A[],
  key: (a: A) => string,
  val: (a: A) => V
): { [k: string]: V } {
  const res: { [k: string]: V } = {};
  as.forEach((a) => (res[key(a)] = val(a)));
  return res;
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
export function dbgLogOnce(key: string, msg?: string) {
  if (!_logOnceKeys.has(key)) {
    _logOnceKeys.add(key);
    console.log(msg ?? key);
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
