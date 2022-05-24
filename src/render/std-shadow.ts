// TODO(@darzu): based on https://github.com/darzu/sprig/pull/3

import { createRenderTextureToQuad } from "./gpu-helper.js";
import { CY, linearSamplerPtr } from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { mainTexturePtr, meshPoolPtr, sceneBufPtr } from "./std-scene.js";

// // TODO(@darzu): TODO
// const shadowDepthTextureSize = 1024;
// const shadowDepthTexture = device.createTexture({
//   size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
//   usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
//   format: "depth32float",
// });
// const shadowDepthTextureView = shadowDepthTexture.createView();
// // TODO(@darzu): TODO

export const shadowDepthTexture = CY.createDepthTexture("shadowTex", {
  init: () => undefined,
  size: [1024, 1024],
  format: "depth32float",
});
// const shadowOutTexture = CY.createTexture("shadowOut", {
//   init: () => undefined,
//   size: [1024, 1024],
//   format: "rgba8unorm",
// });

export const shadowPipeline = CY.createRenderPipeline("shadowPipeline", {
  globals: [sceneBufPtr],
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  output: [],
  depthStencil: shadowDepthTexture,
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  shader: () => `
  @stage(vertex)
  fn vert_main(input: VertexInput) -> @builtin(position) vec4<f32> {
      return scene.lightViewProjMatrix * meshUni.transform * vec4<f32>(input.position, 1.0);
  }

  @stage(fragment) fn frag_main() { }
  `,
});

const windowUni = CY.createSingleton("sWinUni", {
  struct: createCyStruct(
    {
      xPos: "vec2<f32>",
      yPos: "vec2<f32>",
    },
    {
      isUniform: true,
    }
  ),
  init: () => ({
    xPos: [-0.9, -0.1],
    yPos: [0.1, 0.9],
  }),
});

export const { pipeline: shadowDbgDisplay } = createRenderTextureToQuad(
  "shadowDbg",
  shadowDepthTexture,
  -0.9,
  -0.1,
  0.1,
  0.9
);
