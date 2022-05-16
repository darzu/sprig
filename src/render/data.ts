// cytochrome's data helpers

import { mat4, quat, vec2, vec3, vec4 } from "../gl-matrix.js";
import { align, max, sum } from "../math.js";
import { assert } from "../test.js";
import { Intersect, isNumber, objMap } from "../util.js";

const WGSLScalars = ["bool", "i32", "u32", "f32", "f16"] as const;
type WGSLScalar = typeof WGSLScalars[number];
type WGSLVec = {
  [S in WGSLScalar]: `vec2<${S}>` | `vec3<${S}>` | `vec4<${S}>`;
}[WGSLScalar];
const WGSLMats = [
  "mat2x2<f32>",
  "mat3x3<f32>",
  "mat4x4<f32>",
  "mat2x3<f32>",
  "mat2x4<f32>",
  "mat3x4<f32>",
  "mat3x2<f32>",
  "mat4x2<f32>",
  "mat4x4<f32>",
] as const;
type WGSLMat = typeof WGSLMats[number];
type WGSLType = WGSLScalar | WGSLVec | WGSLMat;

type WGSLTypeToTSType = {
  f32: number;
  u32: number;
  "vec2<u32>": vec2;
  "vec2<f32>": vec2;
  "vec3<f32>": vec3;
  "mat4x4<f32>": mat4;
};

export type TexTypeToTSType = {
  rgba32float: vec4;
};
export const texTypeToBytes: Partial<Record<GPUTextureFormat, number>> = {
  rgba32float: Float32Array.BYTES_PER_ELEMENT * 4,
};
export type TexTypeAsTSType<F> = F extends keyof TexTypeToTSType
  ? TexTypeToTSType[F]
  : never;

export const GPUBufferBindingTypeToWgslVar: {
  [K in GPUBufferBindingType]: string;
} = {
  uniform: "var<uniform>",
  "read-only-storage": "var<storage, read>",
  storage: "var<storage, read_write>",
};

function wgslTypeToDummyVal<T extends WGSLType>(
  wgsl: T
): T extends keyof WGSLTypeToTSType ? WGSLTypeToTSType[T] : never {
  return _wgslTypeToDummyVal(wgsl);

  function _wgslTypeToDummyVal<T extends WGSLType>(wgsl: T): any {
    if (wgsl === "f32") return Math.random() * 100.0;
    if (wgsl === "vec2<f32>")
      return vec2.fromValues(Math.random(), Math.random());
    const randVec3 = () =>
      vec3.fromValues(Math.random(), Math.random(), Math.random());
    if (wgsl === "vec3<f32>") return randVec3();
    if (wgsl === "u32")
      return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const randAngle = () => Math.random() * 2 * Math.PI;
    const randQuat = () =>
      quat.fromEuler(quat.create(), randAngle(), randAngle(), randAngle());
    if (wgsl === "mat4x4<f32>")
      return mat4.fromRotationTranslationScaleOrigin(
        mat4.create(),
        randQuat(),
        randVec3(),
        randVec3(),
        randVec3()
      );

    throw `wgslTypeToDummyVal is missing ${wgsl}`;
  }
}

function cloneValue<T extends WGSLType>(
  type: T,
  val: T extends keyof WGSLTypeToTSType ? WGSLTypeToTSType[T] : never
): T extends keyof WGSLTypeToTSType ? WGSLTypeToTSType[T] : never {
  return _cloneValue(type, val);

  function _cloneValue<T extends WGSLType>(wgsl: T, val: any): any {
    if (wgsl === "f32") return val;
    if (wgsl === "vec2<f32>") return vec2.clone(val);
    if (wgsl === "vec3<f32>") return vec3.clone(val);
    if (wgsl === "u32") return val;
    if (wgsl === "mat4x4<f32>") return mat4.clone(val);

    throw `cloneValue is missing ${wgsl}`;
  }
}

function cloneStruct<O extends CyStructDesc>(
  desc: O,
  data: CyToTS<O>
): CyToTS<O> {
  let res: any = {};
  for (let name of Object.keys(desc)) {
    res[name] = cloneValue(desc[name], data[name]);
  }
  return res;
}

