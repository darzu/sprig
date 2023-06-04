import {
  PERF_DBG_F32S,
  PERF_DBG_F32S_BLAME,
  PERF_DBG_F32S_TEMP_BLAME,
} from "../flags.js";
import * as GLM from "./gl-matrix.js";
import { dbgAddBlame, dbgClearBlame } from "../utils/util.js";

const EPSILON = 0.000001;

interface Float32ArrayOfLength<N extends number> extends Float32Array {
  length: N;
}

// TODO(@darzu): rename vec2 -> V2, vec3 -> V3 ?
export type vec2 = Float32ArrayOfLength<2>;

export type vec3 = Float32ArrayOfLength<3>;

export type vec4 = Float32ArrayOfLength<4>;

export type quat = Float32ArrayOfLength<4>;

export type mat3 = Float32ArrayOfLength<9>;

export type mat4 = Float32ArrayOfLength<16>;

// TODO(@darzu): All cases of:
//    vec*.clone([...])
//  should be
//    vec*.fromValues(...)
//  or something simpler (v3(), vc3(), ...)

// TODO(@darzu): CONSIDER "forever", "readonly", and literals with something like:
/*
interface ReadonlyFloat32ArrayOfLength<N extends number>
  extends Omit<
    Float32ArrayOfLength<N>,
    "copyWithin" | "fill" | "reverse" | "set" | "sort"
  > {
  readonly [n: number]: number;
}

declare const _forever: unique symbol;

// a vec3 "forever", means it isn't temp
export type vec3f =
  | [number, number, number]
  | (Float32ArrayOfLength<3> & { [_forever]: true });
// a vec3 "readonly", means the vec won't be modified through that alias
export type vec3r =
  | readonly [number, number, number]
  | ReadonlyFloat32ArrayOfLength<3>;
// a vec3 is either forever or temp, but it can't be
export type vec3 = vec3f | Float32ArrayOfLength<3>;

let eg_vec3f: vec3f = [0, 0, 0] as vec3f;
let eg_vec3r: vec3r = [0, 0, 0] as vec3r;
let eg_vec3: vec3 = vec3.create() as vec3;

// eg_vec3 = eg_vec3r; // illegal (weakens "readonly")
// eg_vec3 = eg_vec3f; // legal (unspecified if its temp or forever)
// eg_vec3r = eg_vec3; // legal (strengthens alias promise)
// eg_vec3r = eg_vec3f; // legal (strengthens alias promise)
// eg_vec3f = eg_vec3; // illegal (could be temp)
// eg_vec3f = eg_vec3r; // illegal (could be temp)
// eg_vec3fr = eg_vec3; // illegal (could be temp)
// eg_vec3fr = eg_vec3f; // legal (strengthening w/ readonly promise)
// eg_vec3fr = eg_vec3r; // illegal (could be temp)
*/

export let _f32sCount = 0; // TODO(@darzu): PERF DBG!
// TODO(@darzu): perhaps all non-temp (and temp) vecs should be suballocations on bigger Float32Arrays
//    this might give some perf wins w/ cache hits
function float32ArrayOfLength<N extends number>(n: N): Float32ArrayOfLength<N> {
  if (PERF_DBG_F32S) _f32sCount += n; // TODO(@darzu): PERF. very inner-loop. does this have a perf cost even when the flag is disabled?
  // console.log(new Error().stack!);
  if (PERF_DBG_F32S_BLAME) {
    dbgAddBlame("f32s", n);
  }
  return new Float32Array(n) as Float32ArrayOfLength<N>;
}

const BUFFER_SIZE = 8000;
const buffer = new ArrayBuffer(BUFFER_SIZE);
let bufferIndex = 0;
function tmpArray<N extends number>(n: N): Float32ArrayOfLength<N> {
  if (bufferIndex + n * Float32Array.BYTES_PER_ELEMENT > BUFFER_SIZE) {
    if (PERF_DBG_F32S_TEMP_BLAME) {
      if ((window as any).dbg) {
        // TODO(@darzu): HACK debugging
        (window as any).dbg.tempf32sBlame();
      }
    }
    throw `Too many temp Float32Arrays allocated! Use PERF_DBG_F32S_TEMP_BLAME to find culprit. Or if you must, try increasing BUFFER_SIZE (currently ${
      (Float32Array.BYTES_PER_ELEMENT * BUFFER_SIZE) / 1024
    }kb)`;
  }
  if (PERF_DBG_F32S_TEMP_BLAME) {
    dbgAddBlame("temp_f32s", n);
  }
  const arr = new Float32Array(buffer, bufferIndex, n);
  bufferIndex += arr.byteLength;
  return arr as Float32ArrayOfLength<N>;
}

