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

type CyStruct = Record<string, WGSLType>;

export type CyToObj<O extends CyStruct> = {
  [N in keyof O]: O[N] extends keyof WGSLTypeToTSType
    ? WGSLTypeToTSType[O[N]]
    : never;
};

export interface CyUniform<O extends CyStruct> {
  lastData: CyToObj<O> | undefined;
  queueUpdate: (data: CyToObj<O>) => void;
  binding(idx: number): GPUBindGroupEntry;
  layout(idx: number): GPUBindGroupLayoutEntry;
}

export function cyStruct<O extends CyStruct>(struct: O): O {
  // TODO(@darzu): impl other checks?
  return struct;
}

// <NS extends string, TS extends WGSLType>
export function createCyUniform<O extends CyStruct>(
  device: GPUDevice,
  struct: O
): CyUniform<O> {
  // TODO(@darzu): handle non-aligned for v-bufs

  const sizes = Object.values(struct).map((v) => {
    const s = wgslTypeToAlign[v];
    if (!s) throw `missing size for ${v}`;
    return s;
  });

  // check for out of size order elements
  sizes.reduce((p, n, i) => {
    if (p < n)
      throw `CyStruct must have members in descending size order.\n${JSON.stringify(
        struct
      )} @ ${i}`;
    return n;
  }, Infinity);

  const bufSize = align(sum(sizes), 256);

  const buf = device.createBuffer({
    size: bufSize,
    // TODO(@darzu): parameterize these
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: false,
  });

  const offsets = sizes.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);

  const names = Object.keys(struct);
  const types = Object.values(struct);

  // TODO(@darzu): support registering a custom serializer for perf reasons
  // TODO(@darzu): emit serialization code
  const scratch_u8 = new Uint8Array(bufSize);
  const scratch_f32 = new Float32Array(scratch_u8.buffer);
  function serializeAuto(data: CyToObj<O>) {
    // TODO(@darzu): disable this check for perf
    Object.keys(data).forEach((n, i) => {
      if (n !== names[i])
        throw `data values must be in the same order as the declaring struct.\n${JSON.stringify(
          struct
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
  }

  const uni: CyUniform<O> = {
    lastData: undefined,
    queueUpdate,
    binding,
    layout,
  };

  function queueUpdate(data: CyToObj<O>): void {
    // TODO(@darzu): measure perf. we probably want to allow hand written serializers
    uni.lastData = data;
    serializeAuto(data);
    device.queue.writeBuffer(buf, 0, scratch_u8.buffer);
  }

  function binding(idx: number): GPUBindGroupEntry {
    return {
      binding: idx,
      resource: { buffer: buf },
    };
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

  return uni;
}

if (false as true) {
  const bogusDevice: GPUDevice = null as any as GPUDevice;
  const myUni = cyStruct({
    bar: "f32",
    baz: "vec2<u32>",
  });
  const myUniBuf = createCyUniform(bogusDevice, myUni);
  myUniBuf.queueUpdate({ bar: 2, baz: [0, 1] });

  const SceneStruct = cyStruct({
    cameraViewProjMatrix: "mat4x4<f32>",
    light1Dir: "vec3<f32>",
    light2Dir: "vec3<f32>",
    light3Dir: "vec3<f32>",
    cameraPos: "vec3<f32>",
    playerPos: "vec2<f32>",
    time: "f32",
  });

  const sceneUni = createCyUniform(bogusDevice, SceneStruct);
  sceneUni.queueUpdate({
    cameraViewProjMatrix: mat4.create(),
    light1Dir: vec3.create(),
    light2Dir: vec3.create(),
    light3Dir: vec3.create(),
    cameraPos: vec3.create(),
    playerPos: vec2.create(),
    time: 0,
  });
}

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
