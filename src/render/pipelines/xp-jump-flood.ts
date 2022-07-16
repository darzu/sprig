import { range } from "../../util.js";
import { createRenderTextureToQuad, fullQuad } from "../gpu-helper.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

const size = uvPosBorderMask.size[0];

const format: Parameters<typeof CY.createTexture>[1] = {
  size: [size, size],
  format: "rg32float",
};

export const jfaTexs = [
  // uvPosBorderMask,
  // TODO(@darzu): this is a nifty way to clone. Is this always going to work?
  //    maybe we need a deep clone per resource kind?
  CY.createTexture("jfaTex0", format),
  CY.createTexture("jfaTex1", format),
];

export const jfaInputTex = CY.createTexture("jfaTexIn", format);

export const sdfTex = CY.createTexture("sdfTex", {
  size: [size, size],
  // TODO(@darzu): r32
  format: "r32float",
});

// TODO(@darzu): this probably isn't needed any more
export const jfaPreOutlinePipe = createRenderTextureToQuad(
  "jfaPreOutlinePipe",
  uvPosBorderMask,
  jfaInputTex,
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

const maxStep = 6;
const resultIdx = (maxStep + 2) % 2;
export const jfaResultTex = jfaTexs[resultIdx];

export const jfaPipelines = range(maxStep + 1).map((i) => {
  const inIdx = (i + 0) % 2;
  const outIdx = (i + 1) % 2;

  const stepSize = Math.floor(Math.pow(2, maxStep - i));

  const pipeline = CY.createRenderPipeline(`jfaPipe${i}`, {
    globals: [
      { ptr: i === 0 ? jfaInputTex : jfaTexs[inIdx], alias: "inTex" },
      { ptr: fullQuad, alias: "quad" },
    ],
    meshOpt: {
      vertexCount: 6,
      stepMode: "single-draw",
    },
    output: [jfaTexs[outIdx]],
    shader: (shaders) => {
      return `
        const stepSize = ${stepSize};
        ${shaders["std-screen-quad-vert"].code}
        ${shaders["xp-jump-flood"].code}
      `;
    },
    shaderFragmentEntry: "frag_main",
    shaderVertexEntry: "vert_main",
  });

  return pipeline;
});

// TODO(@darzu): this probably isn't needed any more
export const jfaToSdfPipe = createRenderTextureToQuad(
  "jfaToSdf",
  jfaResultTex,
  sdfTex,
  -1,
  1,
  -1,
  1,
  false,
  () => `
    let nearestUV = textureLoad(inTex, xy, 0).xy;
    let dist = length(uv - nearestUV);
    return vec4(dist);
  `
).pipeline;
