import { mathMap } from "../../math.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY } from "../gpu-registry.js";
import { meshPoolPtr } from "./std-scene.js";

// TODO(@darzu): parameterize and generalize this for other meshes

export const uvToPosTex = CY.createTexture("uvToPosTex", {
  size: [128, 128],
  format: "rgba32float",
});

export const uvMaskTex = CY.createTexture("uvMaskTex", {
  size: [512, 512],
  format: "r8unorm",
});

// // TODO(@darzu): rgba32float is too aggressive for this; revist all formats used
// //    in sprigland
// const uvMaskTex = CY.createTexture("uvMaskTex", {
//   size: [size, size],
//   format: "rgba16float",
// });

// export const uvBorderMask = CY.createTexture("uvBorderMask", {
//   size: [size, size],
//   format: "rgba16float",
// });

// export const uvBorderMaskPipeline = createRenderTextureToQuad(
//   "uvBorderMaskPipeline",
//   uvMaskTex,
//   uvBorderMask,
//   -1,
//   1,
//   -1,
//   1,
//   false,
//   ({ inPx }) => `return 1.0 - vec4(${inPx});`
// ).pipeline;

// export const uvPosBorderMask = CY.createTexture("uvPosBorderMask", {
//   size: [size, size],
//   format: "rgba16float",
// });

// export const uvPosBorderMaskPipeline = createRenderTextureToQuad(
//   "uvPosBorderMaskPipeline",
//   uvBorderMask,
//   uvPosBorderMask,
//   -1,
//   1,
//   -1,
//   1,
//   false,
//   ({ inPx, uv }) => `
//   if (${inPx}.x > 0.0) {
//     return vec4(${uv}, 0.0, 1.0);
//   } else {
//     discard;
//   }
//   `
// ).pipeline;

export const unwrapPipeline = CY.createRenderPipeline("unwrapPipe", {
  globals: [{ ptr: uvToPosTex, access: "write" }],
  shader: () => `
  struct VertexOutput {
    @builtin(position) fragPos : vec4<f32>,
    @location(0) worldPos : vec4<f32>,
    @location(1) uv: vec2<f32>,
  }

  @vertex
  fn vertMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = meshUni.transform * vec4<f32>(input.position, 1.0);

    output.uv = input.uv;
    output.worldPos = worldPos;

    let xy = (input.uv * 2.0 - 1.0) * vec2(1.0, -1.0);
    output.fragPos = vec4(xy, 0.0, 1.0);
    return output;
  }

  struct FragOut {
    // @location(0) worldPos: vec4<f32>,
    @location(0) uv: f32,
  }

  @fragment fn fragMain(input: VertexOutput) -> FragOut {
    var output: FragOut;
    let worldPos = vec4(input.worldPos.xyz, 0.0);
    let dimsI = textureDimensions(uvToPosTex);
    let dimsF = vec2<f32>(dimsI);
    let xy = vec2<i32>(input.uv * dimsF);
    textureStore(uvToPosTex, xy, worldPos);
    // output.worldPos = worldPos;
    output.uv = 1.0;
    return output;
  }
  `,
  shaderVertexEntry: "vertMain",
  shaderFragmentEntry: "fragMain",
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  cullMode: "none",
  output: [
    // {
    //   ptr: uvToPosTex,
    //   clear: "once",
    //   defaultColor: [0.0, 0.0, 0.0, 0.0],
    // },
    {
      ptr: uvMaskTex,
      clear: "once",
      defaultColor: [0.0, 0.0, 0.0, 0.0],
    },
  ],
});
