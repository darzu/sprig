// cytochrome's data helpers

import { Intersect } from "../util.js";

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
  "vec2<f32>": [number, number];
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

type CyNameType<
  N extends string = string,
  T extends WGSLType = WGSLType
> = readonly [N, T];

type CyToObj<NTs extends readonly CyNameType[]> = Intersect<{
  [I in keyof NTs]: NTs[I] extends CyNameType<infer N, infer T>
    ? { [k in N]: T }
    : never;
}>;

// type foo = CyToObj<[["bar", "f32"], ["baz", "vec2<u32>"]]>;

// type CyStruct = CyNameType[];

// type CyFormat = {
//   struct: [],
//   modes:
// }

interface CyUni<NTs extends readonly CyNameType[]> {
  set: (data: CyToObj<NTs>) => void;
}

function createCyUni<NTs extends readonly CyNameType[]>(
  struct: readonly [...NTs]
): CyUni<NTs> {
  throw "TODO";
}

const myUni = createCyUni([
  ["bar", "f32"],
  ["baz", "vec2<u32>"],
] as const);
// myUni.set({ bar: 2, baz: [0, 1] });

type CyToObj2<O extends Record<string, WGSLType>> = { [N in keyof O]: O[N] };

interface CyUni2<O extends Record<string, WGSLType>> {
  set: (data: CyToObj2<O>) => void;
}
// <NS extends string, TS extends WGSLType>
function createCyUni2<O extends Record<string, WGSLType>>(
  struct: O
): CyUni2<O> {
  throw "TODO";
}
const myUni2 = createCyUni2({
  bar: "f32",
  baz: "vec2<u32>",
});
// myUni.set({ bar: 2, baz: [0, 1] });

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
