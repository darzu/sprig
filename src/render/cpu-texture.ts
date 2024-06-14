import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { clamp } from "../utils/math.js";
import { assert } from "../utils/util.js";
import { never } from "../utils/util-no-import.js";

type ArityToVec<N extends 1 | 2 | 3 | 4> = N extends 1
  ? number
  : N extends 2
  ? V2
  : N extends 3
  ? V3
  : N extends 4
  ? V4
  : never;

export interface TextureReader<A extends 1 | 2 | 3 | 4> {
  size: [number, number];
  data: ArrayBuffer;
  format: GPUTextureFormat;
  outArity: A;
  read: (
    xi: number,
    yi: number,
    out?: A extends 1 ? undefined : ArityToVec<A>
  ) => ArityToVec<A>;
  sample: (
    x: number,
    y: number,
    out?: A extends 1 ? undefined : ArityToVec<A>
  ) => ArityToVec<A>;
}

// TODO(@darzu): we want a whole CPU-side texture library including
//  sampling, loading, comparison, derivatives, etc.
export function createTextureReader<A extends 1 | 2 | 3 | 4>(
  data: ArrayBuffer,
  size: [number, number],
  outArity: A,
  format: GPUTextureFormat
): TextureReader<A> {
  // TODO(@darzu): make generic?
  let tData: Float32Array | Uint8Array;
  let stride: number;
  if (format === "rgba32float") {
    stride = 4;
    tData = new Float32Array(data);
  } else if (format === "r16float") {
    stride = 1;
    tData = new Float32Array(data);
  } else if (format === "r8unorm") {
    stride = 1;
    tData = new Uint8Array(data);
  } else {
    throw new Error(`unimplemented texture format: ${format} in TextureReader`);
  }

  assert(outArity <= stride, "outArity <= stride");

  return {
    size,
    data,
    format,
    outArity,
    read: read as any as TextureReader<A>["read"],
    sample: sample as any as TextureReader<A>["sample"],
  };

  function getIdx(xi: number, yi: number): number {
    return (xi + yi * size[0]) * stride;
  }

  function read(
    x: number,
    y: number,
    out?: number | V2 | V3 | V4
  ): number | V2 | V3 | V4 {
    // TODO(@darzu): share code with sample
    const xi = clamp(Math.round(x), 0, size[0] - 1);
    const yi = clamp(Math.round(y), 0, size[1] - 1);
    const idx = getIdx(xi, yi);

    assert(typeof out === "number" || !out || out.length === outArity);
    if (outArity === 1) {
      return tData[idx];
    } else if (outArity === 2) {
      return V2.set(tData[idx], tData[idx + 1], (out ?? V2.tmp()) as V2);
    } else if (outArity === 3) {
      return V3.set(
        tData[idx],
        tData[idx + 1],
        tData[idx + 2],
        (out ?? V3.tmp()) as V3
      );
    } else if (outArity === 4) {
      return V4.set(
        tData[idx + 0],
        tData[idx + 1],
        tData[idx + 2],
        tData[idx + 3],
        (out ?? V4.tmp()) as V4
      );
    } else {
      never(outArity);
    }
  }

  // TODO(@darzu): probably inefficient way to do bounds checking
  function isDefault(xi: number, yi: number): boolean {
    if (outArity === 1) {
      return read(0, xi, yi) === 0;
    } else if (outArity === 2) {
      return V2.equals(read(xi, yi, V2.tmp()) as V2, V2.ZEROS);
    } else if (outArity === 3) {
      return V3.equals(read(xi, yi, V3.tmp()) as V3, V3.ZEROS);
    } else if (outArity === 4) {
      return V4.equals(read(xi, yi, V4.tmp()) as V4, V4.ZEROS);
    } else {
      never(outArity);
    }
  }

  function sample(
    x: number,
    y: number,
    out?: number | V2 | V3 | V4
  ): number | V2 | V3 | V4 {
    x = clamp(x, 0, size[0] - 1);
    y = clamp(y, 0, size[1] - 1);
    const xi0 = Math.floor(x);
    const xi1 = Math.ceil(x);
    const yi0 = Math.floor(y);
    const yi1 = Math.ceil(y);
    const dx = x % 1.0;
    const dy = y % 1.0;
    let ix0y0 = getIdx(xi0, yi0);
    let ix1y0 = getIdx(xi1, yi0);
    let ix0y1 = getIdx(xi0, yi1);
    let ix1y1 = getIdx(xi1, yi1);

    // bounds check
    // TODO(@darzu): this is hacky and inefficient. At minimum we shouldn't
    //  need to read texture values twice.
    // TODO(@darzu): actually this might not be necessary at all. we should
    //  probably have an SDF texture from the edge anyway for pushing the
    //  player back.
    const def00 = isDefault(xi0, yi0);
    const def10 = isDefault(xi1, yi0);
    const def01 = isDefault(xi0, yi1);
    const def11 = isDefault(xi1, yi1);
    if (def00) ix0y0 = ix1y0;
    if (def10) ix1y0 = ix0y0;
    if (def01) ix0y1 = ix1y1;
    if (def11) ix1y1 = ix0y1;
    if (def00 && def10) {
      ix0y0 = ix0y1;
      ix1y0 = ix1y1;
    }
    if (def01 && def11) {
      ix0y1 = ix0y0;
      ix1y1 = ix1y0;
    }

    function _sample(offset: 0 | 1 | 2 | 3): number {
      const outAy0 =
        tData[ix0y0 + offset] * (1 - dx) + tData[ix1y0 + offset] * dx;
      const outAy1 =
        tData[ix0y1 + offset] * (1 - dx) + tData[ix1y1 + offset] * dx;
      const outA = outAy0 * (1 - dy) + outAy1 * dy;
      return outA;
    }

    assert(typeof out === "number" || !out || out.length === outArity);
    if (outArity === 1) {
      return _sample(0);
    } else if (outArity === 2) {
      return V2.set(_sample(0), _sample(1), (out ?? V2.tmp()) as V2);
    } else if (outArity === 3) {
      return V3.set(
        _sample(0),
        _sample(1),
        _sample(2),
        (out ?? V3.tmp()) as V3
      );
    } else if (outArity === 4) {
      return V4.set(
        _sample(0),
        _sample(1),
        _sample(2),
        _sample(3),
        (out ?? V4.tmp()) as V4
      );
    } else {
      never(outArity);
    }
  }
}
