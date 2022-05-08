// cytochrome's data helpers

import { mat4, vec2, vec3 } from "../gl-matrix.js";
import { align, sum } from "../math.js";
import { Intersect, objMap } from "../util.js";

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
  "vec2<u32>": vec2;
  "vec2<f32>": vec2;
  "vec3<f32>": vec3;
  "mat4x4<f32>": mat4;
};

const vertTypeToWgslType: Partial<Record<GPUVertexFormat, WGSLType>> = {
  float16x2: "vec2<f16>",
  float16x4: "vec4<f16>",
  float32: "f32",
  float32x2: "vec2<f32>",
  float32x3: "vec3<f32>",
  float32x4: "vec4<f32>",
  uint32: "u32",
  sint32: "i32",
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
// TODO(@darzu): inspect
console.dir(wgslTypeToAlign);

type CyStructDesc = Record<string, WGSLType>;

export type CyToObj<O extends CyStructDesc> = {
  [N in keyof O]: O[N] extends keyof WGSLTypeToTSType
    ? WGSLTypeToTSType[O[N]]
    : never;
};

export interface CyStruct<O extends CyStructDesc> {
  desc: O;
  size: number;
  serializeSlow: (data: CyToObj<O>) => Uint8Array;
  layout(idx: number): GPUBindGroupLayoutEntry;
  wgsl: (align: boolean) => string;
}

export interface CyBuffer<O extends CyStructDesc> {
  struct: CyStruct<O>;
  binding(idx: number): GPUBindGroupEntry;
}
export interface CyOne<O extends CyStructDesc> extends CyBuffer<O> {
  lastData: CyToObj<O> | undefined;
  queueUpdate: (data: CyToObj<O>) => void;
}
// export interface CyMany<O extends CyStructDesc> extends CyBuffer<O> {
//   lastData: CyToObj<O> | undefined;
//   queueUpdate: (data: CyToObj<O>) => void;
// }

// export function cyStruct<O extends CyStruct>(struct: O): O {
//   // TODO(@darzu): impl other checks?
//   return struct;
// }

export function toWGSLStruct(cyStruct: CyStructDesc, doAlign: boolean): string {
  // Example output:
  // `
  // @location(0) position : vec3<f32>,
  // @location(1) color : vec3<f32>,
  // @location(2) normal : vec3<f32>,
  // @location(3) uv : vec2<f32>,
  // `

  // TODO(@darzu): support location and alignment

  let res = ``;

  for (let name of Object.keys(cyStruct)) {
    const type = cyStruct[name];
    // TODO(@darzu): remove eventually for perf
    if (doAlign && !wgslTypeToAlign[type])
      throw `Missing alignment info for ${type}`;
    const align = doAlign ? `@align(${wgslTypeToAlign[type]})` : ``;
    res += `${align} ${name} : ${type},`;
  }

  return res;
}

export function createCyStruct<O extends CyStructDesc>(desc: O): CyStruct<O> {
  // TODO(@darzu): handle non-aligned for v-bufs
  // TODO(@darzu): emit @group(0) @binding(0) var<uniform> scene : Scene;
  // TODO(@darzu): a lot of this doesn't need the device, all that should move
  //    into cyStruct fn probably

  const sizes = Object.values(desc).map((v) => {
    const s = wgslTypeToAlign[v];
    if (!s) throw `missing size for ${v}`;
    return s;
  });

  // check for out of size order elements
  sizes.reduce((p, n, i) => {
    if (p < n)
      throw `CyStruct must have members in descending size order.\n${JSON.stringify(
        desc
      )} @ ${i}`;
    return n;
  }, Infinity);

  const structSize = align(sum(sizes), 256);

  const offsets = sizes.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);

  const names = Object.keys(desc);
  const types = Object.values(desc);

  // TODO(@darzu): support registering a custom serializer for perf reasons
  // TODO(@darzu): emit serialization code
  const scratch_u8 = new Uint8Array(structSize);
  const scratch_f32 = new Float32Array(scratch_u8.buffer);
  function serializeSlow(data: CyToObj<O>): Uint8Array {
    // TODO(@darzu): disable this check for perf
    Object.keys(data).forEach((n, i) => {
      if (n !== names[i])
        throw `data values must be in the same order as the declaring struct.\n${JSON.stringify(
          desc
        )}\n"${n}" #${i}`;
    });

    Object.values(data).forEach((v, i) => {
      const t = types[i];
      const o = offsets[i];
      if (t === "f32") scratch_f32[o / 4] = v;
      else if (t === "vec2<f32>") scratch_f32.set(v, o / 4);
      else if (t === "vec3<f32>") scratch_f32.set(v, o / 4);
      else if (t === "mat4x4<f32>") scratch_f32.set(v, o / 4);
    });

    return scratch_u8;
  }

  const struct: CyStruct<O> = {
    desc,
    size: structSize,
    serializeSlow,
    layout,
    wgsl,
  };

  function wgsl(align: boolean): string {
    return toWGSLStruct(desc, align);
  }

  function layout(idx: number): GPUBindGroupLayoutEntry {
    return {
      binding: idx,
      // TODO(@darzu): parameterize
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      // TODO(@darzu): parameterize
      buffer: { type: "uniform" },
    };
  }

  return struct;
}

