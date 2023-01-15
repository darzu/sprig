import { ENDESGA16 } from "../../color/palettes.js";
// import { oceanJfa } from "../../game/ocean.js";
// import { oceanJfa } from "../../game/ocean.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../../sprig-matrix.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { comparisonSamplerPtr, CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import {
  mainDepthTex,
  litTexturePtr,
  meshPoolPtr,
  normalsTexturePtr,
  positionsTexturePtr,
  sceneBufPtr,
  surfacesTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

// TODO:
//  [x] pipeline attachements / outputs
//        use case: two cameras
//  [x] mesh pool handle enable/disable
//  [x] textures and samplers as resources
//  [x] resource ping-ponging for cloth texs and boids
//  [x] shader VertexInput struct auto gen
//  [x] debug view of the depth buffer
//  [x] shadows
//  [x] debug view of any texture
//  [x] dynamic resizing texture based on canvas size
//  [x] split screen
//  [ ] re-enable anti aliasing
//  [x] ECS integration w/ custom gpu data
//  [ ] general usable particle system
//  [x] split *ptr CY.register from webgpu impl
//  [-] webgl impl
//  [x] multiple pipeline outputs
//  [ ] deferred rendering
//  [ ] re-enable line renderer
//  [x] pass in pipelines from game
//  [x] light source: scene rendered with multiple point sources
//      [x] light sailing

export const stdRenderPipeline = CY.createRenderPipeline("triRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    ...shadowDepthTextures.map((tex, i) => ({
      ptr: tex,
      alias: `shadowMap${i}`,
    })),
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    // TODO(@darzu): object-specific SDFs?
    // TODO(@darzu): REMOVE HARD-CODED DEPENDENCY ON OCEAN SDF!
    // { ptr: oceanJfa.sdfTex, alias: "sdf" },
    pointLightsPtr,
    // { ptr: oceanJfa._inputMaskTex, alias: "sdf" },
    // { ptr: oceanJfa._uvMaskTex, alias: "sdf" },
    // TODO(@darzu): support textures
    // { ptr: clothTexPtr0, access: "read", alias: "clothTex" },
  ],
  // TODO(@darzu): hack for ld52
  // cullMode: "back",
  cullMode: "none",
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
      defaultColor: vec4.fromValues(0.015, 0.015, 0.015, 1.0),
      // defaultColor: [...vec3.clone(ENDESGA16.white), 1.0] as vec4,
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
    {
      ptr: normalsTexturePtr,
      clear: "once",
      defaultColor: vec4.clone([0, 0, 0, 0]),
    },
    // {
    //   ptr: positionsTexturePtr,
    //   clear: "once",
    //   defaultColor: [0, 0, 0, 0],
    // },
    {
      ptr: surfacesTexturePtr,
      clear: "once",
      defaultColor: vec4.clone([0, 0, 0, 0]),
    },
  ],
  depthStencil: mainDepthTex,
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-mesh"].code}
  `,
});

export const { pipeline: normalDbg } = createRenderTextureToQuad(
  "normalDbg",
  normalsTexturePtr,
  litTexturePtr,
  0.2,
  0.8,
  0.2,
  0.8
);

export const { pipeline: positionDbg } = createRenderTextureToQuad(
  "positionDbg",
  positionsTexturePtr,
  litTexturePtr,
  0.2,
  0.8,
  -0.8,
  -0.2
);
