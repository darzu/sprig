import { range } from "../../utils/util.js";
import { CY } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { meshPoolPtr } from "./std-scene.js";

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

// TODO(@darzu): Multiple shadow maps for multiple shadow casters
// TODO(@darzu): Multiple shadow maps for cascading shadow maps
const numShadowMaps = 2;

export const shadowDepthTextures = CY.createDepthTexture(`shadowTex`, {
  size: [2048, 2048],
  format: "depth16unorm",
  count: numShadowMaps,
  // TODO(@darzu): IMPL CSM
});
// const shadowOutTexture = CY.createTexture("shadowOut", {
//   //   size: [1024, 1024],
//   format: "rgba8unorm",
// });

// TODO(@darzu): for better shadows, we should actually use front-face culling, not back-face
export const shadowPipelines = range(numShadowMaps).map((i) =>
  CY.createRenderPipeline(`shadowPipeline${i}`, {
    globals: [pointLightsPtr],
    meshOpt: {
      pool: meshPoolPtr,
      stepMode: "per-mesh-handle",
    },
    output: [],
    depthStencil: { ptr: shadowDepthTextures, idx: i },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    cullMode: "front", // TODO(@darzu): alternative to depth bias?
    // TODO(@darzu): support multiple lights again
    shader: () => `
  @vertex
  fn vert_main(input: VertexInput) -> @builtin(position) vec4<f32> {
    return pointLights.ms[0].viewProj${i} * meshUni.transform * vec4<f32>(input.position, 1.0);
  }

  @fragment fn frag_main() { }
  `,
  })
);
