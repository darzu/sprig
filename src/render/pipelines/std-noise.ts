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

const noiseSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512] as const;
export const whiteNoiseTexs = noiseSizes.map((s) =>
  CY.createTexture(`whiteNoise${s}Tex`, {
    size: [s, s],
    format: "r32float",
  })
);

export const whiteNoisePipes = noiseSizes.map((s, i) => {
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

// random vector fields, used for gradient noises
export const vecNoiseTexs = noiseSizes.map((s) =>
  CY.createTexture(`vecNoise${s}Tex`, {
    size: [s, s],
    format: "rg32float",
  })
);
export const vecNoisePipes = noiseSizes.map((s, i) => {
  return CY.createRenderPipeline(`vecNoise${s}Pipe`, {
    globals: [{ ptr: fullQuad, alias: "quad" }],
    output: [vecNoiseTexs[i]],
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
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec2<f32> {
      rand_seed = uv * ${s.toFixed(1)};
      let n = rand() * 3.14159 * 2.0;
      // return vec2(cos(n), 0.0); // * 0.5 + vec2(0.5, 0.5);
      return vec2(cos(n),sin(n)); // * 0.5 + vec2(0.5, 0.5);
      // return vec2(-1.0, -0.0);
    }
  `,
  });
});

const octavesPipe1 = createOctaveNoisePipe([3, 5, 7], 2);
const octavesPipe2 = createOctaveNoisePipe([2, 3, 5, 7, 9], 2.0);
const octavesPipe3 = createOctaveNoisePipe([5], 1);
const octavesPipe4 = createOctaveNoisePipe([1, 2, 3, 4, 5, 6, 7, 8], 1.2);

function createOctaveNoisePipe(frequencies: number[], persistence: number) {
  // TODO(@darzu): make color channel assignments a parameter?
  const smooth = true; // TODO(@darzu): parameter
  const gradNoise = true;
  const texType: `whiteNoise` | `vecNoise` = gradNoise
    ? `vecNoise`
    : "whiteNoise";

  assert(
    frequencies.every((f) => Number.isInteger(f)),
    "freqs must be int"
  );
  assert(
    frequencies[frequencies.length - 1] < noiseSizes.length + 1,
    "freq range"
  );
  // assert(Number.isInteger(persistence), "freqs must be int");

  const name = `octaveNoise_${frequencies.join("_")}by${persistence}`;

  const octaveNoiseTex = CY.createTexture(name + "Tex", {
    size: [128, 128],
    format: "r32float",
  });

  return CY.createRenderPipeline(name + "Pipe", {
    globals: [
      {
        ptr: fullQuad,
        alias: "quad",
      },
      ...(texType === `whiteNoise` ? whiteNoiseTexs : vecNoiseTexs).map(
        (t) => t
      ),
    ],
    output: [octaveNoiseTex],
    meshOpt: {
      stepMode: "single-draw",
      vertexCount: 6,
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    shader: (shaders) => `
    ${shaders["std-screen-quad-vert"].code}

    @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) f32 {
        var width = 0.0;
        var res = 0.0;
        // TODO: try sampling ?
        ${frequencies
          .map((f) => {
            let s = Math.pow(2, f);
            let p = Math.pow(persistence, f);
            return `
            {
              let xyf = uv * vec2<f32>(textureDimensions(${texType}${s}Tex));
              let i = vec2<i32>(xyf);
              let _f = fract(xyf);
              // let _f = vec2(0.5);
              // let f = mix(vec2(0.),vec2(1.),_f);
              let f = smoothstep(vec2(0.),vec2(1.),_f);
              // let f = vec2(smoothstep(0.,1.,_f.x),smoothstep(0.,1.,_f.y));
              // TODO: just use a sampler?
              ${
                smooth
                  ? `
              let _a = textureLoad(${texType}${s}Tex, i + vec2(0,0), 0);
              let _b = textureLoad(${texType}${s}Tex, i + vec2(1,0), 0);
              let _c = textureLoad(${texType}${s}Tex, i + vec2(0,1), 0);
              let _d = textureLoad(${texType}${s}Tex, i + vec2(1,1), 0);
              ${
                texType === "whiteNoise"
                  ? `
              let a = _a.x;
              let b = _b.x;
              let c = _c.x;
              let d = _d.x;
              `
                  : `
              // let _f2 = vec2(-1.0, 0.0);
              // let a = dot(_a.xy, _f2);
              // let b = dot(_b.xy, _f2);
              // let c = dot(_c.xy, _f2);
              // let d = dot(_d.xy, _f2);
              let _f2 = _f * 1.0;
              let a = dot(_a.xy, _f2-vec2(0.0,0.0)) * 0.5 + 0.5;
              let b = dot(_b.xy, _f2-vec2(1.0,0.0)) * 0.5 + 0.5;
              let c = dot(_c.xy, _f2-vec2(0.0,1.0)) * 0.5 + 0.5;
              let d = dot(_d.xy, _f2-vec2(1.0,1.0)) * 0.5 + 0.5;
              `
              }
              // let s = _a.x;
              // return s;
              // let s = a;
              let s = mix(
                  mix(a, b, f.x),
                  mix(c, d, f.x),
                  f.y);
              `
                  : texType === "whiteNoise"
                  ? `
              let s = textureLoad(${texType}${s}Tex, i, 0).x;
              `
                  : `
              let _a = textureLoad(${texType}${s}Tex, i, 0).xy;
              let a = dot(_a.xy, _f) * 0.5 + 0.5;
              let s = a;
              `
              }
              let w = 1.0 / ${p.toFixed(2)};
              // res += s;
              // res += (s * 0.5 + 0.5) * w;
              res += s * w;
              width += w;
            }
            `;
          })
          .join("\n")}

        res = res / width;
        
        return res;
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

export const noisePipes = [
  ...whiteNoisePipes,
  ...vecNoisePipes,
  octavesPipe1,
  octavesPipe2,
  octavesPipe3,
  octavesPipe4,
];

export const noiseGridFrame = [
  // [vecNoiseTexs[3], vecNoiseTexs[7]],
  // [vecNoiseTexs[2], vecNoiseTexs[3]],
  // [vecNoiseTexs[4], vecNoiseTexs[5]],
  // [vecNoiseTexs[6], vecNoiseTexs[7]],
  [
    getTexFromAttachment(octavesPipe1.output[0]),
    getTexFromAttachment(octavesPipe2.output[0]),
  ],
  [
    getTexFromAttachment(octavesPipe3.output[0]),
    getTexFromAttachment(octavesPipe4.output[0]),
  ],
  // [
  //   getTexFromAttachment(octavesPipe2.output[0]),
  //   getTexFromAttachment(octavesPipe1.output[0]),
  // ],
] as const;
