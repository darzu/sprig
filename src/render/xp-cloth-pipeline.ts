import { CY } from "./gpu-registry.js";

const CLOTH_SIZE = 10; // TODO(@darzu):

const clothTexPtrDesc: Parameters<typeof CY.createTexture>[1] = {
  size: [CLOTH_SIZE, CLOTH_SIZE],
  format: "rgba32float",
  init: () => {
    const clothData = new Float32Array(10 * 10 * 4);
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const i = (y + x * 10) * 3;
        clothData[i + 0] = i / clothData.length;
        clothData[i + 1] = i / clothData.length;
        clothData[i + 2] = i / clothData.length;
      }
    }
    return clothData;
  },
};
const clothTexPtr0 = CY.createTexture("clothTex0", {
  ...clothTexPtrDesc,
});
const clothTexPtr1 = CY.createTexture("clothTex1", {
  ...clothTexPtrDesc,
});

// TODO(@darzu): CLOTH
let clothReadIdx = 1;

export const cloth_shader = () =>
  `
// @group(0) @binding(1) var inTex : texture_2d<f32>;
// @group(0) @binding(2) var outTex : texture_storage_2d<rgba32float, write>;

@stage(compute) @workgroup_size(10, 10)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  // var index : u32 = GlobalInvocationID.x;

  // let dims : vec2<i32> = textureDimensions(inTex, 0);

  // let uv: vec2<f32> = vec2<f32>(0.5, 0.5);

  // let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
  let uvInt: vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
  let texDisp = textureLoad(inTex, uvInt, 0);

  // textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz + vec3<f32>(0.01), 1.0));
  textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz * 1.01, 1.0));
}

`;

export const cmpClothPipelinePtr0 = CY.createComputePipeline("clothComp0", {
  globals: [
    { ptr: clothTexPtr0, access: "read", alias: "inTex" },
    { ptr: clothTexPtr1, access: "write", alias: "outTex" },
  ],
  shader: cloth_shader,
  shaderComputeEntry: "main",
});
export const cmpClothPipelinePtr1 = CY.createComputePipeline("clothComp1", {
  globals: [
    { ptr: clothTexPtr1, access: "read", alias: "inTex" },
    { ptr: clothTexPtr0, access: "write", alias: "outTex" },
  ],
  shader: cloth_shader,
  shaderComputeEntry: "main",
});
