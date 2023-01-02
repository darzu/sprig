import * as GLM from "./gl-matrix.js";

interface Float32ArrayOfLength<N extends number> extends Float32Array {
  length: N;
}

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

// TODO(@darzu): perhaps all non-temp (and temp) vecs should be suballocations on bigger Float32Arrays
//    this might give some perf wins w/ cache hits
function float32ArrayOfLength<N extends number>(n: N): Float32ArrayOfLength<N> {
  return new Float32Array(n) as Float32ArrayOfLength<N>;
}

const BUFFER_SIZE = 80000;
const buffer = new ArrayBuffer(BUFFER_SIZE);
let bufferIndex = 0;
function tmpArray<N extends number>(n: N): Float32ArrayOfLength<N> {
  if (bufferIndex + n * Float32Array.BYTES_PER_ELEMENT > BUFFER_SIZE) {
    throw `Too many temp Float32Arrays allocated--try increasing BUFFER_SIZE`;
  }
  const arr = new Float32Array(buffer, bufferIndex, n);
  bufferIndex += arr.byteLength;
  return arr as Float32ArrayOfLength<N>;
}

export function resetTempMatrixBuffer() {
  bufferIndex = 0;
}

export module vec2 {
  export type T = vec2;
  export type InputT = T | readonly [number, number];
  const GL = GLM.vec2;

  function tmp(): T {
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
    return set(n0, n1, create());
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
    return GL.dist(v1, v2);
  }
  export function rotate(v1: InputT, v2: InputT, rad: number, out?: T): T {
    return GL.rotate(out ?? tmp(), v1, v2, rad) as T;
  }
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

  export function set(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function fromValues(n0: number, n1: number, n2: number): T {
    return set(n0, n1, n2, create());
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
    return GL.dist(v1, v2);
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
    return set(n0, n1, n2, n3, create());
  }

  export const ZEROS = fromValues(0, 0, 0, 0);
  export const ONES = fromValues(1, 1, 1, 0);

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
    return GL.dist(v1, v2);
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
  export function fromEuler(x: number, y: number, z: number, out?: T): T {
    return GL.fromEuler(out ?? tmp(), x, y, z) as T;
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

  export function ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out?: T
  ): T {
    return GL.ortho(out ?? tmp(), left, right, bottom, top, near, far) as T;
  }

  export function perspective(
    fovy: number,
    aspect: number,
    near: number,
    far: number,
    out?: T
  ): T {
    return GL.perspective(out ?? tmp(), fovy, aspect, near, far) as T;
  }

  export function lookAt(
    v1: vec3.InputT,
    v2: vec3.InputT,
    v3: vec3.InputT,
    out?: T
  ): T {
    return GL.lookAt(out ?? tmp(), v1, v2, v3) as T;
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
