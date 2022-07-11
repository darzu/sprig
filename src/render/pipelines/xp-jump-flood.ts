import { range } from "../../util.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

export const nearestPosTexs = [
  // uvPosBorderMask,
  // TODO(@darzu): this is a nifty way to clone. Is this always going to work?
  //    maybe we need a deep clone per resource kind?
  CY.createTexture(uvPosBorderMask.name + "0", uvPosBorderMask),
  CY.createTexture(uvPosBorderMask.name + "1", uvPosBorderMask),
];

const size = uvPosBorderMask.size[0];
// export const sdfTexs = [0, 1].map((i) =>
//   CY.createTexture(`sdfTex${i}`, {
//     size: [size, size],
//     format: "rgba16float",
//     init: () => undefined,
//   })
// );

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

export const jfaCopyIn = createRenderTextureToQuad(
  "jfaCopyInPipe",
  uvPosBorderMask,
  nearestPosTexs[0]
  // -1,
  // 1,
  // -1,
  // 1,
  // false
).pipeline;

export const jfaPipelines = [0].map((i) => {
  const inIdx = (i + 0) % 2;
  const outIdx = (i + 1) % 2;

  return CY.createComputePipeline(`jfaPipeline${i}`, {
    globals: [
      { ptr: nearestPosTexs[inIdx], access: "read", alias: "inTex" },
      { ptr: nearestPosTexs[outIdx], access: "write", alias: "outTex" },
      // { ptr: sdfTexs[inIdx], access: "read", alias: "inSdfTex" },
      // { ptr: sdfTexs[outIdx], access: "write", alias: "outSdfTex" },
      // { ptr: params, alias: "params" },
    ],
    shader: "xp-jump-flood",
    shaderComputeEntry: "main",
    workgroupCounts: [size / 8, size / 8, 1],
  });
});
