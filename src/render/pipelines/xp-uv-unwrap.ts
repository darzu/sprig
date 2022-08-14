import { mathMap } from "../../math.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY } from "../gpu-registry.js";
import { oceanPoolPtr } from "./std-ocean.js";

// TODO(@darzu): parameterize and generalize this for other meshes

export const uvToPosTex = CY.createTexture("uvToPosTex", {
  size: [128, 128],
  format: "rgba32float",
});

export const uvToNormTex = CY.createTexture("uvToNormTex", {
  size: [128, 128],
  format: "rgba32float",
});

export const uvMaskTex = CY.createTexture("uvMaskTex", {
  size: [512, 512],
  format: "r8unorm",
});

const unwrapVert = `
struct VertexOutput {
  @builtin(position) fragPos : vec4<f32>,
  @location(0) worldPos : vec4<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv: vec2<f32>,
}

@vertex
fn vertMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = oceanUni.transform * vec4<f32>(input.position, 1.0);
  let normal =  oceanUni.transform * vec4<f32>(input.normal, 0.0);

  output.uv = input.uv;
  output.worldPos = worldPos;
  output.normal = normal.xyz;

  let xy = (input.uv * 2.0 - 1.0) * vec2(1.0, -1.0);
  output.fragPos = vec4(xy, 0.0, 1.0);
  return output;
}
`;

// TODO(@darzu): how to ensure there aren't collisions? Probably won't be a problem..
export const UVUNWRAP_MASK = 0x0001;

// TODO(@darzu): it isn't great having two pipelines for this, but I'm not
//    sure of a better way. render attachments need to be the same size
export const unwrapPipeline2 = CY.createRenderPipeline("unwrapPipe2", {
  globals: [],
  shader: () => `
  ${unwrapVert}

  struct FragOut {
    @location(0) worldPos: vec4<f32>,
    @location(1) worldNorm: vec4<f32>,
  }

  @fragment fn fragMain(input: VertexOutput) -> FragOut {
    var output: FragOut;
    output.worldPos = vec4(input.worldPos.xyz, 0.0);
    output.worldNorm = vec4(normalize(input.normal.xyz), 0.0);
    return output;
  }
  `,
  shaderVertexEntry: "vertMain",
  shaderFragmentEntry: "fragMain",
  meshOpt: {
    pool: oceanPoolPtr,
    meshMask: UVUNWRAP_MASK,
    stepMode: "per-mesh-handle",
  },
  cullMode: "none",
  output: [
    {
      ptr: uvToPosTex,
      clear: "once",
      defaultColor: [0.0, 0.0, 0.0, 0.0],
    },
    {
      ptr: uvToNormTex,
      clear: "once",
      defaultColor: [0.0, 0.0, 0.0, 0.0],
    },
  ],
});
export const unwrapPipeline = CY.createRenderPipeline("unwrapPipe", {
  globals: [
    // { ptr: uvToPosTex, access: "write" },
    // { ptr: uvToNormTex, access: "write" },
  ],
  shader: () => `
  ${unwrapVert}

  struct FragOut {
    // @location(0) worldPos: vec4<f32>,
    @location(0) uv: f32,
  }

  @fragment fn fragMain(input: VertexOutput) -> FragOut {
    var output: FragOut;
    // textureStore(uvToPosTex, vec2<i32>(input.uv * vec2<f32>(textureDimensions(uvToPosTex))), 
    //   vec4(input.worldPos.xyz, 0.0));
    // textureStore(uvToNormTex, vec2<i32>(input.uv * vec2<f32>(textureDimensions(uvToNormTex))), 
    //   vec4(normalize(input.normal.xyz), 0.0));
    output.uv = 1.0;
    return output;
  }
  `,
  shaderVertexEntry: "vertMain",
  shaderFragmentEntry: "fragMain",
  meshOpt: {
    pool: oceanPoolPtr,
    meshMask: UVUNWRAP_MASK,
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
