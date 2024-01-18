import { V } from "../../matrix/sprig-matrix.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { BUBBLE_MASK } from "../pipeline-masks.js";
import { perlinNoiseTex, whiteNoiseTexs } from "./std-noise.js";
import { outlinedTexturePtr } from "./std-outline.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  litTexturePtr,
  mainDepthTex,
  unlitTexturePtr,
} from "./std-scene.js";
import { emissionTexturePtr } from "./std-stars.js";

export const bubblePipeline = CY.createRenderPipeline("bubblePipeline", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: whiteNoiseTexs[7], alias: "noiseTex" },
  ],
  cullMode: "none",
  meshOpt: {
    // TODO(@darzu): PERF. We should probably just use single-draw or something simple
    pool: meshPoolPtr,
    meshMask: BUBBLE_MASK,
    stepMode: "per-mesh-handle",
  },
  // shaderVertexEntry: "vert_main",
  // shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: unlitTexturePtr,
      // TODO(@darzu): clear never? since we should be writting to the whole tex?
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
    {
      ptr: emissionTexturePtr,
      // TODO(@darzu): clear never? since we should be writting to the whole tex?
      clear: "once",
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
  depthReadonly: true,
  depthStencil: mainDepthTex,
  shader: (shaderSet) => {
    // console.log(shaderSet["xp-bubble"].code);
    return `
  ${shaderSet["std-rand"].code}
  ${shaderSet["xp-bubble"].code}
`;
  },
});
