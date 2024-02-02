import { never } from "../../utils/util-no-import.js";
import { range } from "../../utils/util.js";
import { createRenderTextureToQuad, fullQuad } from "../gpu-helper.js";
import { CY, CyPipelinePtr, CyTexturePtr } from "../gpu-registry.js";
import { ShaderSet } from "../shader-loader.js";

// TODO(@darzu): support a sign bit for dist on the mask
//    I think we'll need this for text -> SDF

export interface JfaResult {
  voronoiTex: CyTexturePtr;
  sdfTex: CyTexturePtr;
  extractUvMaskPipe: CyPipelinePtr;
  jfaPipes: CyPipelinePtr[];
  extractSdfPipe: CyPipelinePtr;
  allPipes: () => CyPipelinePtr[];

  // internal
  _inputMaskTex: CyTexturePtr;
  _uvMaskTex: CyTexturePtr;
  _voronoiTexs: CyTexturePtr[];
  _resultIdx: number;
  _debugGrid: CyTexturePtr[][];
}

let nextId = 1; // TODO(@darzu): hack so we don't need to name everything

export function createJfaPipelines(
  maskTex: CyTexturePtr,
  maskMode: "interior" | "border" | "exterior"
): JfaResult {
  let size = 512;

  const voronoiTexFmt: Parameters<typeof CY.createTexture>[1] = {
    size: [size, size],
    format: "rg16float",
  };

  const namePrefix = `jfa${nextId++}`;

  const voronoiTexs = [
    // uvPosBorderMask,
    // TODO(@darzu): this is a nifty way to clone. Is this always going to work?
    //    maybe we need a deep clone per resource kind?
    CY.createTexture(namePrefix + "JfaTex0", voronoiTexFmt),
    CY.createTexture(namePrefix + "JfaTex1", voronoiTexFmt),
  ];

  const uvMaskTex = CY.createTexture(namePrefix + "UvTex", voronoiTexFmt);

  let extractUvMaskShader: () => string;
  if (maskMode === "border") {
    extractUvMaskShader = () => `
      // let s = textureSample(inTex, mySampler, uv).x;
      // if (s < 1.0) {
      //   return uv;
      // }
      let uvDx = 1.0 / dimsF.x;
      let uvDy = 1.0 / dimsF.y;
      let c = textureLoad(inTex, xy + vec2(0,0), 0).xyz;
      let t = textureLoad(inTex, xy + vec2(0,1), 0).xyz;
      let l = textureLoad(inTex, xy + vec2(-1,0), 0).xyz;
      let r = textureLoad(inTex, xy + vec2(1,0), 0).xyz;
      let b = textureLoad(inTex, xy + vec2(0,-1), 0).xyz;
      if (dot(c, c) != 0.0
       && (uv.x - uvDx < 0.0 || uv.x + uvDx > 1.0 || uv.y - uvDy < 0.0 || uv.y + uvDy > 1.0 
          || dot(t, t) == 0.0 || dot(l, l) == 0.0 || dot(r, r) == 0.0 || dot(b, b) == 0.0)) {
        return uv;
      }
      return vec2(0.0);
    `;
  } else if (maskMode === "interior") {
    extractUvMaskShader = () => `
    let c = textureLoad(inTex, xy, 0).xyz;
    if (dot(c,c) != 0.0) {
      return uv;
    } else {
      return vec2(0.0);
    }
  `;
  } else if (maskMode === "exterior") {
    extractUvMaskShader = () => `
    let c = textureLoad(inTex, xy, 0).xyz;
    if (dot(c,c) == 0.0) {
      return uv;
    } else {
      return vec2(0.0);
    }
  `;
  } else {
    never(maskMode);
  }

  const extractUvMaskPipe = createRenderTextureToQuad(
    namePrefix + "UvMaskPipe",
    maskTex,
    uvMaskTex,
    -1,
    1,
    -1,
    1,
    false,
    // TODO(@darzu): output max distance?
    extractUvMaskShader
  ).pipeline;

  // TODO(@darzu): configurable SDF size?
  const sdfTex = CY.createTexture(namePrefix + "SdfTex", {
    // size: [size, size],
    size: [256, 256],
    format: "r8unorm",
    // format: "r16float",
  });

  const maxStep = Math.ceil(Math.log2(size / 2));
  const resultIdx = (maxStep + 1) % 2;

  // console.log(`resultIdx: ${resultIdx}`);
  // console.log(`maxStep: ${maxStep}`);
  const voronoiResultTex = voronoiTexs[resultIdx];

  // TODO(@darzu): instead of having many distinct pipelines, we should
  //  be able to just swap the input/output textures
  const jfaPipes = range(maxStep + 1).map((i) => {
    const inIdx = (i + 0) % 2;
    const outIdx = (i + 1) % 2;
    // console.log(`outIdx: ${outIdx}`);

    const stepSize = Math.floor(Math.pow(2, maxStep - i));

    const pipeline = CY.createRenderPipeline(`${namePrefix}Pipe${i}`, {
      globals: [
        { ptr: i === 0 ? uvMaskTex : voronoiTexs[inIdx], alias: "inTex" },
        { ptr: fullQuad, alias: "quad" },
      ],
      meshOpt: {
        vertexCount: 6,
        stepMode: "single-draw",
      },
      output: [voronoiTexs[outIdx]],
      shader: (shaders) => {
        return `
        const stepSize = ${stepSize};
        ${shaders["std-screen-quad-vert"].code}
        ${shaders["std-jump-flood"].code}
      `;
      },
      shaderFragmentEntry: "frag_main",
      shaderVertexEntry: "vert_main",
    });

    return pipeline;
  });

  const extractSdfPipe = createRenderTextureToQuad(
    namePrefix + "JfaToSdf",
    voronoiResultTex,
    sdfTex,
    -1,
    1,
    -1,
    1,
    false,
    // TODO(@darzu): output max distance?
    () => `
      let nearestUV = textureLoad(inTex, xy, 0).xy;
      let dist = length(uv - nearestUV)
         * 4.0; // TODO: make configurable
      return dist;
    `
  ).pipeline;

  return {
    extractSdfPipe,
    extractUvMaskPipe,
    jfaPipes,
    sdfTex,
    voronoiTex: voronoiResultTex,
    allPipes: () => [extractUvMaskPipe, ...jfaPipes, extractSdfPipe],
    // interal
    _inputMaskTex: maskTex,
    _resultIdx: resultIdx,
    _uvMaskTex: uvMaskTex,
    _voronoiTexs: voronoiTexs,
    _debugGrid: [
      [maskTex, uvMaskTex],
      [voronoiResultTex, sdfTex],
    ],
  };
}

