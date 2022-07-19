import { assert } from "../../test.js";
import { fullQuad } from "../gpu-helper.js";
import { CY, CyTexturePtr, getTexFromAttachment } from "../gpu-registry.js";

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

const whiteNoiseSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512] as const;
export const whiteNoiseTexs = whiteNoiseSizes.map((s) =>
  CY.createTexture(`whiteNoise${s}Tex`, {
    size: [s, s],
    format: "r32float",
  })
);

export const whiteNoisePipes = whiteNoiseSizes.map((s, i) => {
  return CY.createRenderPipeline(`whiteNoise${s}Pipe`, {
    globals: [{ ptr: fullQuad, alias: "quad" }],
    output: [whiteNoiseTexs[i]],
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
});

const octaveWhiteNoisePipe = createOctaveWhiteNoisePipe([3, 5, 7], 2);

function createOctaveWhiteNoisePipe(
  frequencies: number[],
  persistence: number
) {
  assert(
    frequencies.every((f) => Number.isInteger(f)),
    "freqs must be int"
  );
  assert(
    frequencies[frequencies.length - 1] <= whiteNoiseSizes.length + 2,
    "freq range"
  );
  assert(Number.isInteger(persistence), "freqs must be int");

  const name = `octaveWhiteNoise_${frequencies.join("_")}by${persistence}`;

  const octaveWhiteNoiseTex = CY.createTexture(name + "Tex", {
    size: [128, 128],
    format: "r32float",
  });

  return CY.createRenderPipeline(name + "Pipe", {
    globals: [
      {
        ptr: fullQuad,
        alias: "quad",
      },
      ...whiteNoiseTexs.map((t) => t),
    ],
    output: [octaveWhiteNoiseTex],
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

        var width = 0.0;
        var res = 0.0;
        // try sampling ?
        ${frequencies
          .map((f) => {
            let s = Math.pow(2, f);
            let p = Math.pow(persistence, f);
            return `
            let s${s} = textureLoad(whiteNoise${s}Tex, vec2<i32>(uv * vec2<f32>(textureDimensions(whiteNoise${s}Tex))), 0).x;
            res += s${s} * 1.0 / ${p}.0;
            width += 1.0 / ${p}.0;
            `;
          })
          .join("\n")}
        
        return res / width;
      }
    `,
  });
}

// TODO(@darzu): IMPL PERLIN
/* https://thebookofshaders.com/11/
  smoothstep on GPU
  float i = floor(x);  // integer
  float f = fract(x);  // fraction
  y = mix(rand(i), rand(i + 1.0), smoothstep(0.,1.,f));
*/

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

export const noisePipes = [...whiteNoisePipes, octaveWhiteNoisePipe];

export const noiseGrid = [
  [whiteNoiseTexs[0], getTexFromAttachment(octaveWhiteNoisePipe.output[0])],
  [whiteNoiseTexs[0], getTexFromAttachment(octaveWhiteNoisePipe.output[0])],
] as const;
