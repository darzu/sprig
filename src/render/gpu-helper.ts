import {
  CY,
  CyDepthTexturePtr,
  CyRenderPipelinePtr,
  CySingletonPtr,
  CyTexturePtr,
  linearSamplerPtr,
} from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { litTexturePtr } from "./pipelines/std-scene.js";

export const QuadStruct = createCyStruct(
  {
    minX: "f32",
    maxX: "f32",
    minY: "f32",
    maxY: "f32",
  },
  {
    isUniform: true,
  }
);

export function createRenderTextureToQuad(
  name: string,
  inTex: CyTexturePtr | CyDepthTexturePtr,
  outTex: CyTexturePtr,
  minX = -1,
  maxX = 1,
  minY = -1,
  maxY = 1,
  fragShader?: string
): {
  pipeline: CyRenderPipelinePtr;
  quad: CySingletonPtr<typeof QuadStruct.desc>;
} {
  const quad = CY.createSingleton(`${name}Quad`, {
    struct: QuadStruct,
    init: () => ({
      minX,
      maxX,
      minY,
      maxY,
    }),
  });
  const pipeline = CY.createRenderPipeline(name, {
    globals: [
      { ptr: linearSamplerPtr, alias: "mySampler" },
      // TODO(@darzu): WTF typescript?!
      inTex.kind === "texture"
        ? { ptr: inTex, alias: "myTexture" }
        : { ptr: inTex, alias: "myTexture" },
      { ptr: quad, alias: "quad" },
    ],
    meshOpt: {
      vertexCount: 6,
      stepMode: "single-draw",
    },
    output: [outTex],
    shader: () => {
      return `
  struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) fragUV : vec2<f32>,
  };

  @stage(vertex)
  fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
      vec2<f32>(quad.minX, quad.minY),
      vec2<f32>(quad.maxX, quad.minY),
      vec2<f32>(quad.maxX, quad.maxY),
      vec2<f32>(quad.minX, quad.maxY),
      vec2<f32>(quad.minX, quad.minY),
      vec2<f32>(quad.maxX, quad.maxY),
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
    output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    output.fragUV = uv[VertexIndex];
    return output;
  }

  ${
    fragShader ??
    `@stage(fragment)
  fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
    return vec4(textureSample(myTexture, mySampler, fragUV));
  }`
  }
    `;
    },
    shaderFragmentEntry: "frag_main",
    shaderVertexEntry: "vert_main",
  });

  return { pipeline, quad };
}