// TODO(@darzu): voronoi gen
/*
() => `
rand_seed = uv;
if (rand() < 0.003) {
  return uv;
} else {
  return vec2(0.0, 0.0);
}
`,
*/

// TODO(@darzu): interactive
/*
  export const VISUALIZE_JFA = true;
  const resultIdx = VISUALIZE_JFA ? 0 : (maxStep + 1) % 2;

  const copy1to0 = createRenderTextureToQuad(
    "jfaCopy",
    voronoiTexs[1],
    voronoiTexs[0],
    -1,
    1,
    -1,
    1,
    false,
    () => `
return inPx.xy;
`
  ).pipeline;
*/

// TODO(@darzu): SDF range normalization / output max distance
// export const sdfBrightTex = CY.createTexture("sdfBrightTex", {
//   size: [size, size],
//   format: "r32float",
// });

// TODO(@darzu): SDF -> rings
/*
  export const ringsTex = CY.createTexture("ringsTex", {
    size: [size, size],
    // TODO(@darzu): r32
    format: "rgba32float",
  });
  export const sdfToRingsPipe = createRenderTextureToQuad(
    "sdfToRings",
    sdfTex,
    ringsTex,
    -1,
    1,
    -1,
    1,
    false,
    () => `
  // let r = (inPx.x * 5.0) % 1.0;
  let r = inPx;
  if (0.1 < r && r < 0.2) {
    return vec4(1.0);
  }
  return vec4(0.0);
  `
  ).pipeline;
*/