function createDummyStruct<O extends CyStructDesc>(desc: O): CyToTS<O> {
  let res: any = {};
  for (let name of Object.keys(desc)) {
    const type = desc[name];
    const val = wgslTypeToDummyVal(type);
    res[name] = val;
  }
  return res;
}

const wgslTypeToVertType: Partial<Record<WGSLType, GPUVertexFormat>> = {
  "vec2<f16>": "float16x2",
  "vec4<f16>": "float16x4",
  f32: "float32",
  "vec2<f32>": "float32x2",
  "vec3<f32>": "float32x3",
  "vec4<f32>": "float32x4",
  u32: "uint32",
  i32: "sint32",
};

// https://www.w3.org/TR/WGSL/#alignment-and-size
const wgslTypeToSize: Partial<Record<WGSLType, number>> = {
  i32: 4,
  u32: 4,
  f32: 4,
  "vec2<f32>": 8,
  "vec3<f32>": 12,
  "mat4x4<f32>": 64,
};
const alignUp = (n: number) => {
  // TODO(@darzu): i know there is a smarter way to write this...
  //  ... something something bit shifting
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  if (n <= 16) return 16;
  if (n <= 32) return 32;
  if (n <= 64) return 64;
  if (n <= 128) return 128;
  if (n <= 256) return 256;
  throw `${n} too big to align`;
};
// TODO(@darzu): this isn't quite right, a mat3x4<f32> is size 48 but aligns to 16
const wgslTypeToAlign = objMap(wgslTypeToSize, alignUp) as Partial<
  Record<WGSLType, number>
>;

export type CyStructDesc = Record<string, WGSLType>;

export type CyToTS<O extends CyStructDesc> = {
  [N in keyof O]: O[N] extends keyof WGSLTypeToTSType
    ? WGSLTypeToTSType[O[N]]
    : never;
};

export interface CyStruct<O extends CyStructDesc> {
  desc: O;
  memberCount: number;
  size: number;
  compactSize: number;
  offsets: number[];
  serialize: (data: CyToTS<O>) => Uint8Array;
  wgsl: (align: boolean, locationStart?: number) => string;
  // webgpu
  layout(
    idx: number,
    stage: GPUShaderStageFlags,
    type: GPUBufferBindingType
  ): GPUBindGroupLayoutEntry;
  vertexLayout(
    stepMode: GPUVertexStepMode,
    startLocation: number
  ): GPUVertexBufferLayout;
  clone: (data: CyToTS<O>) => CyToTS<O>;
  opts: CyStructOpts<O> | undefined;
}

export interface CyBuffer<O extends CyStructDesc> {
  struct: CyStruct<O>;
  // webgpu
  // TODO(@darzu): generalize to non-webgpu?
  binding(idx: number): GPUBindGroupEntry;
  buffer: GPUBuffer;
}

// TODO(@darzu): rename "one" to "singleton", "many" to "array" ?
export interface CyOne<O extends CyStructDesc> extends CyBuffer<O> {
  lastData: CyToTS<O> | undefined;
  queueUpdate: (data: CyToTS<O>) => void;
}
export interface CyMany<O extends CyStructDesc> extends CyBuffer<O> {
  length: number;
  queueUpdate: (data: CyToTS<O>, idx: number) => void;
  queueUpdates: (data: CyToTS<O>[], idx: number) => void;
}

export interface CyIdxBuffer {
  length: number;
  size: number;
  buffer: GPUBuffer;
  queueUpdate: (data: Uint16Array, startIdx: number) => void;
}

// TODO(@darzu): texture
export interface CyTexture {
  size: [number, number];
  texture: GPUTexture;
  format: GPUTextureFormat;
  // TODO(@darzu): support partial texture update?
  queueUpdate: (data: Float32Array) => void;
}

// export function cyStruct<O extends CyStruct>(struct: O): O {
//   // TODO(@darzu): impl other checks?
//   return struct;
// }

export type Serializer<O extends CyStructDesc> = (
  data: CyToTS<O>,
  offsets: number[],
  offsets_32: number[],
  views: { f32: Float32Array; u32: Uint32Array; u8: Uint8Array }
) => void;

export interface CyStructOpts<O extends CyStructDesc> {
  isUniform?: boolean;
  isCompact?: boolean;
  serializer?: Serializer<O>;
}

