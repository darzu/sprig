import { CY } from "../gpu-registry.js";

const CLOTH_SIZE = 10; // TODO(@darzu):

const clothTexPtrDesc: Parameters<typeof CY.createTexture>[1] = {
  size: [CLOTH_SIZE, CLOTH_SIZE],
  // format: "rgba16float",
  // TODO(@darzu): what's going on with format type
  format: "rgba32float",
  init: () => {
    const clothData = new Float32Array(10 * 10 * 4);
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const i = (y + x * 10) * 3;
        clothData[i + 0] = i / clothData.length;
        clothData[i + 1] = i / clothData.length;
        clothData[i + 2] = i / clothData.length;
      }
    }
    return clothData;
  },
};
const clothTexPtr0 = CY.createTexture("clothTex0", {
  ...clothTexPtrDesc,
});
const clothTexPtr1 = CY.createTexture("clothTex1", {
  ...clothTexPtrDesc,
});

// TODO(@darzu): CLOTH
let clothReadIdx = 1;

export const cmpClothPipelinePtr0 = CY.createComputePipeline("clothComp0", {
  globals: [
    { ptr: clothTexPtr0, access: "read", alias: "inTex" },
    { ptr: clothTexPtr1, access: "write", alias: "outTex" },
  ],
  workgroupCounts: [1, 1, 1],
  shader: "xp-cloth-update",
  shaderComputeEntry: "main",
});
export const cmpClothPipelinePtr1 = CY.createComputePipeline("clothComp1", {
  globals: [
    { ptr: clothTexPtr1, access: "read", alias: "inTex" },
    { ptr: clothTexPtr0, access: "write", alias: "outTex" },
  ],
  workgroupCounts: [1, 1, 1],
  shader: "xp-cloth-update",
  shaderComputeEntry: "main",
});
