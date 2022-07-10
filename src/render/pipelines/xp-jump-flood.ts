import { range } from "../../util.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

const size = 64;

export const nearestPosTex = CY.createTexture(`nearestPosTex`, {
  size: [size, size],
  format: "rgba16float",
  init: () => undefined,
});
export const sdfTex = CY.createTexture(`sdfTex`, {
  size: [size, size],
  format: "rgba16float",
  init: () => undefined,
});

// const blurParamsStruct = createCyStruct(
//   {
//     isVertical: "u32",
//   },
//   {
//     // TODO(@darzu): pretty annoying we have to specify this here
//     isUniform: true,
//   }
// );
// const blurHorizParams = CY.createSingleton("blurHorizParams", {
//   struct: blurParamsStruct,
//   init: () => ({
//     isVertical: 0,
//   }),
// });
// const blurVertiParams = CY.createSingleton("blurVertiParams", {
//   struct: blurParamsStruct,
//   init: () => ({
//     isVertical: 1,
//   }),
// });

export const jfaPipeline = CY.createComputePipeline(`jfaPipeline`, {
  globals: [
    { ptr: uvPosBorderMask, alias: "inTex" },
    { ptr: nearestPosTex, access: "write", alias: "posTex" },
    { ptr: sdfTex, access: "write", alias: "sdfTex" },
    // { ptr: params, alias: "params" },
  ],
  shader: "xp-jump-flood",
  shaderComputeEntry: "main",
  workgroupCounts: [size / 8, size / 8, 1],
});