// TODO(@darzu): generalize to webgl?
/*
in vec3 a_position;
in vec3 a_color;
in vec3 a_normal;

// bind vertex buffers
gl.bindBuffer(gl.ARRAY_BUFFER, pool.vertexBuffer);
// TODO(@darzu): create these attrib points via CyBuffer
gl.vertexAttribPointer(
  a_loc_position,
  3,
  gl.FLOAT,
  false,
  VertexStruct.size,
  VertexStruct.offsets[0]
);
gl.enableVertexAttribArray(a_loc_position);
*/

export function createCyStruct<O extends CyStructDesc>(
  desc: O,
  opts?: CyStructOpts<O>
): CyStruct<O> {
  // TODO(@darzu): handle non-aligned for v-bufs
  // TODO(@darzu): emit @group(0) @binding(0) var<uniform> scene : Scene;
  // TODO(@darzu): a lot of this doesn't need the device, all that should move
  //    into cyStruct fn probably

  const sizes = Object.values(desc).map((v) => {
    const s = wgslTypeToSize[v];
    if (!s) throw `missing size for ${v}`;
    return s;
  });

  const alignments = sizes.map(alignUp);

  // check for out of size order elements
  sizes.reduce((p, n, i) => {
    if (p < n)
      throw `CyStruct must have members in descending size order.\n${JSON.stringify(
        desc
      )} @ ${i}`;
    return n;
  }, Infinity);

  let offsets: number[];
  if (opts?.isCompact) {
    offsets = sizes.reduce((p, n, i) => [...p, p[p.length - 1] + n], [0]);
    offsets.pop();
  } else {
    offsets = sizes.reduce(
      (p, n, i) => [...p, align(p[p.length - 1] + n, alignments[i + 1])],
      [0]
    );
    offsets.pop();
  }
  assert(
    offsets && sizes.length === offsets.length,
    "sizes.length === offsets.length"
  );

  const offsets_32 = offsets.map((o) => o >> 2);

  const structAlign = opts?.isUniform
    ? 256
    : opts?.isCompact
    ? 4 // https://gpuweb.github.io/gpuweb/#vertex-formats
    : max(alignments);
  const structSize = align(
    offsets[offsets.length - 1] + sizes[sizes.length - 1],
    structAlign
  );

  const names = Object.keys(desc);
  const types = Object.values(desc);

  // TODO(@darzu): support registering a custom serializer for perf reasons
  // TODO(@darzu): emit serialization code
  const scratch_u8 = new Uint8Array(structSize);
  const views = {
    u8: scratch_u8,
    f32: new Float32Array(scratch_u8.buffer),
    u32: new Uint32Array(scratch_u8.buffer),
  };
  function serializeSlow(data: CyToTS<O>): Uint8Array {
    // TODO(@darzu): disable this check for perf
    Object.keys(data).forEach((n, i) => {
      if (n !== names[i])
        throw `data values must be in the same order as the declaring struct.\n${JSON.stringify(
          desc
        )}\n"${n}" #${i}`;
    });

    // NOTE >>2 vs /4:
    // using some really janky dev console tests, it looks like there's no difference
    //  between X >> 2 and X / 4 (tried -12.5, 64, and Math.random()). Perf was identical.
    //  b = performance.now(); for (let i = 0; i < 10000000000; i++) -12.5 >> 2; a = performance.now(); a - b
    //  b = performance.now(); for (let i = 0; i < 10000000000; i++) -12.5 / 4; a = performance.now(); a - b

    Object.values(data).forEach((v, i) => {
      const t = types[i];
      const o = offsets[i];
      const o32 = offsets_32[i];
      if (t === "f32") views.f32[o32] = v;
      else if (t === "u32") views.u32[o32] = v;
      else if (t === "vec2<f32>") views.f32.set(v, o32);
      else if (t === "vec3<f32>") views.f32.set(v, o32);
      else if (t === "mat4x4<f32>") views.f32.set(v, o32);
      else throw `Unimplemented type in serializer: ${t}`;
    });

    return scratch_u8;
  }

  // check custom serializer correctness
  // TODO(@darzu): option to disable this
  let serialize = serializeSlow;
  if (opts?.serializer) {
    const dummy = createDummyStruct(desc);

    // run the baseline
    const slowRes = new Uint8Array(structSize);
    scratch_u8.fill(0);
    serializeSlow(dummy);
    slowRes.set(scratch_u8, 0);

    // run the passed in one
    const fastRes = new Uint8Array(structSize);
    scratch_u8.fill(0);
    opts.serializer(dummy, offsets, offsets_32, views);
    fastRes.set(scratch_u8, 0);

    // compare
    for (let i = 0; i < slowRes.length; i++)
      assert(
        slowRes[i] === fastRes[i],
        `Custom serializer for ${JSON.stringify(
          desc
        )} is probably incorrect at byte ${i}`
      );

    // use it
    serialize = (d) => {
      opts!.serializer!(d, offsets, offsets_32, views);
      return scratch_u8;
    };
  }

  const struct: CyStruct<O> = {
    desc,
    memberCount: Object.keys(desc).length,
    size: structSize,
    compactSize: sum(sizes),
    offsets,
    serialize,
    layout,
    wgsl,
    vertexLayout,
    clone,
    opts,
  };

  function clone(orig: CyToTS<O>): CyToTS<O> {
    return cloneStruct(desc, orig);
  }

  function wgsl(doAlign: boolean, locationStart?: number): string {
    assert(
      opts?.isCompact ? !doAlign : true,
      "Cannot use aligned WGSL struct w/ compact layout"
    );

    // Example output:
    // `
    // @location(0) position : vec3<f32>,
    // @location(1) color : vec3<f32>,
    // @location(2) normal : vec3<f32>,
    // @location(3) uv : vec2<f32>,
    // `

    // TODO(@darzu): support location and alignment

    let res = ``;

    let i = 0;
    for (let name of Object.keys(desc)) {
      const type = desc[name];
      // TODO(@darzu): remove eventually for perf
      if (doAlign && !wgslTypeToAlign[type])
        throw `Missing alignment info for ${type}`;
      if (doAlign) res += `@align(${wgslTypeToAlign[type]}) `;
      if (locationStart !== undefined)
        res += `@location(${locationStart + i}) `;
      res += `${name} : ${type},\n`;
      i++;
    }

    return res;
  }

  // TODO(@darzu): is this really worth while?
  function layout(
    idx: number,
    stage: GPUShaderStageFlags,
    type: GPUBufferBindingType
  ): GPUBindGroupLayoutEntry {
    return {
      binding: idx,
      visibility: stage,
      buffer: { type },
    };
  }

  function vertexLayout(
    stepMode: GPUVertexStepMode,
    startLocation: number
  ): GPUVertexBufferLayout {
    const attributes: GPUVertexAttribute[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const format = wgslTypeToVertType[types[i]];
      if (!format) throw `Unsupported type in vertex buffer: ${types[i]}`;
      attributes.push({
        shaderLocation: startLocation + i,
        offset: offsets[i],
        format,
      });
    }

    return {
      stepMode,
      arrayStride: structSize,
      attributes,
    };
  }

  return struct;
}

