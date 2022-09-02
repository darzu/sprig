import * as GLM from "gl-matrix.js";

interface Float32ArrayOfLength<N extends number> extends Float32Array {
  length: N;
}

export type vec2 = Float32ArrayOfLength<2>;

export type vec3 = Float32ArrayOfLength<3>;

export type quat = Float32ArrayOfLength<4>;

export type mat3 = Float32ArrayOfLength<9>;

export type mat4 = Float32ArrayOfLength<16>;

function float32ArrayOfLength<N extends number>(n: N): Float32ArrayOfLength<N> {
  return new Float32Array(n) as Float32ArrayOfLength<N>;
}

const BUFFER_SIZE = 1024;
const buffer = new ArrayBuffer(BUFFER_SIZE);
let bufferIndex = 0;
function tmpArray<N extends number>(n: N): Float32ArrayOfLength<N> {
  if (bufferIndex + n > BUFFER_SIZE) {
    throw `Too many temp Float32Arrays allocated--try increasing BUFFER_SIZE`;
  }
  const arr = new Float32Array(buffer, bufferIndex, n);
  bufferIndex += n;
  return arr as Float32ArrayOfLength<N>;
}

export function resetBuffer() {
  bufferIndex = 0;
}

export module vec2 {
  type T = vec2;
  type InputT = T | readonly [number, number];
  const GL = GLM.vec2;

  function tmp(): T {
    return tmpArray(2);
  }

  export function create(): T {
    return float32ArrayOfLength(2);
  }

  export function copy(out: T, v1: InputT): void {
    GL.copy(out, v1) as T;
  }

  export function fromValues(n0: number, n1: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    return out;
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function normalize(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function length(v1: InputT): number {
    return GL.length(v1);
  }
  export function dot(v1: InputT, v2: InputT): number {
    return GL.dot(v1, v2);
  }
  export function cross(v1: InputT, v2: InputT, out?: vec3.T) {
    return GL.cross(out ?? vec3.tmp(), v1, v2);
  }
  export function scale(v1: InputT, n: number, out?: T) {
    return GL.scale(out ?? vec3.tmp(), v1, n);
  }
}

export module vec3 {
  export type T = vec3;
  export type InputT = T | readonly [number, number, number];
  const GL = GLM.vec3;

  export function tmp(): T {
    return tmpArray(3);
  }

  export function create(): T {
    return float32ArrayOfLength(3);
  }

  export function copy(out: T, v1: InputT): void {
    GL.copy(out, v1) as T;
  }

  export function fromValues(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function normalize(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function length(v1: InputT): number {
    return GL.length(v1);
  }
  export function dot(v1: InputT, v2: InputT): number {
    return GL.dot(v1, v2);
  }
  export function cross(v1: InputT, v2: InputT, out?: T) {
    return GL.cross(out ?? tmp(), v1, v2);
  }
  export function scale(v1: InputT, n: number, out?: T) {
    return GL.scale(out ?? vec3.tmp(), v1, n);
  }

  export function zero(out?: T): T {
    return GL.zero(out ?? tmp()) as T;
  }
}

export module quat {
  export type T = quat;
  export type InputT = T | readonly [number, number, number, number];
  const GL = GLM.quat;

  export function tmp(): T {
    return tmpArray(4);
  }

  export function create(): T {
    return float32ArrayOfLength(4);
  }

  export function copy(out: T, v1: InputT): void {
    GL.copy(out, v1) as T;
  }

  export function fromValues(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function slerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.slerp(out ?? tmp(), v1, v2, n) as T;
  }

  export function normalize(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function identity(out?: T): T {
    return GL.identity(out ?? tmp()) as T;
  }

  export function conjugate(v1: InputT, out?: T): T {
    return GL.conjugate(out ?? tmp(), v1) as T;
  }
}

export module mat4 {
  export type T = mat4;
  // prettier-ignore
  export type InputT = T | readonly [number, number, number, number,
                                     number, number, number, number,
                                     number, number, number, number,
                                     number, number, number, number];
  const GL = GLM.mat4;

  export function tmp(): T {
    return tmpArray(16);
  }

  export function create(): T {
    return float32ArrayOfLength(16);
  }

  export function copy(out: T, v1: InputT): void {
    GL.copy(out, v1) as T;
  }

  export function fromValues(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }

  export function identity(out?: T): T {
    return GL.identity(out ?? tmp()) as T;
  }
}
