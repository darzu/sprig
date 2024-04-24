// NOTE: No imports in this file! This file is included at top-level stuff like sprig-matrix
// TODO(@darzu): It's annoying to have to work around dependency issues with things like this.

export const PI = Math.PI; // TODO(@darzu): replace all usage with PI
export const PIn2 = Math.PI * 2; // PI numerator 2
export const PId2 = Math.PI / 2; // PI denominator 2
export const PId3 = Math.PI / 3; // 60 degrees
export const PId4 = Math.PI / 4; // 45 degrees
export const PId6 = Math.PI / 6; // 30 degrees
export const PId8 = Math.PI / 8; // 22.5 degrees
export const PId12 = Math.PI / 12; // 15 degrees
export const PId36 = Math.PI / 36; // 5 degrees

export function getCallStack(): string[] {
  return new Error()
    .stack!.split("\n")
    .map((ln) => ln.trim())
    .filter((ln) => ln !== "Error" && !ln.includes("getCallStack"));
}

let blameMaps = new Map<string, Map<string, number>>();
export function dbgAddBlame(kind: string, amount: number) {
  let map = blameMaps.get(kind);
  if (!map) {
    map = new Map<string, number>();
    blameMaps.set(kind, map);
  }
  getCallStack().forEach((ln) => {
    map!.set(ln, (map!.get(ln) ?? 0) + amount);
  });
}
export function dbgGetBlame(kind: string) {
  return blameMaps.get(kind);
}
export function dbgClearBlame(kind: string) {
  blameMaps.get(kind)?.clear();
}

export function never(x: never, msg?: string): never {
  throw new Error(msg ?? `never(${x})`);
}

// TODO(@darzu): put on prototype?
export function flatten<A>(doubleArr: A[][]): A[] {
  return doubleArr.reduce((p, n) => [...p, ...n], []);
}

export function assert(cond: any, msg?: string): asserts cond {
  // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
  if (!cond)
    throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}

export function T<N extends {}>(): (p: N) => N {
  return (p: N) => p;
}
