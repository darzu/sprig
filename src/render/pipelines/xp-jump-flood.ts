import { range } from "../../util.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

const size = uvPosBorderMask.size[0];

export const nearestPosTexs = [
  CY.createTexture("jfaPipe0", {
    init: () => undefined,
    size: [size, size],
    format: "rgba16float",
  }),
  CY.createTexture("jfaPipe1", {
    init: () => undefined,
    size: [size, size],
    format: "rgba16float",
  }),
];

export const jfaPipelines = [
  CY.createComputePipeline(`jfaPipeline0`, {
    globals: [
      { ptr: uvPosBorderMask, access: "read", alias: "inTex" },
      { ptr: nearestPosTexs[0], access: "write", alias: "outTex" },
    ],
    shader: "xp-jump-flood",
    shaderComputeEntry: "main_bug",
    workgroupCounts: [size, size, 1],
  }),
  CY.createComputePipeline(`jfaPipeline1`, {
    globals: [
      { ptr: uvPosBorderMask, access: "read", alias: "inTex" },
      { ptr: nearestPosTexs[1], access: "write", alias: "outTex" },
    ],
    shader: "xp-jump-flood",
    shaderComputeEntry: "main_nobug",
    workgroupCounts: [size, size, 1],
  }),
];
// });
