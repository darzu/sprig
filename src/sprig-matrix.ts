import * as GLM from "./gl-matrix.js";

interface Float32ArrayOfLength<N extends number> extends Float32Array {
  length: N;
}

interface ReadonlyFloat32ArrayOfLength<N extends number>
  extends Omit<
    Float32ArrayOfLength<N>,
    "copyWithin" | "fill" | "reverse" | "set" | "sort"
  > {
  readonly [n: number]: number;
}

declare const _forever: unique symbol;

export type vec3f =
  | [number, number, number]
  | (Float32ArrayOfLength<3> & { [_forever]: true });
export type vec3r =
  | readonly [number, number, number]
  | ReadonlyFloat32ArrayOfLength<3>;
export type vec3 = vec3f | Float32ArrayOfLength<3>;

let eg_vec3f: vec3f = [0, 0, 0] as vec3f;
let eg_vec3r: vec3r = [0, 0, 0] as vec3r;
let eg_vec3: vec3 = vec3.create() as vec3;

// eg_vec3 = eg_vec3r; // illegal
// eg_vec3 = eg_vec3f; // legal
// eg_vec3r = eg_vec3; // legal
// eg_vec3r = eg_vec3f; // legal
// eg_vec3f = eg_vec3; // illegal
// eg_vec3f = eg_vec3r; // illegal

export type vec2 = Float32ArrayOfLength<2>;

export type vec4 = Float32ArrayOfLength<4>;

export type quat = Float32ArrayOfLength<4>;

export type mat3 = Float32ArrayOfLength<9>;

export type mat4 = Float32ArrayOfLength<16>;

function float32ArrayOfLength<N extends number>(n: N): Float32ArrayOfLength<N> {
  return new Float32Array(n) as Float32ArrayOfLength<N>;
}

const BUFFER_SIZE = 40000;
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
    return GL.cross(out ?? tmp(), v1, v2) as vec3.T;
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

export module vec3 {
  export type T = vec3;
  export type Tf = vec3f;
  export type InputT = vec3r;
  const GL = GLM.vec3;

  export function tmp(): T {
    return tmpArray(3);
  }

  export function create(): Tf {
    return float32ArrayOfLength(3) as Tf;
  }

  export function clone(v: InputT): Tf {
    return GL.clone(v) as Tf;
  }

  export function copy(out: Tf, v1: InputT): Tf;
  export function copy(out: T, v1: InputT): T;
  export function copy(out: T, v1: InputT): T {
    return GL.copy(out, v1) as T;
  }

  export function set(n0: number, n1: number, n2: number, out: Tf): Tf;
  export function set(n0: number, n1: number, n2: number, out?: T): T;
  export function set(n0: number, n1: number, n2: number, out?: T): T {
    out = out ?? tmp();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  export function fromValues(n0: number, n1: number, n2: number): Tf {
    return set(n0, n1, n2, create()) as Tf;
  }

  export const ZEROS = fromValues(0, 0, 0);
  export const ONES = fromValues(1, 1, 1);

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function add(v1: InputT, v2: InputT, out: Tf): Tf;
  export function add(v1: InputT, v2: InputT, out?: T): T;
  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }

  export function sub(v1: InputT, v2: InputT, out: Tf): Tf;
  export function sub(v1: InputT, v2: InputT, out?: T): T;
  export function sub(v1: InputT, v2: InputT, out?: T): T {
    return GL.sub(out ?? tmp(), v1, v2) as T;
  }
  export function mul(v1: InputT, v2: InputT, out: Tf): Tf;
  export function mul(v1: InputT, v2: InputT, out?: T): T;
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function div(v1: InputT, v2: InputT, out: Tf): Tf;
  export function div(v1: InputT, v2: InputT, out?: T): T;
  export function div(v1: InputT, v2: InputT, out?: T): T {
    return GL.div(out ?? tmp(), v1, v2) as T;
  }
  export function normalize(v1: InputT, out: Tf): Tf;
  export function normalize(v1: InputT, out?: T): T;
  export function normalize(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function length(v1: InputT): number {
    return GL.length(v1);
  }
  export function dot(v1: InputT, v2: InputT): number {
    return GL.dot(v1, v2);
  }
  export function cross(v1: InputT, v2: InputT, out: Tf): Tf;
  export function cross(v1: InputT, v2: InputT, out?: T): T;
  export function cross(v1: InputT, v2: InputT, out?: T): T {
    return GL.cross(out ?? tmp(), v1, v2) as T;
  }
  export function scale(v1: InputT, n: number, out: Tf): Tf;
  export function scale(v1: InputT, n: number, out?: T): T;
  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function negate(v1: InputT, out: Tf): Tf;
  export function negate(v1: InputT, out?: T): T;
  export function negate(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }
  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }

  export function lerp(v1: InputT, v2: InputT, n: number, out: Tf): Tf;
  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T;
  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.lerp(out ?? tmp(), v1, v2, n) as T;
  }

  export function transformQuat(v1: InputT, v2: quat.InputT, out: Tf): Tf;
  export function transformQuat(v1: InputT, v2: quat.InputT, out?: T): T;
  export function transformQuat(v1: InputT, v2: quat.InputT, out?: T): T {
    return GL.transformQuat(out ?? tmp(), v1, v2) as T;
  }

  export function transformMat4(v1: InputT, v2: mat4.InputT, out: Tf): Tf;
  export function transformMat4(v1: InputT, v2: mat4.InputT, out?: T): T;
  export function transformMat4(v1: InputT, v2: mat4.InputT, out?: T): T {
    return GL.transformMat4(out ?? tmp(), v1, v2) as T;
  }

  export function zero(out: Tf): Tf;
  export function zero(out?: T): T;
  export function zero(out?: T): T {
    return GL.zero(out ?? tmp()) as T;
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
    return float32ArrayOfLength(4);
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
    return float32ArrayOfLength(16);
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
