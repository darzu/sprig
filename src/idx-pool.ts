import { assertDbg } from "./util.js";

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

  function next(): number | undefined {
    for (let i = 0; i < isFree.length; i++) {
      const result = cursor;
      cursor += 1;
      if (cursor >= isFree.length) cursor = 0;
      if (isFree[result]) {
        isFree[result] = false;
        return result;
      }
    }
    return undefined; // pool full
  }
  function free(idx: number) {
    assertDbg(!isFree[idx], `trying to double free?`);
    isFree[idx] = true;
  }

  return {
    next,
    free,
  };
}
