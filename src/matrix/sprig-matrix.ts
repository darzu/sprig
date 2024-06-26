import {
  DBG_TMP_LEAK,
  DBG_TMP_STACK_MATCH,
  PERF_DBG_F32S,
  PERF_DBG_F32S_BLAME,
  PERF_DBG_F32S_TEMP_BLAME,
} from "../flags.js";
import { assert, dbgAddBlame, dbgClearBlame } from "../utils/util-no-import.js";
import * as GLM from "./gl-matrix.js";

/*
Note on notation:
[1, 0, 0, 0,
 0, 1, 0, 0,
 0, 0, 1, 0,
 tx, ty, tz, 0]
 tx,ty,tz = translate x,y,z
*/

const EPSILON = 0.000001;

// TODO(@darzu): PERF!! https://github.com/toji/gl-matrix claims:
//  "Regarding the current performance in modern web browsers, calling
//   glMatrix.setMatrixArrayType(Array) to use normal arrays instead of
//   Float32Arrays can greatly increase the performance."
interface Float32ArrayOfLength<N extends number> extends Float32Array {
  length: N;
}

export type V2 = Float32ArrayOfLength<2>;

export type V3 = Float32ArrayOfLength<3>;

export type vec3tmp = V3; // TODO(@darzu): ENFORCE THIS! Right now it's just a description thing.

export type V4 = Float32ArrayOfLength<4>;

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
let eg_vec3: V3 = vec3.create() as V3;

// eg_vec3 = eg_vec3r; // illegal (weakens "readonly")
// eg_vec3 = eg_vec3f; // legal (unspecified if its temp or forever)
// eg_vec3r = eg_vec3; // legal (strengthens alias promise)
// eg_vec3r = eg_vec3f; // legal (strengthens alias promise)
// eg_vec3f = eg_vec3; // illegal (could be temp)
// eg_vec3f = eg_vec3r; // illegal (could be temp)
// eg_vec3fr = eg_vec3; // illegal (could be temp)
// eg_vec3fr = eg_vec3f; // legal (strengthening w/ readonly promise)
// eg_vec3fr = eg_vec3r; // illegal (could be temp)

Should be able to overload vec3.add like so:
vec3.add(a: T, b: T): tT;
vec3.add<OT extends T | tT>(a: T, b: T, out: OT): OT;
so if given an out, it'll be that type, otherwise it'll be a temp
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

let _tmpResetGen = 1;

let _tmpGenHints = ["<zero>", "<one>"];

function mkTmpProxyHandler(gen: number) {
  const err = () => {
    throw new Error(
      `Leak! Using tmp from gen ${gen} "${_tmpGenHints[gen]}" in gen ${_tmpResetGen} "${_tmpGenHints[_tmpResetGen]}"`
    );
  };
  const tmpProxyHandler: ProxyHandler<Float32Array> = {
    get: (v, prop) => {
      if (gen !== _tmpResetGen) err();
      // TODO(@darzu): huh is TS's ProxyHandler typing wrong? cus this seems to work?
      return v[prop as unknown as number];
    },
    set: (v, prop, val) => {
      if (gen !== _tmpResetGen) err();
      v[prop as unknown as number] = val;
      return true;
    },
  };
  return tmpProxyHandler;
}
let _tmpProxyHandler: ProxyHandler<Float32Array> =
  mkTmpProxyHandler(_tmpResetGen);

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
  // TODO(@darzu): For blame, have a mode that exludes stack mark n' pop'ed!
  if (PERF_DBG_F32S_TEMP_BLAME) {
    dbgAddBlame("temp_f32s", n);
  }
  const arr = new Float32Array(buffer, bufferIndex, n);
  bufferIndex += arr.byteLength;

  if (DBG_TMP_LEAK) {
    const prox = new Proxy(arr, _tmpProxyHandler);
    return prox as Float32ArrayOfLength<N>;
  }

  return arr as Float32ArrayOfLength<N>;
}

export function resetTempMatrixBuffer(hint: string) {
  if (_tmpMarkStack.length)
    throw `mismatched tmpMark & tmpPop! ${_tmpMarkStack.length} unpopped`;

  bufferIndex = 0;

  if (DBG_TMP_LEAK) {
    _tmpResetGen += 1;
    if (_tmpGenHints.length < 1000) _tmpGenHints[_tmpResetGen] = hint;
    _tmpProxyHandler = mkTmpProxyHandler(_tmpResetGen);
  }

  if (PERF_DBG_F32S_TEMP_BLAME) {
    dbgClearBlame("temp_f32s");
  }
}

