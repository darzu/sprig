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

export function isString(val: any): val is string {
  return typeof val === "string";
}

(String.prototype as any).hashCode = function () {
  var hash = 0,
    i,
    chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr = this.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};
declare global {
  interface String {
    hashCode(): number;
  }
}