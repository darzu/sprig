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

// TODO(@darzu): this probably isn't needed any more
export const jfaPreOutlinePipe = createRenderTextureToQuad(
  "jfaPreOutlinePipe",
  uvPosBorderMask,
  nearestPosTexs[0],
  -1,
  1,
  -1,
  1,
  false,
  () => `
    let t = textureLoad(inTex, xy + vec2(0,1), 0).x;
    let l = textureLoad(inTex, xy + vec2(-1,0), 0).x;
    let r = textureLoad(inTex, xy + vec2(1,0), 0).x;
    let b = textureLoad(inTex, xy + vec2(0,-1), 0).x;
    if (t == 0.0 || l == 0.0 || r == 0.0 || b == 0.0) {
      return vec4(inPx.xy, 0.0, 1.0);
    } else {
      return vec4(0.0, 0.0, 0.0, 1.0);
    }
  `
).pipeline;

export const jfaPipelines = [0].map((i) => {
  const inIdx = (i + 0) % 2;
  const outIdx = (i + 1) % 2;

  return createRenderTextureToQuad(
    `jfaPipeline${i}`,
    nearestPosTexs[inIdx],
    nearestPosTexs[outIdx],
    -1,
    1,
    -1,
    1,
    false,
    "xp-jump-flood"
  ).pipeline;
});
// export const jfaPipelines = [0].map((i) => {
//   const inIdx = (i + 0) % 2;
//   const outIdx = (i + 1) % 2;

//   return CY.createComputePipeline(`jfaPipeline${i}`, {
//     globals: [
//       { ptr: nearestPosTexs[inIdx], access: "read", alias: "inTex" },
//       { ptr: nearestPosTexs[outIdx], access: "write", alias: "outTex" },
//       // { ptr: sdfTexs[inIdx], access: "read", alias: "inSdfTex" },
//       // { ptr: sdfTexs[outIdx], access: "write", alias: "outSdfTex" },
//       // { ptr: params, alias: "params" },
//     ],
//     shader: "xp-jump-flood",
//     shaderComputeEntry: "main",
//     workgroupCounts: [size / 8, size / 8, 1],
//   });
// });
