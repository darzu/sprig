import { CY } from "../gpu-registry.js";
import { meshPoolPtr } from "./std-scene.js";

// TODO(@darzu): rename to "uvmap" or similar?

export const uvToPosTex = CY.createTexture("uvToPosTex", {
  init: () => undefined,
  size: [128, 128],
  format: "rgba32float",
});

export const unwrapPipeline = CY.createRenderPipeline("unwrapPipe", {
  globals: [],
  shader: () => `
  struct VertexOutput {
    @builtin(position) fragPos : vec4<f32>,
    @location(0) rgba : vec4<f32>,
  }

  @stage(vertex)
  fn vertMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = meshUni.transform * vec4<f32>(input.position, 1.0);
    // output.rgba = vec4(input.uv, 0.0, 1.0);
    output.rgba = worldPos;
    let xy = input.uv * 2.0 - 1.0;
    output.fragPos = vec4(xy, 0.0, 1.0);
    return output;
  }

  @stage(fragment) fn fragMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // return vec4(0.5);
    // return input.fragPos;
    return input.rgba;
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
  ],
});
