import { CY, linearSamplerPtr } from "../gpu-registry.js";
import {
  litTexturePtr,
  worldNormsAndFresTexPtr,
  surfacesTexturePtr,
  mainDepthTex,
  sceneBufPtr,
  unlitTexturePtr,
} from "./std-scene.js";

export const outlinedTexturePtr = CY.createTexture("outlinesTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  // TODO(@darzu): probably only need 1 float 16 per pixel
  format: "rgba8unorm",
  // TODO(@darzu): support anti-aliasing again
});

export const outlineRender = CY.createRenderPipeline("outlineRender", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: unlitTexturePtr, alias: "colorTex" },
    { ptr: worldNormsAndFresTexPtr, alias: "normTex" },
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
  fragOverrides: {
    lineWidth: 1.0,
  },
});
