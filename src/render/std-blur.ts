import { range } from "../util.js";
import { CY, linearSamplerPtr } from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";

// TODO(@darzu): we shouldn't use rgba16float everywhere, probably way too much
//  memory usage

const BLUR_ITERATIONS = 2;

const blurTextures = [0, 1].map((i) =>
  CY.createTexture(`blurTex${i}`, {
    size: [100, 100],
    onCanvasResize: (w, h) => [w, h],
    format: "rgba16float",
    init: () => undefined,
  })
);

// TODO(@darzu): this should be parameterized
const blurInputTex = outlinedTexturePtr;
export const blurOutputTex = blurTextures[1];

const blurParamsStruct = createCyStruct({
  isVertical: "u32",
});
const blurHorizParams = CY.createSingleton("blurHorizParams", {
  struct: blurParamsStruct,
  init: () => ({
    isVertical: 0,
  }),
});
const blurVertiParams = CY.createSingleton("blurVertiParams", {
  struct: blurParamsStruct,
  init: () => ({
    isVertical: 1,
  }),
});

export const blurPipelines = range(BLUR_ITERATIONS * 2).map((i) => {
  const inTex = i === 0 ? blurInputTex : blurTextures[(i + 1) % 2];
  const outTex = blurTextures[i % 2];
  const params = i % 2 === 0 ? blurHorizParams : blurVertiParams;
  // TODO(@darzu): we shouldn't need to create new pipelines since the
  //  shape isn't changing, just the parameters. We need some sort of
  //  parameterized pipeline thing.
  return CY.createComputePipeline(`blurPipe${i}`, {
    globals: [
      { ptr: linearSamplerPtr, alias: "samp" },
      { ptr: inTex, alias: "inTex" },
      { ptr: outTex, alias: "outTex" },
      { ptr: params, alias: "params" },
    ],
    shader: "std-blur",
    shaderComputeEntry: "main",
    workgroupCounts: [1, 1, 1],
  });
});
