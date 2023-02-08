import { comparisonSamplerPtr, CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { outlinedTexturePtr } from "./std-outline.js";
import {
  unlitTexturePtr,
  normalsTexturePtr,
  surfacesTexturePtr,
  mainDepthTex,
  sceneBufPtr,
  litTexturePtr,
} from "./std-scene.js";
import { shadowDepthTextures } from "./std-shadow.js";

export const deferredPipeline = CY.createRenderPipeline("deferredRender", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: unlitTexturePtr, alias: "colorTex" },
    { ptr: normalsTexturePtr, alias: "normTex" },
    // { ptr: positionsTexturePtr, alias: "posTex" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
    { ptr: mainDepthTex, alias: "depthTex" },
    ...shadowDepthTextures.map((tex, i) => ({
      ptr: tex,
      alias: `shadowMap${i}`,
    })),
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
