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

// export const uvPosBorderMask = uvMaskTex;
export const uvPosBorderMask = CY.createTexture("uvPosBorderMask", {
  init: () => undefined,
  size: [size, size],
  format: "rgba16float",
});

export const uvPosBorderMaskPipeline = createRenderTextureToQuad(
  "uvPosBorderMaskPipeline",
  uvBorderMask,
  // uvMaskTex,
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
    return vec4(0.0, 0.0, 0.0, 1.0);
    // discard;
  }
  `
).pipeline;

const borderWidth = (2.0 / size).toFixed(4);

export const unwrapPipeline_bug = CY.createRenderPipeline("unwrapPipe_bug", {
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

export const unwrapPipeline_nobug = CY.createRenderPipeline(
  "unwrapPipe_nobug",
  {
    globals: [],
    shader: () => `
  struct VertexOutput {
    @builtin(position) fragPos : vec4<f32>,
    @location(0) worldPos : vec4<f32>,
    @location(1) uv: vec2<f32>,
  }

  @vertex
  fn vertMain(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
      vec2<f32>(-0.6, -0.6),
      vec2<f32>(0.6, -0.6),
      vec2<f32>(0.6, 0.6),
      vec2<f32>(-0.6, 0.6),
      vec2<f32>(-0.6, -0.6),
      vec2<f32>(0.6, 0.6),
    );

    var uv = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
    );

    var output : VertexOutput;
    output.fragPos = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    output.worldPos = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    output.uv = uv[VertexIndex];
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
      vertexCount: 6,
      stepMode: "single-draw",
    },
    // meshOpt: {
    //   pool: meshPoolPtr,
    //   stepMode: "per-mesh-handle",
    // },
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
  }
);
