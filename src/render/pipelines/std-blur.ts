import { range } from "../../util.js";
import { CY, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { emissionTexturePtr } from "./xp-stars.js";

// TODO(@darzu): we shouldn't use rgba16float everywhere, probably way too much
//  memory usage

// TODO(@darzu): PERF: this blur technique is actually quite expensive. At this
//  point in the code, iteractions > 5 start causing FPS to drop below 60 on my M1
//  And we have a lot more we want to do with our GPU time budgets.
//  A better way might be mip-mapping or just downscaling then upsampling:
//    https://www.gamasutra.com/view/feature/3102/four_tricks_for_fast_blurring_in_.php?print=1

const BLUR_ITERATIONS = 2;

const blurTextures = [0, 1].map((i) =>
  CY.createTexture(`blurTex${i}`, {
    size: [100, 100],
    onCanvasResize: (w, h) => [w, h],
    format: "rgba16float",
  })
);

// TODO(@darzu): this should be parameterized
const blurInputTex = emissionTexturePtr;
// const blurInputTex = outlinedTexturePtr;
export const blurOutputTex = blurTextures[1];

const blurParamsStruct = createCyStruct(
  {
    isVertical: "u32",
  },
  {
    // TODO(@darzu): pretty annoying we have to specify this here
    isUniform: true,
  }
);
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
  const horizontal = i % 2 === 0;
  const params = horizontal ? blurHorizParams : blurVertiParams;

  // TODO(@darzu):
  let tileDim = 128;
  let filterDim = 15;
  let blockDim = tileDim - (filterDim - 1);

  // TODO(@darzu): we shouldn't need to create new pipelines since the
  //  shape isn't changing, just the parameters. We need some sort of
  //  parameterized pipeline thing.
  return CY.createComputePipeline(`blurPipe${i}`, {
    globals: [
      { ptr: linearSamplerPtr, alias: "samp" },
      { ptr: inTex, alias: "inTex" },
      { ptr: outTex, access: "write", alias: "outTex" },
      { ptr: params, alias: "params" },
    ],
    shader: "std-blur",
    shaderComputeEntry: "main",
    // workgroupCounts: [1, 1, 1],
    // TODO(@darzu): this isn't true to original yet, got to flip/flop w/h
    workgroupCounts: ([w, h]) => {
      if (horizontal) return [Math.ceil(w / blockDim), Math.ceil(h / 4), 1];
      else return [Math.ceil(h / blockDim), Math.ceil(w / 4), 1];
    },
    // workgroupCounts: [
    //   // TODO(@darzu): HACK. need sizes based on
    //   // TODO(@darzu): dynamic sizes?
    //   Math.ceil(800 / blockDim),
    //   Math.ceil(800 / 4),
    //   1,
    // ],
  });
});
