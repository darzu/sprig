import { CY } from "../gpu-registry.js";
import { GRID_MASK } from "../pipeline-masks.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  unlitTexturePtr,
  mainDepthTex,
} from "./std-scene.js";

// TODO(@darzu): support tri-planar mapping?

export const stdGridRender = CY.createRenderPipeline("stdGridRender", {
  globals: [sceneBufPtr],
  cullMode: "back",
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
    meshMask: GRID_MASK,
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: unlitTexturePtr,
      clear: "never",
    },
  ],
  depthStencil: mainDepthTex,
  shader: "std-grid",
});
