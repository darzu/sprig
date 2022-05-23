// TODO(@darzu): based on https://github.com/darzu/sprig/pull/3

import { CY } from "./gpu-registry.js";
import { meshPoolPtr, sceneBufPtr } from "./std-pipeline.js";

// // TODO(@darzu): TODO
// const shadowDepthTextureSize = 1024;
// const shadowDepthTexture = device.createTexture({
//   size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
//   usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
//   format: "depth32float",
// });
// const shadowDepthTextureView = shadowDepthTexture.createView();
// // TODO(@darzu): TODO

const shadowDepthTexture = CY.createDepthTexture("shadowTex", {
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
      return scene.cameraViewProjMatrix * meshUni.transform * vec4<f32>(input.position, 1.0);
  }

  @stage(fragment) fn frag_main() { }
  `,
});

// let shadowVis : f32 = textureSampleCompare(
//   shadowMap, shadowSampler, input.shadowPos.xy, input.shadowPos.z - 0.007);
// let sunLight : f32 = shadowVis * clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
// let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
// // let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
// // let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);

// [[location(2)]] shadowPos : vec3<f32>;

// [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
// [[group(0), binding(2)]] var shadowSampler: sampler_comparison;

// [[location(2)]] shadowPos : vec3<f32>;

// // TODO(@darzu): SHADOW
//  // XY is in (-1, 1) space, Z is in (0, 1) space
//  let posFromLight : vec4<f32> = scene.lightViewProjMatrix * worldPos;
//  // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
//  output.shadowPos = vec3<f32>(
//      posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
//      posFromLight.z
//  );

// // TODO(@darzu): SHADOWS
// {
//   binding: 1,
//   resource: shadowDepthTextureView,
// },

// // TODO(@darzu): SHADOWS
//  // TODO(@darzu): is this BindGrouopLayout redundant?
//  // define the resource bindings for the shadow pipeline
//  const shadowSceneUniBindGroupLayout = device.createBindGroupLayout({
//   entries: [
//     {
//       binding: 0,
//       visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
//       buffer: { type: "uniform" },
//     },
//   ],
// });
// const shadowSceneUniBindGroup = device.createBindGroup({
//   layout: shadowSceneUniBindGroupLayout,
//   entries: [{ binding: 0, resource: { buffer: sceneUniBuffer } }],
// });
// const shadowPipelineDesc: GPURenderPipelineDescriptor = {
//   layout: device.createPipelineLayout({
//     bindGroupLayouts: [
//       shadowSceneUniBindGroupLayout,
//       modelUniBindGroupLayout,
//     ],
//   }),
//   vertex: {
//     module: device.createShaderModule({
//       code: vertexShaderForShadows,
//     }),
//     entryPoint: "main",
//     buffers: [
//       {
//         arrayStride: vertByteSize,
//         attributes: vertexDataFormat,
//       },
//     ],
//   },
//   fragment: {
//     // This should be omitted and we can use a vertex-only pipeline, but it's
//     // not yet implemented.
//     module: device.createShaderModule({
//       code: fragmentShaderForShadows,
//     }),
//     entryPoint: "main",
//     targets: [],
//   },
//   depthStencil: {
//     depthWriteEnabled: true,
//     depthCompare: "less",
//     format: "depth32float",
//   },
//   primitive: primitiveBackcull,
// };
// const shadowPipeline = device.createRenderPipeline(shadowPipelineDesc);

// // TODO(@darzu): figure out shadow bundle?
// const shadowBundleEnc = device.createRenderBundleEncoder({
//   colorFormats: [],
//   depthStencilFormat: "depth32float",
// });
// shadowBundleEnc.setPipeline(shadowPipeline);
// shadowBundleEnc.setBindGroup(0, shadowSceneUniBindGroup);
// shadowBundleEnc.setVertexBuffer(0, verticesBuffer);
// shadowBundleEnc.setIndexBuffer(indicesBuffer, "uint16");
// for (let m of allMeshHandles) {
//   shadowBundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
//   shadowBundleEnc.drawIndexed(
//     m.triCount * 3,
//     undefined,
//     m.indicesNumOffset,
//     m.vertNumOffset
//   );
// }
// let shadowBundle = shadowBundleEnc.finish();

// // fill shadow map texture
//  // TODO(@darzu): SHADOW
//  const shadowRenderPassEncoder = commandEncoder.beginRenderPass({
//   colorAttachments: [],
//   depthStencilAttachment: {
//     view: shadowDepthTextureView,
//     depthLoadValue: 1.0,
//     depthStoreOp: "store",
//     stencilLoadValue: 0,
//     stencilStoreOp: "store",
//   },
// });
// shadowRenderPassEncoder.executeBundles([shadowBundle]);
// shadowRenderPassEncoder.endPass();