export function resetTempMatrixBuffer() {
  bufferIndex = 0;

  if (PERF_DBG_F32S_TEMP_BLAME) {
    dbgClearBlame("temp_f32s");
  }
}

export function isTmpVec(v: Float32Array): boolean {
  return v.buffer === buffer;
}

// TODO(@darzu): generalize and put in util.ts?
export function findAnyTmpVec(
  obj: any,
  maxDepth = 100,
  path = ""
): string | null {
  if (maxDepth <= 0) {
    return null;
  } else if (!obj) {
    return null;
  } else if (obj instanceof Float32Array) {
    return isTmpVec(obj) ? path : null;
  } else if (obj instanceof Array) {
    return obj.reduce(
      (p: string | null, n, i) =>
        p ? p : findAnyTmpVec(n, maxDepth - 1, `${path}[${i}]`),
      null
    );
  } else if (obj instanceof Map) {
    for (let [k, v] of obj.entries()) {
      const found = findAnyTmpVec(v, maxDepth - 1, `${path}.get(${k})`);
      if (found) return found;
    }
    return null;
  }
  // NOTE: primatives (string, bool, number) and functions all return empty list for Object.keys
  return Object.keys(obj).reduce(
    (p: string | null, n, i) =>
      p ? p : findAnyTmpVec(obj[n], maxDepth - 1, `${path}.${n}`),
    null
  );
}

export module vec2 {
  export type T = vec2;
  export type InputT = T | readonly [number, number];
  const GL = GLM.vec2;

  export function tmp(): T {
    return tmpArray(2);
  }

  export function create(): T {
    return float32ArrayOfLength(2);
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export function zero(out?: T): T {
    return GL.zero(out ?? tmp()) as T;
  }

  export function set(n0: number, n1: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    return out;
  }

  export function fromValues(n0: number, n1: number): T {
    const out = create();
    out[0] = n0;
    out[1] = n1;
    return out;
  }

  // NOTE: output is normalized
  export function fromRadians(radians: number, out?: T): T {
    return set(Math.cos(radians), Math.sin(radians), out);
  }

  export const ZEROS = fromValues(0, 0);

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function div(v1: InputT, v2: InputT, out?: T): T {
    return GL.div(out ?? tmp(), v1, v2) as T;
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
  export function cross(v1: InputT, v2: InputT, out?: vec3.T): vec3.T {
    return GL.cross(out ?? vec3.tmp(), v1, v2) as vec3.T;
  }
  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function negate(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }
  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.sqrDist(v1, v2);
  }
  export function rotate(v1: InputT, v2: InputT, rad: number, out?: T): T {
    return GL.rotate(out ?? tmp(), v1, v2, rad) as T;
  }
}

// TODO(@darzu): PERF. does this have a perf hit?
export function V(...xs: [number, number]): vec2;
export function V(...xs: [number, number, number]): vec3;
export function V(...xs: [number, number, number, number]): vec4;
export function V(...xs: number[]): vec2 | vec3 | vec4 {
  if (xs.length === 4) return vec4.fromValues(xs[0], xs[1], xs[2], xs[3]);
  else if (xs.length === 3) return vec3.fromValues(xs[0], xs[1], xs[2]);
  else if (xs.length === 2) return vec2.fromValues(xs[0], xs[1]);
  else throw new Error(`Unsupported vec size: ${xs.length}`);
}

// temp vectors:
export function tV(...xs: [number, number]): vec2;
export function tV(...xs: [number, number, number]): vec3;
export function tV(...xs: [number, number, number, number]): vec4;
export function tV(...xs: number[]): vec2 | vec3 | vec4 {
  if (xs.length === 4) return vec4.set(xs[0], xs[1], xs[2], xs[3]);
  else if (xs.length === 3) return vec3.set(xs[0], xs[1], xs[2]);
  else if (xs.length === 2) return vec2.set(xs[0], xs[1]);
  else throw new Error(`Unsupported vec size: ${xs.length}`);
}

// TODO(@darzu): use "namespace" keyword instead of "module" (re: https://www.typescriptlang.org/docs/handbook/namespaces.html)
export module vec3 {
  export type T = vec3;
  export type InputT = T | readonly [number, number, number];
  const GL = GLM.vec3;

  // export default = fromValues;

  export function tmp(): T {
    return tmpArray(3);
  }

