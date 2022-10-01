import { range } from "../../util.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { pointLightsPtr } from "../lights.js";
import { litTexturePtr, meshPoolPtr, sceneBufPtr } from "./std-scene.js";

// NOTES:
//  https://github.com/darzu/sprig/pull/3
//  https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
// TODO:
//  seperate shadow maps for near and far, fitting them to the view frustum:
//    https://learnopengl.com/Guest-Articles/2021/CSM

// // TODO(@darzu): TODO
// const shadowDepthTextureSize = 1024;
// const shadowDepthTexture = device.createTexture({
//   size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
//   usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
//   format: "depth32float",
// });
// const shadowDepthTextureView = shadowDepthTexture.createView();
// // TODO(@darzu): TODO

export const shadowDepthTextures = range(3).map((i) =>
  CY.createDepthTexture(`shadowTex${i}`, {
    size: [2048, 2048],
    format: "depth16unorm",
  })
);
// const shadowOutTexture = CY.createTexture("shadowOut", {
//   //   size: [1024, 1024],
//   format: "rgba8unorm",
// });

// TODO(@darzu): for better shadows, we should actually use front-face culling, not back-face
export const shadowPipelines = range(3).map((i) =>
  CY.createRenderPipeline(`shadowPipeline${i}`, {
    globals: [pointLightsPtr],
    meshOpt: {
      pool: meshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    output: [],
    depthStencil: shadowDepthTextures[i],
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    cullMode: "front", // TODO(@darzu): alternative to depth bias?
    shader: () => `
  @vertex
  fn vert_main(input: VertexInput) -> @builtin(position) vec4<f32> {
    return pointLights.ms[${i}].viewProj * meshUni.transform * vec4<f32>(input.position, 1.0);
  }

  @fragment fn frag_main() { }
  `,
  })
);
