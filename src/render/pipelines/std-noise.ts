import { fullQuad } from "../gpu-helper.js";
import { CY } from "../gpu-registry.js";

// TODO(@darzu): NOISES!
/*
perlin,
    basic noise
simplex, 
billow, 
    abs(perlin)
ridged, 
    1-abs(perlin)
worley,
analytical derivative based alterations,
    creates realistic erosion
    have features change in relation to different octaves of noise
    knowing the slope at a point helps you distribute features much better (e.g. erosion, rivers)
domain warping,
    feeding noise into itself
    (looks super cool!)

https://www.redblobgames.com/articles/noise/2d/#spectrum
https://simblob.blogspot.com/2009/06/noise-in-game-art.html

higher amplitudes with lower frequencies “red noise”
higher amplitudes with higher frequencies “blue noise”

noise pack:
  https://simon-thommes.com/procedural-noise-pack
*/

export const whiteNoiseTex = CY.createTexture("whiteNoiseTex", {
  size: [128, 128],
  format: "r32float",
});

export const whiteNoisePipe = CY.createRenderPipeline("whiteNoisePipe", {
  globals: [{ ptr: fullQuad, alias: "quad" }],
  output: [whiteNoiseTex],
  meshOpt: {
    stepMode: "single-draw",
    vertexCount: 6,
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  shader: (shaders) => `
  ${shaders["std-rand"].code}
  ${shaders["std-screen-quad-vert"].code}

  @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) f32 {
      rand_seed = uv;
      return rand();
    }
  `,
});

export const perlinNoiseTex = CY.createTexture("perlinNoiseTex", {
  size: [128, 128],
  format: "r32float",
});

export const perlinNoisePipe = CY.createRenderPipeline("perlinNoisePipe", {
  globals: [{ ptr: fullQuad, alias: "quad" }],
  output: [perlinNoiseTex],
  meshOpt: {
    stepMode: "single-draw",
    vertexCount: 6,
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  shader: (shaders) => `
  ${shaders["std-rand"].code}
  ${shaders["std-screen-quad-vert"].code}

  @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) f32 {
      rand_seed = uv;
      return rand();
    }
  `,
});
