import { mathMap } from "../../math.js";
import { CY } from "../gpu-registry.js";
import { meshPoolPtr } from "./std-scene.js";

const size = 128;

// TODO(@darzu): rename to "uvmap" or similar?

export const uvToPosTex = CY.createTexture("uvToPosTex", {
  init: () => undefined,
  size: [size, size],
  format: "rgba32float",
});

// TODO(@darzu): rgba32float is too aggressive for this
export const uvMaskTex = CY.createTexture("uvMaskTex", {
  init: () => undefined,
  size: [size, size],
  format: "rgba32float",
});

const borderWidth = (2.0 / size).toFixed(4);

export const unwrapPipeline = CY.createRenderPipeline("unwrapPipe", {
  globals: [],
  shader: () => `
  struct VertexOutput {
    @builtin(position) fragPos : vec4<f32>,
    @location(0) worldPos : vec4<f32>,
    @location(1) uv: vec2<f32>,
  }

  @stage(vertex)
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

  @stage(fragment) fn fragMain(input: VertexOutput) -> FragOut {
    var output: FragOut;
    output.worldPos = input.worldPos;
    output.uv = vec4(input.uv, 0.0, 1.0);
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
