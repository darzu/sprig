import { CY } from "../render/gpu-registry.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";

export const JFA_SIZE = 512 * 4; // TODO(@darzu): RENAME!!

export const jfaMaskTex = CY.createTexture("summonMaskTex", {
  size: [JFA_SIZE, JFA_SIZE],
  // format: "r8unorm",
  format: "bgra8unorm",
});
console.log("summonMaskTex.size:" + jfaMaskTex.size[0]);

export const summonJfa = createJfaPipelines({
  name: "summonJfa",
  maskTex: jfaMaskTex,
  maskMode: "interior",
  sdfDistFact: 50.0,
  // maxDist: 32,
  maxDist: 512,
  size: JFA_SIZE,
});
