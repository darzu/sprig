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
