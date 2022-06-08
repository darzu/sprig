import { createRenderTextureToQuad } from "./gpu-helper.js";
import { comparisonSamplerPtr, CY, linearSamplerPtr } from "./gpu-registry.js";
import {
  mainDepthTex,
  canvasTexturePtr,
  litTexturePtr,
  meshPoolPtr,
  normalsTexturePtr,
  positionsTexturePtr,
  sceneBufPtr,
  surfacesTexturePtr,
} from "./std-scene.js";
import { shadowDepthTexture } from "./std-shadow.js";

// TODO:
//  [x] pipeline attachements / outputs
//        use case: two cameras
//  [x] mesh pool handle enable/disable
//  [x] textures and samplers as resources
//  [x] resource ping-ponging for cloth texs and boids
//  [x] shader VertexInput struct auto gen
//  [x] debug view of the depth buffer
//  [ ] shadows
//  [x] debug view of any texture
//  [x] dynamic resizing texture based on canvas size
//  [x] split screen
//  [ ] re-enable anti aliasing
//  [x] ECS integration w/ custom gpu data
//  [ ] general usable particle system
//  [x] split *ptr CY.register from webgpu impl
//  [ ] webgl impl
//  [ ] multiple pipeline outputs
//  [ ] deferred rendering
//  [ ] re-enable line renderer
//  [x] pass in pipelines from game
//  [ ] light source: scene rendered with multiple point sources
//      - light sailing
//

export const stdRenderPipeline = CY.createRenderPipeline("triRender", {
  globals: [
    sceneBufPtr,
    { ptr: shadowDepthTexture, alias: "shadowMap" },
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    // TODO(@darzu): support textures
    // { ptr: clothTexPtr0, access: "read", alias: "clothTex" },
  ],
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "once",
      // defaultColor: [0.0, 0.0, 0.0, 1.0],
      // defaultColor: [0.1, 0.1, 0.1, 1.0],
      // defaultColor: [0.15, 0.15, 0.6, 1.0],
      defaultColor: [0.015, 0.015, 0.015, 1.0],
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
    {
      ptr: normalsTexturePtr,
      clear: "once",
      defaultColor: [0, 0, 0, 0],
    },
    // {
    //   ptr: positionsTexturePtr,
    //   clear: "once",
    //   defaultColor: [0, 0, 0, 0],
    // },
    {
      ptr: surfacesTexturePtr,
      clear: "once",
      defaultColor: [0, 0, 0, 0],
    },
  ],
  depthStencil: mainDepthTex,
  shader: "std-shader",
});

export const { pipeline: normalDbg } = createRenderTextureToQuad(
  "normalDbg",
  normalsTexturePtr,
  0.2,
  0.8,
  0.2,
  0.8
);

export const { pipeline: positionDbg } = createRenderTextureToQuad(
  "positionDbg",
  positionsTexturePtr,
  0.2,
  0.8,
  -0.8,
  -0.2
);

// TODO(@darzu): rg32uint "uint"
// rg16uint "uint"

// TODO(@darzu): rewrite post processing with compute shader?
//  https://computergraphics.stackexchange.com/questions/54/when-is-a-compute-shader-more-efficient-than-a-pixel-shader-for-image-filtering
//  result: yes, probably it is a good idea.

export const outlinedTexturePtr = CY.createTexture("outlinesTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  // TODO(@darzu): probably only need 1 float 16 per pixel
  format: "rgba16float",
  init: () => undefined,
  // TODO(@darzu): support anti-aliasing again
});

export const outlineRender = CY.createRenderPipeline("outlineRender", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: litTexturePtr, alias: "colorTex" },
    { ptr: normalsTexturePtr, alias: "normTex" },
    // { ptr: positionsTexturePtr, alias: "posTex" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
    { ptr: mainDepthTex, alias: "depthTex" },
    sceneBufPtr,
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [outlinedTexturePtr],
  shader: "std-outline",
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});

export const postProcess = CY.createRenderPipeline("postProcess", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: outlinedTexturePtr, alias: "colorTex" },
    sceneBufPtr,
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [canvasTexturePtr],
  shader: "std-post",
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
