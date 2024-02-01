import { CY } from "../gpu-registry.js";
import { GRID_MASK, LINE_MASK } from "../pipeline-masks.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  unlitTexturePtr,
  mainDepthTex,
  litTexturePtr,
} from "./std-scene.js";

export const stdLinesRender = CY.createRenderPipeline("stdLinesRender", {
  globals: [sceneBufPtr],
  cullMode: "back",
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
    meshMask: LINE_MASK,
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
      blend: {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add",
        },
        alpha: {
          srcFactor: "constant",
          dstFactor: "zero",
          operation: "add",
        },
      },
    },
  ],
  depthStencil: mainDepthTex,
  shader: "std-line",
});