export function createCyOne<O extends CyStructDesc>(
  device: GPUDevice,
  struct: CyStruct<O>,
  usage: GPUBufferUsageFlags,
  initData?: CyToTS<O>
): CyOne<O> {
  assert(struct.opts?.isUniform, "CyOne struct must be created with isUniform");

  const _buf = device.createBuffer({
    size: struct.size,
    // TODO(@darzu): parameterize these
    // TODO(@darzu): be precise
    usage,
    mappedAtCreation: !!initData,
  });

  const buf: CyOne<O> = {
    struct,
    buffer: _buf,
    lastData: undefined,
    queueUpdate,
    binding,
  };

  if (initData) {
    buf.lastData = initData;
    const mappedBuf = new Uint8Array(_buf.getMappedRange());
    const d = struct.serialize(initData);
    mappedBuf.set(d, 0);
    _buf.unmap();
  }

  function queueUpdate(data: CyToTS<O>): void {
    // TODO(@darzu): measure perf. we probably want to allow hand written serializers
    buf.lastData = data;
    const b = struct.serialize(data);
    // assert(b.length % 4 === 0, `buf write must be 4 byte aligned: ${b.length}`);
    device.queue.writeBuffer(_buf, 0, b);
  }

  function binding(idx: number): GPUBindGroupEntry {
    return {
      binding: idx,
      resource: { buffer: _buf },
    };
  }

  return buf;
}

