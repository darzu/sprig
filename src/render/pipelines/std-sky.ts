import { V } from "../../matrix/sprig-matrix.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { SKY_MASK } from "../pipeline-masks.js";
import { outlinedTexturePtr } from "./std-outline.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  litTexturePtr,
  mainDepthTex,
  unlitTexturePtr,
} from "./std-scene.js";

export const skyPipeline = CY.createRenderPipeline("skyPipeline", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    pointLightsPtr,
  ],
  cullMode: "none",
  meshOpt: {
    // TODO(@darzu): PERF. We should probably just use single-draw or something simple
    pool: meshPoolPtr,
    meshMask: SKY_MASK,
    stepMode: "per-mesh-handle",
  },
  // shaderVertexEntry: "vert_main",
  // shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      // TODO(@darzu): clear never? since we should be writting to the whole tex?
      clear: "never",
      // defaultColor: V(0.015, 0.015, 0.015, 1.0),
    },
  ],
  depthReadonly: true,
  depthStencil: mainDepthTex,
  depthCompare: "less-equal",
  shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-sky"].code}
  `,
});
