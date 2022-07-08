import { range } from "../../util.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvToPosTex } from "./xp-uv-unwrap.js";

export const sdfTex = CY.createTexture(`sdfTex`, {
  size: [128, 128],
  format: "rgba16float",
  init: () => undefined,
});

const jfaInputTex = uvToPosTex;

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
    { ptr: jfaInputTex, alias: "inTex" },
    { ptr: sdfTex, access: "write", alias: "outTex" },
    // { ptr: params, alias: "params" },
  ],
  shader: "xp-jfa",
  shaderComputeEntry: "main",
  workgroupCounts: [128 / 8, 128 / 8, 1],
});
