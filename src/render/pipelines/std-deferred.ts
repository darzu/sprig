import { comparisonSamplerPtr, CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { outlinedTexturePtr } from "./std-outline.js";
import {
  unlitTexturePtr,
  worldNormsAndFresTexPtr,
  surfacesTexturePtr,
  mainDepthTex,
  sceneBufPtr,
  litTexturePtr,
  positionsTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

export const deferredPipeline = CY.createRenderPipeline("deferredRender", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: outlinedTexturePtr, alias: "colorTex" },
    { ptr: worldNormsAndFresTexPtr, alias: "normTex" },
    { ptr: positionsTexturePtr, alias: "posTex" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
    { ptr: mainDepthTex, alias: "depthTex" },
    { ptr: shadowDepthTextures, alias: "shadowMap" },
    { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
    pointLightsPtr,
    sceneBufPtr,
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [litTexturePtr],
  shader: "std-deferred",
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
