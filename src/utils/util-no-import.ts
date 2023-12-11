// NOTE: No imports! This is included at everywhere

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