export function createCyMany<O extends CyStructDesc>(
  device: GPUDevice,
  struct: CyStruct<O>,
  usage: GPUBufferUsageFlags,
  lenOrData: number | CyToTS<O>[]
): CyMany<O> {
  const hasInitData = typeof lenOrData !== "number";
  const length = hasInitData ? lenOrData.length : lenOrData;

  if ((usage & GPUBufferUsage.UNIFORM) !== 0) {
    assert(
      struct.size % 256 === 0,
      "CyMany with UNIFORM usage must be 256 aligned"
    );
  }

  const _buf = device.createBuffer({
    size: struct.size * length,
    // TODO(@darzu): parameterize these
    usage,
    mappedAtCreation: hasInitData,
  });

  const buf: CyMany<O> = {
    struct,
    buffer: _buf,
    length,
    queueUpdate,
    queueUpdates,
    binding,
  };

  const stride = struct.size;

  if (hasInitData) {
    const data = lenOrData;
    const mappedBuf = new Uint8Array(_buf.getMappedRange());
    for (let i = 0; i < data.length; i++) {
      const d = struct.serialize(data[i]);
      mappedBuf.set(d, i * stride);
    }
    _buf.unmap();
  }

  function queueUpdate(data: CyToTS<O>, index: number): void {
    const b = struct.serialize(data);
    // TODO(@darzu): disable for perf?
    // assert(b.length % 4 === 0);
    device.queue.writeBuffer(_buf, index * stride, b);
  }
  function queueUpdates(data: CyToTS<O>[], index: number): void {
    const serialized = new Uint8Array(stride * data.length);
    data.forEach((d, i) => {
      serialized.set(struct.serialize(d), stride * i);
    });
    // assert(serialized.length % 4 === 0);
    device.queue.writeBuffer(_buf, index * stride, serialized);
  }

  function binding(idx: number): GPUBindGroupEntry {
    return {
      binding: idx,
      resource: { buffer: _buf },
    };
  }

  return buf;
}

export function createCyIdxBuf(
  device: GPUDevice,
  lenOrData: number | Uint16Array
): CyIdxBuffer {
  const hasInitData = !isNumber(lenOrData);
  const length = hasInitData ? lenOrData.length : lenOrData;

  const size = align(length * Uint16Array.BYTES_PER_ELEMENT, 4);
  console.log(`idx size: ${size}`);

  const _buf = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: hasInitData,
  });

  const buf: CyIdxBuffer = {
    buffer: _buf,
    length,
    size,
    queueUpdate,
  };

  if (hasInitData) {
    const data = lenOrData;
    const mappedBuf = new Uint16Array(_buf.getMappedRange());
    assert(mappedBuf.length >= data.length, "mappedBuf.length >= data.length");
    mappedBuf.set(data);
    _buf.unmap();
  }

  function queueUpdate(data: Uint16Array, startIdx: number): void {
    const startByte = startIdx * Uint16Array.BYTES_PER_ELEMENT;
    // const byteView = new Uint8Array(data);
    // assert(data.length % 2 === 0);
    device.queue.writeBuffer(_buf, startByte, data);
  }

  return buf;
}

// TODO(@darzu): these paramters should just be CyTexturePtr
export function createCyTexture(
  device: GPUDevice,
  size: [number, number],
  format: GPUTextureFormat,
  init: () => Float32Array | undefined
): CyTexture {
  const tex = device.createTexture({
    size: size,
    format: format,
    dimension: "2d",
    // TODO(@darzu): be more precise
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING,
  });
  const bytesPerVal = texTypeToBytes[format];
  assert(bytesPerVal, `Unimplemented format: ${format}`);
  const queueUpdate = (data: Float32Array) => {
    device.queue.writeTexture(
      { texture: tex },
      data,
      {
        offset: 0,
        bytesPerRow: size[0] * bytesPerVal,
        rowsPerImage: size[1],
      },
      {
        width: size[0],
        height: size[1],
        // TODO(@darzu): what does this mean?
        depthOrArrayLayers: 1,
      }
    );
  };
  const initVal = init();
  if (initVal) {
    queueUpdate(initVal);
  }
  const cyTex: CyTexture = {
    size: size,
    format: format,
    texture: tex,
    queueUpdate,
  };
  return cyTex;
}
