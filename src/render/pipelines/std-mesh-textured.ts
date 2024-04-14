import { V } from "../../matrix/sprig-matrix.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { pointLightsPtr } from "../lights.js";
import { TEXTURED_MASK } from "../pipeline-masks.js";
import { BACKGROUND_COLOR } from "./std-mesh.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  unlitTexturePtr,
  worldNormsAndFresTexPtr,
  positionsTexturePtr,
  surfacesTexturePtr,
  mainDepthTex,
} from "./std-scene.js";
import { emissionTexturePtr } from "./std-stars.js";

// TODO(@darzu): allow multiple textures!
export const meshTexturePtr = CY.createTexture("meshTexture", {
  size: [512, 512],
  format: "r8unorm",
  // format: "r16float",
  // format: "rgba8unorm",
});

export const stdMeshTexturedPipe = CY.createRenderPipeline(
  "stdMeshTexturedRender",
  {
    globals: [
      sceneBufPtr,
      { ptr: linearSamplerPtr, alias: "samp" },
      // TODO(@darzu): object-specific SDFs?
      // TODO(@darzu): REMOVE HARD-CODED DEPENDENCY ON OCEAN SDF!
      // { ptr: oceanJfa.sdfTex, alias: "sdf" },
      pointLightsPtr,
      // { ptr: oceanJfa._inputMaskTex, alias: "sdf" },
      // { ptr: oceanJfa._uvMaskTex, alias: "sdf" },
      // TODO(@darzu): support textures
      // { ptr: clothTexPtr0, access: "read", alias: "clothTex" },
      { ptr: meshTexturePtr, alias: "tex" },
    ],
    // TODO(@darzu): hack for ld52
    cullMode: "back",
    // cullMode: "none",
    meshOpt: {
      pool: meshPoolPtr,
      stepMode: "per-mesh-handle",
      meshMask: TEXTURED_MASK,
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    output: [
      {
        ptr: unlitTexturePtr,
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
        ptr: worldNormsAndFresTexPtr,
        clear: "never",
      },
      {
        ptr: positionsTexturePtr,
        clear: "never",
      },
      // {
      //   ptr: surfacesTexturePtr,
      //   clear: "never",
      // },
      {
        ptr: emissionTexturePtr,
        clear: "once",
      },
    ],
    depthStencil: mainDepthTex,
    // depthCompare: ,
    shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-mesh-textured"].code}
  `,
  }
);