export function createCyOne<O extends CyStructDesc>(
  device: GPUDevice,
  struct: CyStruct<O>
): CyOne<O> {
  const _buf = device.createBuffer({
    size: struct.size,
    // TODO(@darzu): parameterize these
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
  });

  const buf: CyOne<O> = {
    struct,
    lastData: undefined,
    queueUpdate,
    binding,
  };

  function queueUpdate(data: CyToObj<O>): void {
    // TODO(@darzu): measure perf. we probably want to allow hand written serializers
    buf.lastData = data;
    const b = struct.serializeSlow(data);
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

// TODO(@darzu): support custom serializers
/*
  export function serialize(
    buffer: Uint8Array,
    byteOffset: number,
    data: Data
  ) {
    scratch_f32.set(data.cameraViewProjMatrix, _offsets[0]);
    // scratch_f32.set(data.lightViewProjMatrix, _offsets[1]);
    scratch_f32.set(data.light1Dir, _offsets[1]);
    scratch_f32.set(data.light2Dir, _offsets[2]);
    scratch_f32.set(data.light3Dir, _offsets[3]);
    scratch_f32.set(data.cameraPos, _offsets[4]);
    scratch_f32.set(data.playerPos, _offsets[5]);
    scratch_f32[_offsets[6]] = data.time;
    buffer.set(scratch_f32_as_u8, byteOffset);
  }
*/

// let ropePointData: RopePoint.Data[];
// let ropePointBuffer: GPUBuffer;
// let scratchRopePointData: Uint8Array;

// this.ropePointBuffer = device.createBuffer({
//   size: RopePoint.ByteSizeAligned * this.ropePointData.length,
//   usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
//   // GPUBufferUsage.COPY_DST,
//   mappedAtCreation: true,
// });
// this.scratchRopePointData = new Uint8Array(
//   RopePoint.ByteSizeAligned * this.ropePointData.length
// );
// for (let i = 0; i < this.ropePointData.length; i++)
//   RopePoint.serialize(
//     this.scratchRopePointData,
//     i * RopePoint.ByteSizeAligned,
//     this.ropePointData[i]
//   );
// new Uint8Array(this.ropePointBuffer.getMappedRange()).set(
//   this.scratchRopePointData
// );
// this.ropePointBuffer.unmap();

// const cmpRopeBindGroup = this.device.createBindGroup({
//   // layout: this.cmpRopePipeline.getBindGroupLayout(0),
//   layout: this.cmpRopeBindGroupLayout,
//   entries: [
//     {
//       binding: 0,
//       resource: {
//         buffer: this.sceneUniformBuffer,
//       },
//     },
//     {
//       binding: 1,
//       resource: { buffer: this.ropePointBuffer },
//     },
//   ],
// });

// bundleEnc.setVertexBuffer(1, this.ropePointBuffer);

// {
//   stepMode: "instance",
//   arrayStride: RopePoint.ByteSizeAligned,
//   attributes: RopePoint.WebGPUFormat,
// },

// export module RopePoint {
//   export interface Data {
//     position: vec3;
//     prevPosition: vec3;
//     locked: number;
//   }

//   // // const _byteCounts = [3 * 4, 3 * 4, 3 * 4];
//   // const _byteCounts = [3 * 4, 3 * 4, 1 * 4];

//   // const _byteOffsets = _byteCounts.reduce(
//   //   (p, n) => [...p, p[p.length - 1] + n],
//   //   [0]
//   // );

//   const _byteOffsets = [
//     0, // TODO(@darzu): auto handle alignment requirements
//     16,
//     28,
//   ];

//   // define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
//   // const prevOffset = bytesPerVec3 * 1 + 4;
//   export const WebGPUFormat: GPUVertexAttribute[] = [
//     { shaderLocation: 1, offset: _byteOffsets[0], format: "float32x3" },
//     {
//       shaderLocation: 2,
//       offset: _byteOffsets[1],
//       format: "float32x3",
//     },
//     {
//       shaderLocation: 3,
//       offset: _byteOffsets[2],
//       format: "float32",
//       // format: "float32x3",
//     },
//   ];

//   // TODO(@darzu): SCENE FORMAT
//   // defines the format of our scene's uniform data
//   // export const ByteSizeExact = sum(_byteCounts);
//   // vertex objs should probably be 16 byte aligned
//   // TODO(@darzu): alignment https://www.w3.org/TR/WGSL/#alignment-and-size
//   // export const ByteSizeAligned = ByteSizeExact;
//   export const ByteSizeAligned = 32; // TODO(@darzu): auto align
//   // export const ByteSizeAligned = align(ByteSizeExact, 16);

//   export function generateWGSLUniformStruct() {
//     // TODO(@darzu): enforce agreement w/ Scene interface
//     // TODO(@darzu): auto gen alignment
//     return `
//             @align(16) position : vec3<f32>,
//             @align(16) prevPosition : vec3<f32>,
//             // locked : vec3<f32>,
//             @align(4) locked : f32,
//         `;
//   }

//   const scratch_u8 = new Uint8Array(ByteSizeAligned);
//   const scratch_as_f32 = new Float32Array(scratch_u8.buffer);
//   const scratch_as_u32 = new Uint32Array(scratch_u8.buffer);
//   export function serialize(
//     buffer: Uint8Array,
//     byteOffset: number,
//     data: Data
//   ) {
//     scratch_as_f32.set(data.position, _byteOffsets[0] / 4);
//     scratch_as_f32.set(data.prevPosition, _byteOffsets[1] / 4);
//     // scratch_as_f32.set([data.locked, 0, 0], _byteOffsets[2] / 4);
//     // scratch_as_f32[_byteOffsets[2] / 4] = data.locked;
//     scratch_as_f32[_byteOffsets[2] / 4] = data.locked;
//     // scratch_f32.set(data.lightViewProjMatrix, _offsets[1]);
//     buffer.set(scratch_u8, byteOffset);
//   }
// }