// TODO(@darzu): can i track leaking temps?
/*
  mark all temps w/ a generation
  wrap all temps w/ a proxy?
  if a temp is used, check the current generation
  if generation mismatch, throw error

  can we track all usage?
*/

// TODO(@darzu): have a version of PERF_DBG_F32S_TEMP_BLAME that tracks blame on unmarked/popped!
// TODO(@darzu): is there some dbg way we could track to see if any tmps are used after free? maybe a generation tracker?
//                conceivably w/ WeakRef? Maybe w/ FinalizationRegistry?
//                  if i do a mark and then the scoped obj is collected before a pop happens, we know we have a missing pop
// TODO(@darzu): eventually we'll get scoped using statements in JS which will make this hideous mess a little better?
// TODO(@darzu): should these be called for every system and every init?
const _tmpMarkStack: number[] = [];
const _tmpMarkIdStack: number[] = [];
let _tmpStackNextId = 1;
export interface TmpStack {
  readonly pop: () => void;
  readonly popAndRemark: () => void;
}
const _cheapPop: TmpStack = { pop: tmpPop, popAndRemark: tmpPopAndRemark };
// const _tmpStackFinReg: FinalizationRegistry<null> | undefined =
//   DBG_TMP_STACK_MATCH
//     ? new FinalizationRegistry(tmpStackFinHandler)
//     : undefined;
export function tmpStack(): TmpStack {
  if (!DBG_TMP_STACK_MATCH) {
    tmpMark();
    return _cheapPop;
  }

  _tmpStackNextId += 1;

  const id = _tmpStackNextId;
  _tmpMarkStack.push(bufferIndex);
  _tmpMarkIdStack.push(id);

  const res: TmpStack = { pop, popAndRemark };

  // assert(_tmpStackFinReg);
  // _tmpStackFinReg.register(res, null);

  function pop(): void {
    if (_tmpMarkStack.length === 0) throw "tmpStack.pop with zero size stack!";
    const popId = _tmpMarkIdStack.pop()!;
    if (popId !== id)
      throw "tmpStack pop mismatch! Did a stack cross async boundries?";
    bufferIndex = _tmpMarkStack.pop()!;
  }

  function popAndRemark(): void {
    if (_tmpMarkStack.length === 0) throw "tmpStack.pop with zero size stack!";
    const popId = _tmpMarkIdStack[_tmpMarkIdStack.length - 1]!;
    if (popId !== id)
      throw "tmpStack pop mismatch! Did a stack cross async boundries?";
    bufferIndex = _tmpMarkStack[_tmpMarkStack.length - 1]!;
  }

  return res;
}
// function tmpStackFinHandler() {
// }
function tmpMark(): void {
  _tmpMarkStack.push(bufferIndex);
}
function tmpPop(): void {
  if (_tmpMarkStack.length === 0) throw "tmpPop with zero size stack!";
  bufferIndex = _tmpMarkStack.pop()!;
}
function tmpPopAndRemark(): void {
  if (_tmpMarkStack.length === 0) throw "tmpPop with zero size stack!";
  bufferIndex = _tmpMarkStack[_tmpMarkStack.length - 1];
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

export function cloneTmpsInObj<A extends any>(obj: A, maxDepth = 100): A {
  if (maxDepth <= 0) {
    throw `Object too deep or rescursive!`;
  } else if (!obj) {
    return obj;
  } else if (obj instanceof Float32Array) {
    if (isTmpVec(obj)) {
      const n = float32ArrayOfLength(obj.length);
      n.forEach((_, i) => (n[i] = obj[i]));
      return n as A;
    }
    return obj;
  } else if (obj instanceof Array) {
    return obj.map((v) => cloneTmpsInObj(v, maxDepth - 1)) as A;
  } else if (obj instanceof Map) {
    const res = new Map();
    for (let [k, v] of obj.entries()) {
      const v2 = cloneTmpsInObj(v, maxDepth - 1);
      res.set(k, v2);
    }
    return res as A;
  } else if (typeof obj === "object") {
    const res = { ...obj };
    for (let k of Object.keys(res)) {
      const v2 = cloneTmpsInObj(obj[k as keyof A], maxDepth - 1);
      res[k as keyof A] = v2;
    }
    return res;
  } else {
    return obj;
  }
}

// TODO(@darzu): PERF. quat mult improvement? from: https://www.johndcook.com/blog/2021/06/16/faster-quaternion-rotations/

// TODO(@darzu): PERF. does this have a perf hit?
export function V(...xs: [number, number]): V2;
export function V(...xs: [number, number, number]): V3;
export function V(...xs: [number, number, number, number]): V4;
export function V(...xs: number[]): V2 | V3 | V4 {
  if (xs.length === 3) return V3.fromValues(xs[0], xs[1], xs[2]);
  else if (xs.length === 4) return V4.fromValues(xs[0], xs[1], xs[2], xs[3]);
  else if (xs.length === 2) return V2.fromValues(xs[0], xs[1]);
  else throw new Error(`Unsupported vec size: ${xs.length}`);
}

// temp vectors:
export function tV(...xs: [number, number]): V2;
export function tV(...xs: [number, number, number]): V3;
export function tV(...xs: [number, number, number, number]): V4;
export function tV(...xs: number[]): V2 | V3 | V4 {
  if (xs.length === 4) return V4.set(xs[0], xs[1], xs[2], xs[3]);
  else if (xs.length === 3) return V3.set(xs[0], xs[1], xs[2]);
  else if (xs.length === 2) return V2.set(xs[0], xs[1]);
  else throw new Error(`Unsupported vec size: ${xs.length}`);
}

export module V2 {
  export type T = V2;
  export type InputT = T | readonly [number, number];
  const GL = GLM.vec2;

  export function tmp(): T {
    return tmpArray(2);
  }

  export function mk(): T {
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
    const out = mk();
    out[0] = n0;
    out[1] = n1;
    return out;
  }

  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.lerp(out ?? tmp(), v1, v2, n) as T;
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
  export function norm(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function len(v1: InputT): number {
    return GL.length(v1);
  }
  export function dot(v1: InputT, v2: InputT): number {
    return GL.dot(v1, v2);
  }
  export function cross(v1: InputT, v2: InputT, out?: V3.T): V3.T {
    return GL.cross(out ?? V3.tmp(), v1, v2) as V3.T;
  }
  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function neg(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }

  export function mid(a: InputT, b: InputT, out?: V2): V2 {
    out = out ?? tmp();
    out[0] = (a[0] + b[0]) * 0.5;
    out[1] = (a[1] + b[1]) * 0.5;
    return out;
  }

  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.sqrDist(v1, v2);
  }
  export function rotate(v1: InputT, v2: InputT, rad: number, out?: T): T {
    return GL.rotate(out ?? tmp(), v1, v2, rad) as T;
  }

  export function getYaw(v: InputT): number {
    return _getYaw(v[0], v[1]);
  }
}

// NOTE: assumes +Y is forward so [0,1] is 0 yaw;
//       yaw is positive to the right so
function _getYaw(x: number, y: number): number {
  // NOTE: atan2 output is [-PI,PI]; positive iff Y is positive
  //  since we want positive to the "right", we negate
  //  since we want 0 to be +Y, we add PI/2
  return -Math.atan2(y, x) + Math.PI * 0.5;
}
export const getYaw = _getYaw;

// TODO(@darzu): use "namespace" keyword instead of "module" (re: https://www.typescriptlang.org/docs/handbook/namespaces.html)
export module V3 {
  export type T = V3;
  // TODO(@darzu): RENAME InputT to something smaller "V3i", temp is "V3t" ?
  export type InputT = T | readonly [number, number, number];
  const GL = GLM.vec3;

  export const ZEROS = fromValues(0, 0, 0);
  export const ONES = fromValues(1, 1, 1);
  export const FWD = fromValues(0, 1, 0);
  export const BACK = fromValues(0, -1, 0);
  export const UP = fromValues(0, 0, 1);
  export const DOWN = fromValues(0, 0, -1);
  export const RIGHT = fromValues(1, 0, 0);
  export const LEFT = fromValues(-1, 0, 0);
  export const X = fromValues(1, 0, 0);
  export const Y = fromValues(0, 1, 0);
  export const Z = fromValues(0, 0, 1);

  // export default = fromValues;

  export function tmp(): T {
    return tmpArray(3);
  }

  // TODO(@darzu): rename mk()
  export function mk(): T {
    return float32ArrayOfLength(3);
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  // TODO(@darzu): maybe copy should have an optional out param?
  // TODO(@darzu): RENAME cpy
  export function copy(out: T, v1: InputT | V4.InputT): T {
    out[0] = v1[0];
    out[1] = v1[1];
    out[2] = v1[2];
    return out;
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
    const out = mk();
    out[0] = n0;
    out[1] = n1;
    out[2] = n2;
    return out;
  }

  // TODO(@darzu): version w/ out param ?
  // TODO(@darzu): swizzle operators
  export function fromV4(v4: V4.InputT): T {
    const out = mk();
    out[0] = v4[0];
    out[1] = v4[1];
    out[2] = v4[2];
    return out;
  }

  export function equals(v1: InputT, v2: InputT): boolean {
    return GL.equals(v1, v2);
  }
  export function exactEquals(v1: InputT, v2: InputT): boolean {
    return GL.exactEquals(v1, v2);
  }

  export function add(v1: InputT, v2: InputT, out?: T): T {
    return GL.add(out ?? tmp(), v1, v2) as T;
  }
  // TODO(@darzu): hacky, this is here b/c working with temps is so painful.
  export function addScaled(a: InputT, b: InputT, bScale: number, out?: T): T {
    out = out ?? tmp();
    out[0] = a[0] + b[0] * bScale;
    out[1] = a[1] + b[1] * bScale;
    out[2] = a[2] + b[2] * bScale;
    return out;
  }
  export function abs(v: InputT, out?: T): T {
    out = out ?? tmp();
    out[0] = Math.abs(v[0]);
    out[1] = Math.abs(v[1]);
    out[2] = Math.abs(v[2]);
    return out;
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
  // returns a unit vector that points from src to trg like V3.norm(V3.sub(trg, src))
  export function dir(trg: InputT, src: InputT, out?: T): T {
    out = out ?? tmp();
    sub(trg, src, out);
    norm(out, out);
    return out;
  }
  export function mul(v1: InputT, v2: InputT, out?: T): T {
    return GL.mul(out ?? tmp(), v1, v2) as T;
  }
  export function div(v1: InputT, v2: InputT, out?: T): T {
    return GL.div(out ?? tmp(), v1, v2) as T;
  }
  export function norm(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function len(v1: InputT): number {
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
  export function neg(v1: InputT, out?: T): T {
    return GL.negate(out ?? tmp(), v1) as T;
  }
  export function dist(v1: InputT, v2: InputT): number {
    return GL.dist(v1, v2);
  }

  export function mid(a: InputT, b: InputT, out?: V3): V3 {
    out = out ?? tmp();
    out[0] = (a[0] + b[0]) * 0.5;
    out[1] = (a[1] + b[1]) * 0.5;
    out[2] = (a[2] + b[2]) * 0.5;
    return out;
  }
  export function avg(v1: InputT, v2: InputT, out?: T): T {
    return mid(v1, v2, out);
  }

  // TODO(@darzu): RENAME: all "sqr" -> "sq"
  export function sqrDist(v1: InputT, v2: InputT): number {
    return GL.sqrDist(v1, v2);
  }
  export function sqrLen(v: InputT): number {
    return GL.sqrLen(v);
  }

  export function lerp(v1: InputT, v2: InputT, n: number, out?: T): T {
    return GL.lerp(out ?? tmp(), v1, v2, n) as T;
  }

  // TODO(@darzu): RENAME to transformQuat. tQuat, tMat is dense but too hard to remember.
  // TODO(@darzu): replace many usages with getFwd, getUp, getRight, etc.
  export function tQuat(a: InputT, q: quat.InputT, out?: T): T {
    out = out ?? tmp();
    // benchmarks: https://jsperf.com/quaternion-transform-vec3-implementations-fixed
    var qx = q[0],
      qy = q[1],
      qz = q[2],
      qw = q[3];
    var x = a[0],
      y = a[1],
      z = a[2]; // var qvec = [qx, qy, qz];
    // var uv = vec3.cross([], qvec, a);

    var uvx = qy * z - qz * y,
      uvy = qz * x - qx * z,
      uvz = qx * y - qy * x; // var uuv = vec3.cross([], qvec, uv);

    var uuvx = qy * uvz - qz * uvy,
      uuvy = qz * uvx - qx * uvz,
      uuvz = qx * uvy - qy * uvx; // vec3.scale(uv, uv, 2 * w);

    var w2 = qw * 2;
    uvx *= w2;
    uvy *= w2;
    uvz *= w2; // vec3.scale(uuv, uuv, 2);

    uuvx *= 2;
    uuvy *= 2;
    uuvz *= 2; // return vec3.add(out, a, vec3.add(out, uv, uuv));

    out[0] = x + uvx + uuvx;
    out[1] = y + uvy + uuvy;
    out[2] = z + uvz + uuvz;
    return out;
  }

  export function tMat4(v1: InputT, v2: mat4.InputT, out?: T): T {
    return GL.transformMat4(out ?? tmp(), v1, v2) as T;
  }

  export function tMat3(v: InputT, m: mat3.InputT, out?: T): T {
    out = out ?? tmp();
    var x = v[0],
      y = v[1],
      z = v[2];
    out[0] = x * m[0] + y * m[3] + z * m[6];
    out[1] = x * m[1] + y * m[4] + z * m[7];
    out[2] = x * m[2] + y * m[5] + z * m[8];
    return out;
  }

  // NOTE: transpose matrix then transform V3 by it
  export function ttMat3(v: InputT, m: mat3.InputT, out?: T) {
    out = out ?? tmp();
    var x = v[0],
      y = v[1],
      z = v[2];
    out[0] = x * m[0] + y * m[1] + z * m[2];
    out[1] = x * m[3] + y * m[4] + z * m[5];
    out[2] = x * m[6] + y * m[7] + z * m[8];
    return out;
  }

  export function zero(out?: T): T {
    out = out ?? tmp();
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }

  export function rotX(point: InputT, origin: InputT, rad: number, out?: T): T {
    return GL.rotateX(out ?? tmp(), point, origin, rad) as T;
  }
  export function rotY(point: InputT, origin: InputT, rad: number, out?: T): T {
    return GL.rotateY(out ?? tmp(), point, origin, rad) as T;
  }
  export function rotZ(point: InputT, origin: InputT, rad: number, out?: T): T {
    return GL.rotateZ(out ?? tmp(), point, origin, rad) as T;
  }

  // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
  export function yaw(
    point: InputT,
    rad: number,
    // origin: InputT = ZEROS,
    out?: T
  ) {
    return GL.rotateZ(out ?? tmp(), point, ZEROS, -rad) as T;
  }
  export function pitch(
    point: InputT,
    rad: number,
    // origin: InputT = ZEROS,
    out?: T
  ) {
    return GL.rotateX(out ?? tmp(), point, ZEROS, rad) as T;
  }
  export function roll(
    point: InputT,
    rad: number,
    // origin: InputT = ZEROS,
    out?: T
  ) {
    return GL.rotateY(out ?? tmp(), point, ZEROS, rad) as T;
  }

  export function fromYaw(yaw: number, out?: T): T {
    return V3.yaw(V3.FWD, yaw, out);
  }

  // TODO(@darzu): fromYawPitchRoll

  // TODO(@darzu): add yaw/pitch/roll fns

  export function reverse(v: InputT, out?: T): T {
    return set(v[2], v[1], v[0], out);
  }

  export function getYaw(v: InputT): number {
    return _getYaw(v[0], v[1]);
  }

  // TODO(@darzu): remove roll
  export function fromYawPitch(yaw = 0, pitch = 0, out?: T): T {
    // TODO(@darzu): test this thoroughly against V3.tQuat(V3.UP, q, out) and quat.fromYawPitchRoll!
    pitch *= 0.5;
    yaw *= 0.5;

    var sx = Math.sin(pitch);
    var cx = Math.cos(pitch);
    var sz = Math.sin(-yaw);
    var cz = Math.cos(-yaw);
    var qx = sx * cz;
    var qy = sx * sz;
    var qz = cx * sz;
    var qw = cx * cz;

    // var q = quat.fromYawPitchRoll(yaw, pitch, 0);
    // var qx = q[0];
    // var qy = q[1];
    // var qz = q[2];
    // var qw = q[3];

    return quat.fwd([qx, qy, qz, qw], out);

    // TODO(@darzu): PERF. fix and inline
    // out = out ?? V3.tmp();
    // out[0] = (-qz * qw + qy * qx) * 2;
    // out[1] = 1 + (qz * qz + qx * qx) * 2;
    // out[2] = (qx * qw + qy * qz) * 2;

    // return out;
  }
}

export module V4 {
  export type T = V4;
  export type InputT = T | readonly [number, number, number, number];
  const GL = GLM.vec4;

  export function tmp(): T {
    return tmpArray(4);
  }

  export function mk(): T {
    return float32ArrayOfLength(4);
  }

  export function clone(v: InputT): T {
    return GL.clone(v) as T;
  }

  export function copy(out: T, v1: InputT): T {
    out[0] = v1[0];
    out[1] = v1[1];
    out[2] = v1[2];
    out[3] = v1[3];
    return out;
  }

  // TODO(@darzu): handle this better via swizzle
  export function copyV3(out: T, v1: V3.InputT): T {
    out[0] = v1[0];
    out[1] = v1[1];
    out[2] = v1[2];
    return out;
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
    const out = mk();
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
  export function norm(v1: InputT, out?: T): T {
    return GL.normalize(out ?? tmp(), v1) as T;
  }
  export function len(v1: InputT): number {
    return GL.length(v1);
  }
  export function dot(v1: InputT, v2: InputT): number {
    return GL.dot(v1, v2);
  }

  export function scale(v1: InputT, n: number, out?: T): T {
    return GL.scale(out ?? tmp(), v1, n) as T;
  }
  export function neg(v1: InputT, out?: T): T {
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

  export function tQuat(v1: InputT, v2: quat.InputT, out?: T): T {
    return GL.transformQuat(out ?? tmp(), v1, v2) as T;
  }

  export function tMat4(v1: InputT, v2: mat4.InputT, out?: T): T {
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

  export function mk(): T {
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

  export const IDENTITY = identity(mk());

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

  export function setAxisAngle(axis: V3.InputT, rad: number, out?: T): T {
    return GL.setAxisAngle(out ?? tmp(), axis, rad) as T;
  }
  export function getAxisAngle(q: InputT, out?: V3.T): number {
    return GL.getAxisAngle(out ?? tmp(), q);
  }
  export function getAngle(q1: InputT, q2: InputT): number {
    return GL.getAngle(q1, q2);
  }

  export function rotX(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function rotY(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  export function rotZ(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, n) as T;
  }
  // export function rotateMat3(v1: InputT, m: mat3, out?: T) {
  //   // TODO(@darzu): IMPL!
  // }
  export function fromEuler(x: number, y: number, z: number, out?: T): T {
    return GL.fromEuler(out ?? tmp(), x, y, z) as T;
  }
  export function fromMat3(m: mat3.InputT, out?: T): T {
    return GL.fromMat3(out ?? tmp(), m) as T;
  }
  const __quat_fromMat4_tmp = float32ArrayOfLength(9) as mat3;
  export function fromMat4(m: mat4.InputT, out?: T): T {
    // TODO(@darzu): PERF. Inline to make efficient.
    return fromMat3(mat3.fromMat4(m, __quat_fromMat4_tmp), out);
  }

  // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
  export function yaw(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, -n) as T;
  }
  export function pitch(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function roll(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  // TODO(@darzu): DOCUMENT what order yaw,pitch,roll are applied
  export function fromYawPitchRoll(
    yaw: number = 0,
    pitch: number = 0,
    roll: number = 0,
    out?: T
  ): T {
    return GL.fromEuler(out ?? tmp(), pitch, roll, -yaw) as T;
  }
  export function fromYPR(
    yaw: number = 0,
    pitch: number = 0,
    roll: number = 0,
    out?: T
  ): T {
    return fromYawPitchRoll(yaw, pitch, roll, out);
  }

  // TODO(@darzu): this is annoying that it shows up in auto-complete. remove this
  // TODO(@darzu): little hacky, this matches our YawPitchDef but doesn't match other sprig-matrix patterns
  export function fromYawPitch(yp: { yaw: number; pitch: number }, out?: T): T {
    return fromYawPitchRoll(yp.yaw, yp.pitch, 0, out);
  }

  const _t6 = V3.mk();
  export function getYaw(q: InputT): number {
    // TODO(@darzu): PERF. can improve by inlining and simplifying
    const f = fwd(q, _t6);
    return V3.getYaw(f);
  }

  // TODO(@darzu): IMPL toYawPitchRoll
  /*
  https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
  // this implementation assumes normalized quaternion
  // converts to Euler angles in 3-2-1 sequence
  EulerAngles ToEulerAngles(Quaternion q) {
      EulerAngles angles;

      // roll (x-axis rotation)
      double sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
      double cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
      angles.roll = std::atan2(sinr_cosp, cosr_cosp);

      // pitch (y-axis rotation)
      double sinp = std::sqrt(1 + 2 * (q.w * q.y - q.x * q.z));
      double cosp = std::sqrt(1 - 2 * (q.w * q.y - q.x * q.z));
      angles.pitch = 2 * std::atan2(sinp, cosp) - M_PI / 2;

      // yaw (z-axis rotation)
      double siny_cosp = 2 * (q.w * q.z + q.x * q.y);
      double cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
      angles.yaw = std::atan2(siny_cosp, cosy_cosp);

      return angles;
  }
  */

  // NOTE: assumes these are orthonormalized
  export function fromXYZ(
    x: V3.InputT,
    y: V3.InputT,
    z: V3.InputT,
    out?: T
  ): T {
    return quat.fromMat3(
      [
        // colum 1
        x[0],
        x[1],
        x[2],
        // colum 2
        y[0],
        y[1],
        y[2],
        // colum 3
        z[0],
        z[1],
        z[2],
      ],
      out
    );
  }

  const _t1 = V3.mk();
  const _t2 = V3.mk();
  const _t3 = V3.mk();
  export function fromYAndZish(
    newY: V3.InputT,
    newZish: V3.InputT,
    out?: T
  ): T {
    // TODO(@darzu): PERF. this could be sped up by inline a lot of this and simplifying
    const x = _t1;
    const y = V3.copy(_t2, newY);
    const z = V3.copy(_t3, newZish);
    orthonormalize(y, z, x);
    return fromXYZ(x, y, z, out);
  }

  // NOTE: assumes identity rotation corrisponds to Y+ being forward and Z+ being up
  export function fromForwardAndUpish(
    forward: V3.InputT,
    upish: V3.InputT,
    out?: T
  ): T {
    return fromYAndZish(forward, upish, out);
  }

  // Creates a rotation that will move <0,1,0> to point towards forward; no guarantees are made
  //  about its other axis orientations!
  const _t4 = V3.mk();
  export function fromForward(forward: V3.InputT, out?: T): T {
    // console.log(`fromForward, fwd:${vec3Dbg(forward)}`);

    const y = V3.copy(_t4, forward);
    V3.norm(y, y);

    // console.log(`normalized y: ${vec3Dbg(y)}`);

    // find an up-ish vector
    const upish = tV(0, 0, 1);
    if (Math.abs(V3.dot(y, upish)) > 0.9) V3.set(0, 1, 0, upish);

    // console.log(`upish: ${vec3Dbg(upish)}`);

    // orthonormalize
    const x = V3.tmp();
    V3.cross(y, upish, x);
    V3.norm(x, x);

    // console.log(`x: ${vec3Dbg(x)}`);

    V3.cross(x, y, upish);

    // console.log(`new upish: ${vec3Dbg(upish)}`);

    // console.log(`x: ${vec3Dbg(x)}, y: ${vec3Dbg(y)}, z: ${vec3Dbg(upish)}`);

    return fromXYZ(x, y, upish, out);
  }

  // TODO(@darzu): UNIFY w/ fromForward etc
  const _t5 = V3.mk();
  export function fromUp(up: V3.InputT, out?: T): T {
    const z = V3.copy(_t5, up);
    V3.norm(z, z);

    // find an x-ish vector
    const x = tV(1, 0, 0);
    if (Math.abs(V3.dot(z, x)) > 0.9) V3.set(0, 1, 0, x);

    // orthonormalize
    const y = V3.tmp();
    orthonormalize(z, x, y);

    return fromXYZ(x, y, z, out);
  }

  export function right(q: quat.InputT, out?: V3): V3 {
    return V3.tQuat(V3.RIGHT, q, out);
  }
  export function fwd(q: quat.InputT, out?: V3): V3 {
    // TODO(@darzu): swap with below
    return V3.tQuat(V3.FWD, q, out);
  }
  export function fwd_(q: quat.InputT, out?: V3): V3 {
    // TODO(@darzu): test this thoroughly against V3.tQuat(V3.UP, q, out)!
    // TODO(@darzu): broken.
    out = out ?? V3.tmp();
    var qx = q[0],
      qy = q[1],
      qz = q[2],
      qw = q[3];

    out[0] = (-qz * qw + qy * qx) * 2;
    out[1] = 1 + (qz * qz + qx * qx) * 2;
    out[2] = (qx * qw + qy * qz) * 2;
    return out;
  }
  export function up(q: quat.InputT, out?: V3): V3 {
    return V3.tQuat(V3.UP, q, out);
  }
  export function left(q: quat.InputT, out?: V3): V3 {
    return V3.tQuat(V3.LEFT, q, out);
  }
  export function back(q: quat.InputT, out?: V3): V3 {
    return V3.tQuat(V3.BACK, q, out);
  }
  export function down(q: quat.InputT, out?: V3): V3 {
    return V3.tQuat(V3.DOWN, q, out);
  }

  // TODO(@darzu): REFACTOR: add all swizzle like .xy(), .x(), .zyx(), etc.
}

// TODO(@darzu): HACK FOR DEBUGGING
// function vec3Dbg(v?: V3.InputT): string {
//   return v
//     ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`
//     : "NIL";
// }

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

  // TODO(@darzu): RENAME mk()
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
    const r = GL.invert(out ?? tmp(), v1) as T;
    // TODO(@darzu): allow invert matrix to fail?
    assert(
      r,
      `can't invert matrix! Probably NaNs or bad src matrix: ${JSON.stringify(
        v1
      )}`
    );
    return r;
  }

  export function scale(a: InputT, v: V3.InputT, out?: T): T {
    return GL.scale(out ?? tmp(), a, v) as T;
  }

  export function fromRotationTranslation(
    q: quat.InputT,
    v: V3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslation(out ?? tmp(), q, v) as T;
  }

  export function fromRotationTranslationScale(
    q: quat.InputT,
    v: V3.InputT,
    s: V3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslationScale(out ?? tmp(), q, v, s) as T;
  }

  export function fromRotationTranslationScaleOrigin(
    q: quat.InputT,
    v: V3.InputT,
    s: V3.InputT,
    o: V3.InputT,
    out?: T
  ): T {
    return GL.fromRotationTranslationScaleOrigin(out ?? tmp(), q, v, s, o) as T;
  }

  export function fromScaling(v: V3.InputT, out?: T): T {
    return GL.fromScaling(out ?? tmp(), v) as T;
  }

  export function fromTranslation(v: V3.InputT, out?: T): T {
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

  export function getTranslation(m: InputT, out?: V3.T): V3 {
    return GL.getTranslation(out ?? V3.tmp(), m) as V3;
  }

  export function getScaling(m: InputT, out?: V3.T): V3 {
    return GL.getScaling(out ?? V3.tmp(), m) as V3;
  }

  // TODO(@darzu): wait what, these should all rotate clockwise?
  //  comment was: "NOTE: rotates CCW"
  export function rotateX(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function rotateY(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  export function rotateZ(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, n) as T;
  }

  // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
  export function yaw(v1: InputT, n: number, out?: T) {
    return GL.rotateZ(out ?? tmp(), v1, -n) as T;
  }
  export function pitch(v1: InputT, n: number, out?: T) {
    return GL.rotateX(out ?? tmp(), v1, n) as T;
  }
  export function roll(v1: InputT, n: number, out?: T) {
    return GL.rotateY(out ?? tmp(), v1, n) as T;
  }
  export function fromYaw(rad: number, out?: T): T {
    return GL.fromZRotation(out ?? tmp(), -rad) as T;
  }
  export function fromPitch(rad: number, out?: T): T {
    return GL.fromXRotation(out ?? tmp(), rad) as T;
  }
  export function fromRoll(rad: number, out?: T): T {
    return GL.fromYRotation(out ?? tmp(), rad) as T;
  }
  export function fromYawPitchRoll(
    yaw: number = 0,
    pitch: number = 0,
    roll: number = 0,
    out?: T
  ): T {
    // TODO(@darzu): PERF! impl directly
    return fromQuat(quat.fromYawPitchRoll(yaw, pitch, roll), out);
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
  // TODO(@darzu): Z_UP?
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
    eye: V3.InputT,
    center: V3.InputT,
    up: V3.InputT,
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

  export function translate(m: InputT, v: V3.InputT, out?: T): T {
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

  // TODO(@darzu): RENAME to mk()
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
  export function fromBasis(xDir: V3.InputT, yDir: V3.InputT, zDir: V3.InputT) {
    return fromValues(
      xDir[0],
      xDir[1],
      xDir[2],
      yDir[0],
      yDir[1],
      yDir[2],
      zDir[0],
      zDir[1],
      zDir[2]
    );
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

  export function transpose(v1: InputT, out?: T): T {
    return GL.transpose(out ?? tmp(), v1) as T;
  }

  // TODO(@darzu): bug ? scale V2 input?
  export function scale(a: InputT, v: V2.InputT, out?: T): T {
    return GL.scale(out ?? tmp(), a, v) as T;
  }

  export function fromScaling(v: V2.InputT, out?: T): T {
    return GL.fromScaling(out ?? tmp(), v) as T;
  }

  export function fromQuat(q: quat, out?: T): T {
    return GL.fromQuat(out ?? tmp(), q) as T;
  }

  // Copies the upper-left 3x3 values into the given mat3.
  export function fromMat4(q: mat4.InputT, out?: T): T {
    return GL.fromMat4(out ?? tmp(), q) as T;
  }
}

// TODO(@darzu): HACKY temps
export const TV1 = V(0, 0, 0);
export const TV2 = V(0, 0, 0);
export const TV3 = V(0, 0, 0);
export const TV4 = V(0, 0, 0);
export const TV5 = V(0, 0, 0);
export const TV6 = V(0, 0, 0);

// Other utils:

// mutates all three vectors so they are all perpendicular and unit
//  orthogonal to eachother.
export function orthonormalize(v: V3, perpIsh: V3, outPerp2: V3) {
  // TODO(@darzu): there's a pattern somewhat similar in many places:
  //    orthonormalizing, Gram–Schmidt
  //    quatFromUpForward, getControlPoints, tripleProd?
  //    targetTo, lookAt ?
  // Also this can be more efficient by inlining
  V3.norm(v, v);
  V3.cross(v, perpIsh, outPerp2);
  V3.norm(outPerp2, outPerp2);
  V3.cross(outPerp2, v, perpIsh);
}

// prettier-ignore
export type InputT<T extends Record<any, any>> = {
  [k in keyof T]: 
    T[k] extends V3 ? V3.InputT : 
    T[k] extends V2 ? V2.InputT :
    T[k] extends quat ? quat.InputT :
    T[k] extends mat4 ? mat4.InputT :
    T[k] extends mat3 ? mat3.InputT :
    T[k] extends V4 ? V4.InputT :
    T[k]
};
