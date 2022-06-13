import { CY, linearSamplerPtr } from "./gpu-registry.js";
import {
  litTexturePtr,
  normalsTexturePtr,
  surfacesTexturePtr,
  mainDepthTex,
  sceneBufPtr,
} from "./std-scene.js";

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
