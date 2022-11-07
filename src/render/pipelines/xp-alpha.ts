// import { oceanJfa } from "../../game/ocean.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { ALPHA_MASK } from "../pipeline-masks.js";
import {
  mainDepthTex,
  litTexturePtr,
  meshPoolPtr,
  sceneBufPtr,
} from "./std-scene.js";

export const alphaRenderPipeline = CY.createRenderPipeline("alphaRender", {
  globals: [
    sceneBufPtr,
    { ptr: linearSamplerPtr, alias: "samp" },
    // TODO(@darzu): care about lights and shadows?
  ],
  cullMode: "back",
  // cullMode: "none",
  meshOpt: {
    pool: meshPoolPtr,
    meshMask: ALPHA_MASK,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "never",
      // TODO(@darzu): don't write to depth buffer
      // TODO(@darzu): is this the right blend state?
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
    // TODO(@darzu): write to normals etc?
  ],
  depthStencil: mainDepthTex,
  depthReadonly: true,
  shader: (shaderSet) => `
  ${shaderSet["xp-alpha"].code}
  `,
});