  export function create(): T {
    return float32ArrayOfLength(3);
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  // TODO(@darzu): maybe copy should have an optional out param?
  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  // TODO(@darzu): "set" should probably follow copy and have the out param first and required
  export function set(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function fromValues(n0: number, n1: number, n2: number): T {
    const out = create();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export const ZEROS = fromValues(0, 0, 0);
  export const ONES = fromValues(1, 1, 1);

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function sum(out: T, ...vs: InputT[]): T {
    out[0] = vs.reduce((p, n) => p + n[0], 0);
    out[1] = vs.reduce((p, n) => p + n[1], 0);
    out[2] = vs.reduce((p, n) => p + n[2], 0);
    return out;
  }
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function div(v1: InputT, v2: InputT, out?: T): T {
    return GL.div(out ?? tmp(), v1, v2) as T;
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
  export function cross(v1: InputT, v2: InputT, out?: T): T {
    return GL.cross(out ?? tmp(), v1, v2) as T;
  }
  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function negate(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }
  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.sqrDist(v1, v2);
  }
  export function sqrLen(v: InputT): number {
    return GL.sqrLen(v);
  }

  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.lerp(out ?? tmp(), v1, v2, n) as T;
  }

  export function transformQuat(v1: InputT, v2: quat.InputT, out?: T): T {
    return GL.transformQuat(out ?? tmp(), v1, v2) as T;
  }

  export function transformMat4(v1: InputT, v2: mat4.InputT, out?: T): T {
    return GL.transformMat4(out ?? tmp(), v1, v2) as T;
  }

  export function transformMat3(v1: InputT, v2: mat3.InputT, out?: T): T {
    return GL.transformMat3(out ?? tmp(), v1, v2) as T;
  }

  export function zero(out?: T): T {
    return GL.zero(out ?? tmp()) as T;
  }

  export function rotateY(
    point: InputT,
    origin: InputT,
    rad: number,
    out?: T
  ): T {
    return GL.rotateY(out ?? tmp(), point, origin, rad) as T;
  }

  export function reverse(v: InputT, out?: T): T {
    return set(v[2], v[1], v[0], out);
  }
}

export module vec4 {
  export type T = vec4;
  export type InputT = T | readonly [number, number, number, number];
  const GL = GLM.vec4;

  export function tmp(): T {
    return tmpArray(4);
  }

  export function create(): T {
    return float32ArrayOfLength(4);
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export function set(
    n0: number,
    n1: number,
    n2: number,
    n3: number,
    out?: T
  ): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    out[3] = n3;
    return out;
  }

  export function fromValues(
    n0: number,
    n1: number,
    n2: number,
    n3: number
  ): T {
    const out = create();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    out[3] = n3;
    return out;
  }

  export const ZEROS = fromValues(0, 0, 0, 0);
  export const ONES = fromValues(1, 1, 1, 1);

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function div(v1: InputT, v2: InputT, out?: T): T {
    return GL.div(out ?? tmp(), v1, v2) as T;
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

  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function negate(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }
  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.sqrDist(v1, v2);
  }

  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.lerp(out ?? tmp(), v1, v2, n) as T;
  }

  export function transformQuat(v1: InputT, v2: quat.InputT, out?: T): T {
    return GL.transformQuat(out ?? tmp(), v1, v2) as T;
  }

  export function transformMat4(v1: InputT, v2: mat4.InputT, out?: T): T {
    return GL.transformMat4(out ?? tmp(), v1, v2) as T;
  }

  export function zero(out?: T): T {
    return GL.zero(out ?? tmp()) as T;
  }

  export function reverse(v: InputT, out?: T): T {
    return set(v[3], v[2], v[1], v[0], out);
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
    const out = float32ArrayOfLength(4);
    out[3] = 1;
    return out;
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export function set(x: number, y: number, z: number, w: number, out?: T): T {
    return GL.set(out ?? tmp(), x, y, z, w) as T;
  }

  export const IDENTITY = identity(create());

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
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
  export function invert(v1: InputT, out?: T): T {
    return GL.invert(out ?? tmp(), v1) as T;
  }

  export function setAxisAngle(axis: vec3.InputT, rad: number, out?: T): T {
    return GL.setAxisAngle(out ?? tmp(), axis, rad) as T;
  }
  export function getAxisAngle(q: InputT, out?: vec3.T): number {
    return GL.getAxisAngle(out ?? tmp(), q);
  }
  export function getAngle(q1: InputT, q2: InputT): number {
    return GL.getAngle(q1, q2);
  }

  export function rotateX(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function rotateY(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  export function rotateZ(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, n) as T;
  }
  // export function rotateMat3(v1: InputT, m: mat3, out?: T) {
  //   // TODO(@darzu): IMPL!
  // }
  export function fromEuler(x: number, y: number, z: number, out?: T): T {
    return GL.fromEuler(out ?? tmp(), x, y, z) as T;
  }
  export function fromMat3(m: mat3, out?: T): T {
    return GL.fromMat3(out ?? tmp(), m) as T;
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
    const out = float32ArrayOfLength(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export const IDENTITY = identity(create());

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
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

  export function invert(v1: InputT, out?: T): T {
    return GL.invert(out ?? tmp(), v1) as T;
  }

  export function scale(a: InputT, v: vec3.InputT, out?: T): T {
    return GL.scale(out ?? tmp(), a, v) as T;
  }

  export function fromRotationTranslation(
    q: quat.InputT,
    v: vec3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslation(out ?? tmp(), q, v) as T;
  }

  export function fromRotationTranslationScale(
    q: quat.InputT,
    v: vec3.InputT,
    s: vec3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslationScale(out ?? tmp(), q, v, s) as T;
  }

  export function fromRotationTranslationScaleOrigin(
    q: quat.InputT,
    v: vec3.InputT,
    s: vec3.InputT,
    o: vec3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslationScaleOrigin(out ?? tmp(), q, v, s, o) as T;
  }

  export function fromScaling(v: vec3.InputT, out?: T): T {
    return GL.fromScaling(out ?? tmp(), v) as T;
  }

  export function fromTranslation(v: vec3.InputT, out?: T): T {
    return GL.fromTranslation(out ?? tmp(), v) as T;
  }

  export function fromXRotation(rad: number, out?: T): T {
    return GL.fromXRotation(out ?? tmp(), rad) as T;
  }
  export function fromYRotation(rad: number, out?: T): T {
    return GL.fromYRotation(out ?? tmp(), rad) as T;
  }
  export function fromZRotation(rad: number, out?: T): T {
    return GL.fromZRotation(out ?? tmp(), rad) as T;
  }

  export function fromQuat(q: quat, out?: T): T {
    return GL.fromQuat(out ?? tmp(), q) as T;
  }

  export function getRotation(m: InputT, out?: quat.T): quat {
    return GL.getRotation(out ?? quat.tmp(), m) as quat;
  }

  export function getTranslation(m: InputT, out?: vec3.T): vec3 {
    return GL.getTranslation(out ?? vec3.tmp(), m) as vec3;
  }

  export function getScaling(m: InputT, out?: vec3.T): vec3 {
    return GL.getScaling(out ?? vec3.tmp(), m) as vec3;
  }

  export function rotateX(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function rotateY(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  export function rotateZ(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, n) as T;
  }

  export function frustum(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out?: T
  ): T {
    return GL.frustum(out ?? tmp(), left, right, bottom, top, near, far) as T;
  }

  /*
  Generates a orthogonal projection matrix with the given bounds

  It's a scale and translation matrix. 
  Smooshes left/right/top/bottom/near/far 
  from y-up, right-handed into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)
  */
  export function ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out?: T
  ): T {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    const _out = out ?? mat4.tmp();
    _out[0] = -2 * lr;
    _out[1] = 0;
    _out[2] = 0;
    _out[3] = 0;
    _out[4] = 0;
    _out[5] = -2 * bt;
    _out[6] = 0;
    _out[7] = 0;
    _out[8] = 0;
    _out[9] = 0;
    // _out[10] = 2 * nf; // For WebGL NDC
    _out[10] = nf; // For WebGPU NDC
    _out[11] = 0;
    _out[12] = (left + right) * lr;
    _out[13] = (top + bottom) * bt;
    // _out[14] = (far + near) * nf; // For WebGL NDC
    _out[14] = near * nf; // For WebGPU NDC
    _out[15] = 1;
    return _out;
  }

  /**
  Generates a perspective projection matrix with the given bounds.
  Passing null/undefined/no value for far will generate infinite projection matrix.
  
  Seems to output into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)

  @param {number} fovy Vertical field of view in radians
  @param {number} aspect Aspect ratio. typically viewport width/height
  @param {number} near Near bound of the frustum, must be >0
  @param {number} far Far bound of the frustum, can be null or Infinity
  @param {mat4} out mat4 frustum matrix will be written into
  @returns {mat4} out
  */
  export function perspective(
    fovy: number,
    aspect: number,
    near: number,
    far: number,
    out?: T
  ): T {
    out = out ?? tmp();
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[15] = 0;

    if (far != null && far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = 2 * far * near * nf;
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }

    return out;
  }

  /*
  Generates a look-at matrix with the given eye position, focal point, and up axis.
  If you want a matrix that actually makes an object look at another object, you should use targetTo instead.

  This is an optimized version of:
  - translate the eye to (0,0,0)
  - rotate to the camera's view:
      create an orthonormalized set of basis vectors from camera forward, up, right
  */
  // TODO(@darzu): extract orthonormalization / Gram–Schmidt process?
  export function lookAt(
    eye: vec3.InputT,
    center: vec3.InputT,
    up: vec3.InputT,
    out?: T
  ): T {
    const eyex = eye[0];
    const eyey = eye[1];
    const eyez = eye[2];
    const upx = up[0];
    const upy = up[1];
    const upz = up[2];
    const centerx = center[0];
    const centery = center[1];
    const centerz = center[2];

    if (
      Math.abs(eyex - centerx) < EPSILON &&
      Math.abs(eyey - centery) < EPSILON &&
      Math.abs(eyez - centerz) < EPSILON
    ) {
      return identity(out);
    }

    let z0 = eyex - centerx;
    let z1 = eyey - centery;
    let z2 = eyez - centerz;
    let len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;
    let x0 = upy * z2 - upz * z1;
    let x1 = upz * z0 - upx * z2;
    let x2 = upx * z1 - upy * z0;
    len = Math.hypot(x0, x1, x2);

    if (!len) {
      x0 = 0;
      x1 = 0;
      x2 = 0;
    } else {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = Math.hypot(y0, y1, y2);

    if (!len) {
      y0 = 0;
      y1 = 0;
      y2 = 0;
    } else {
      len = 1 / len;
      y0 *= len;
      y1 *= len;
      y2 *= len;
    }

    const _out = out ?? mat4.tmp();
    _out[0] = x0;
    _out[1] = y0;
    _out[2] = z0;
    _out[3] = 0;
    _out[4] = x1;
    _out[5] = y1;
    _out[6] = z1;
    _out[7] = 0;
    _out[8] = x2;
    _out[9] = y2;
    _out[10] = z2;
    _out[11] = 0;
    _out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    _out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    _out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    _out[15] = 1;
    return _out;
  }

  export function translate(m: InputT, v: vec3.InputT, out?: T): T {
    return GL.translate(out ?? tmp(), m, v) as T;
  }
}

export module mat3 {
  export type T = mat3;
  // prettier-ignore
  export type InputT = T | readonly [number, number, number,
                                     number, number, number,
                                     number, number, number];
  const GL = GLM.mat3;

  export function tmp(): T {
    return tmpArray(9);
  }

  /* creates identity matrix */
  export function create(): T {
    const out = float32ArrayOfLength(9);
    out[0] = 1;
    out[4] = 1;
    out[8] = 1;
    return out;
  }

  export function fromValues(
    m00: number,
    m01: number,
    m02: number,
    m10: number,
    m11: number,
    m12: number,
    m20: number,
    m21: number,
    m22: number
  ) {
    var out = float32ArrayOfLength(9);
    out[0] = m00;
    out[1] = m01;
    out[2] = m02;
    out[3] = m10;
    out[4] = m11;
    out[5] = m12;
    out[6] = m20;
    out[7] = m21;
    out[8] = m22;
    return out;
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export const IDENTITY = identity(create());

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function set(
    m00: number,
    m01: number,
    m02: number,
    m10: number,
    m11: number,
    m12: number,
    m20: number,
    m21: number,
    m22: number,
    out?: T
  ): T {
    return GL.set(
      out ?? tmp(),
      m00,
      m01,
      m02,
      m10,
      m11,
      m12,
      m20,
      m21,
      m22
    ) as T;
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

  export function invert(v1: InputT, out?: T): T {
    return GL.invert(out ?? tmp(), v1) as T;
  }

  export function scale(a: InputT, v: vec2.InputT, out?: T): T {
    return GL.scale(out ?? tmp(), a, v) as T;
  }

  export function fromScaling(v: vec2.InputT, out?: T): T {
    return GL.fromScaling(out ?? tmp(), v) as T;
  }

  export function fromQuat(q: quat, out?: T): T {
    return GL.fromQuat(out ?? tmp(), q) as T;
  }

  export function fromMat4(q: mat4, out?: T): T {
    return GL.fromMat4(out ?? tmp(), q) as T;
  }
}
