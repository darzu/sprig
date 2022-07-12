import { mathMap } from "../../math.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY } from "../gpu-registry.js";
import { meshPoolPtr } from "./std-scene.js";

const size = 64;

// TODO(@darzu): rename to "uvmap" or similar?

export const uvToPosTex = CY.createTexture("uvToPosTex", {
  init: () => undefined,
  size: [size, size],
  format: "rgba32float",
});

// TODO(@darzu): rgba32float is too aggressive for this; revist all formats used
//    in sprigland
const uvMaskTex = CY.createTexture("uvMaskTex", {
  init: () => undefined,
  size: [size, size],
  format: "rgba16float",
});

export const uvBorderMask = CY.createTexture("uvBorderMask", {
  init: () => undefined,
  size: [size, size],
  format: "rgba16float",
});

export const uvBorderMaskPipeline = createRenderTextureToQuad(
  "uvBorderMaskPipeline",
  uvMaskTex,
  uvBorderMask,
  -1,
  1,
  -1,
  1,
  false,
  (inPxVar, uvVar) => `return 1.0 - vec4(${inPxVar});`
).pipeline;

export const uvPosBorderMask = CY.createTexture("uvPosBorderMask", {
  init: () => undefined,
  size: [size, size],
  format: "rgba16float",
});

export const uvPosBorderMaskPipeline = createRenderTextureToQuad(
  "uvPosBorderMaskPipeline",
  uvBorderMask,
  uvPosBorderMask,
  -1,
  1,
  -1,
  1,
  false,
  (inPxVar, uvVar) => `
  if (${inPxVar}.x > 0.0) {
    return vec4(${uvVar}, 0.0, 1.0);
  } else {
    discard;
  }
  `
).pipeline;

const borderWidth = (2.0 / size).toFixed(4);

export const unwrapPipeline = CY.createRenderPipeline("unwrapPipe", {
  globals: [],
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

    let w = ${borderWidth};
    let xy = (input.uv * (2.0 - w * 2.0) - (1.0 - w));
    output.fragPos = vec4(xy, 0.0, 1.0);
    return output;
  }

  struct FragOut {
    @location(0) worldPos: vec4<f32>,
    @location(1) uv: vec4<f32>,
  }

  @fragment fn fragMain(input: VertexOutput) -> FragOut {
    var output: FragOut;
    output.worldPos = input.worldPos;
    output.uv = vec4(1.0);
    return output;
  }
  `,
  shaderVertexEntry: "vertMain",
  shaderFragmentEntry: "fragMain",
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  output: [
    {
      ptr: uvToPosTex,
      clear: "once",
      defaultColor: [0.0, 0.0, 0.0, 1.0],
    },
    {
      ptr: uvMaskTex,
      clear: "once",
      defaultColor: [0.0, 0.0, 0.0, 1.0],
    },
  ],
});