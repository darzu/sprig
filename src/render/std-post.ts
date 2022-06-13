import { CY, linearSamplerPtr } from "./gpu-registry.js";
import { blurOutputTex } from "./std-blur.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { sceneBufPtr, canvasTexturePtr, mainDepthTex } from "./std-scene.js";

// TODO(@darzu): rg32uint "uint"
// rg16uint "uint"

// TODO(@darzu): rewrite post processing with compute shader?
//  https://computergraphics.stackexchange.com/questions/54/when-is-a-compute-shader-more-efficient-than-a-pixel-shader-for-image-filtering
//  result: yes, probably it is a good idea.

export const postProcess = CY.createRenderPipeline("postProcess", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    // TODO(@darzu): merge blur texture and color tex
    { ptr: blurOutputTex, alias: "bloomTex" },
    { ptr: outlinedTexturePtr, alias: "colorTex" },
    { ptr: mainDepthTex, alias: "depthTex" },
    // { ptr: outlinedTexturePtr, alias: "colorTex" },
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
