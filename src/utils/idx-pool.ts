import { DBG_ASSERT } from "../flags.js";
import { assert, assertDbg } from "./util.js";

export type IdxRing = ReturnType<typeof createIdxRing>;
export type IdxPool = ReturnType<typeof createIdxPool>;

// ring buffer
export function createIdxRing(size: number) {
  let _last = -1;
  let generation = 0;

  function next(): number {
    let next = _last + 1;
    if (next >= size) {
      next = 0;
      generation += 1;
    }
    _last = next;
    return next;
  }

  return {
    next,
    generation,
    _last,
  };
}

// random access
export function createIdxPool(size: number) {
  // TODO(@darzu): what to do on empty?
  const isFree: boolean[] = new Array(size).fill(true);
  let cursor = 0;
  let numFree = size;

  function reset() {
    isFree.fill(true);
    cursor = 0;
    numFree = size;
  }

  function next(): number | undefined {
    if (numFree === 0) return undefined; // pool full
    for (let i = 0; i < isFree.length; i++) {
      const result = cursor;
      cursor += 1;
      if (cursor >= isFree.length) cursor = 0;
      if (isFree[result]) {
        isFree[result] = false;
        numFree--;
        return result;
      }
    }
    assert(false, `pool error: ${numFree}, c: ${cursor}`);
  }
  function free(idx: number, ignoreDoubleFree = false) {
    if (DBG_ASSERT && !ignoreDoubleFree)
      assertDbg(!isFree[idx], `trying to double free?`);
    if (!isFree[idx]) {
      isFree[idx] = true;
      numFree++;
    }
  }

  reset();

  return {
    next,
    free,
    reset,
    _cursor: () => cursor, // HACK: don't expose?
    numFree: () => numFree,
  };
}
