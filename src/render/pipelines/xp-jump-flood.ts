import { range } from "../../util.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

const size = 64;

export const nearestPosTexs = [
  uvPosBorderMask,
  // TODO(@darzu): this is a nifty way to clone. Is this always going to work?
  //    maybe we need a deep clone per resource kind?
  CY.createTexture(uvPosBorderMask.name + "2", {
    init: () => undefined,
    size: [size, size],
    format: "rgba16float",
  }),
];

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

// export const jfaPipelines = [0].map((i) => {
//   const inIdx = (i + 0) % 2;
//   const outIdx = (i + 1) % 2;

export const jfaPipelines = [
  CY.createComputePipeline(`jfaPipeline0`, {
    globals: [
      { ptr: nearestPosTexs[0], access: "read", alias: "inTex" },
      { ptr: nearestPosTexs[1], access: "write", alias: "outTex" },
    ],
    shader: "xp-jump-flood",
    shaderComputeEntry: "main",
    workgroupCounts: [size, size, 1],
  }),
];
// });
