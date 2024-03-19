import { V2, V3, V4, quat, mat4, V } from "../../matrix/sprig-matrix.js";
import { jitter } from "../../utils/math.js";
import { range } from "../../utils/util.js";
import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CY, CyTexturePtr, linearSamplerPtr } from "../gpu-registry.js";
import { createCyStruct } from "../gpu-struct.js";
import {
  sceneBufPtr,
  litTexturePtr,
  mainDepthTex,
  unlitTexturePtr,
} from "./std-scene.js";

const maxNumParticles = 1500;

const ParticleStruct = createCyStruct({
  pos: "vec3<f32>",
  vel: "vec3<f32>",
  acl: "vec3<f32>",
  color: "vec3<f32>",
  colorVel: "vec3<f32>",
  size: "f32",
  sizeVel: "f32",
  life: "u32",
});

const particleData = CY.createArray("particleData", {
  struct: ParticleStruct,
  init: maxNumParticles,
});

export const pipeDbgInitParticles = CY.createComputePipeline(
  "pipeDbgInitParticles",
  {
    globals: [particleData],
    shaderComputeEntry: "main",
    shader: (shaders) => `
  ${shaders["std-rand"].code}

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
    rand_seed = vec2<f32>(f32(gId.x));
    particleDatas.ms[gId.x].pos = vec3(rand(), rand(), rand()) * 100.0;
    particleDatas.ms[gId.x].color = vec3(rand(), rand(), rand());
    particleDatas.ms[gId.x].size = rand() * 1.0;

    particleDatas.ms[gId.x].vel = vec3(0.0);
    particleDatas.ms[gId.x].acl = vec3(0.0);
    particleDatas.ms[gId.x].colorVel = vec3(0.0);
    particleDatas.ms[gId.x].sizeVel = 0.0;
    particleDatas.ms[gId.x].life = 1000000u;
  }
  `,
    workgroupCounts: [Math.ceil(maxNumParticles / 64), 1, 1],
  }
);

// TODO(@darzu): PERF. Skip the index buffer.
const particleQuadInds = CY.createIdxBuf("particleInd", {
  init: () =>
    new Uint16Array([
      // tri 1
      0, 1, 2,
      // tri 2
      3, 0, 2,
    ]),
});

const particleQuadVert = CY.createArray("particleVert", {
  struct: createCyStruct({
    pos: "vec3<f32>",
  }),
  init: () => [
    { pos: V(-1, -1, 0) },
    { pos: V(1, -1, 0) },
    { pos: V(1, 1, 0) },
    { pos: V(-1, 1, 0) },
  ],
});

// TODO(@darzu): RENAME all pipelines to "pipeRndrParticles" and "pipeCmpParticles"
export const renderParticles = CY.createRenderPipeline("renderParticles", {
  globals: [sceneBufPtr],
  meshOpt: {
    index: particleQuadInds,
    instance: particleData,
    vertex: particleQuadVert,
    stepMode: "per-instance",
  },
  depthStencil: mainDepthTex,
  shader: (shaders) => `
  ${shaders["std-particle-render"].code}
  `,
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
  output: [litTexturePtr],
});

// const particleComputeParams = createCyStruct(
//   {
//     deltaT: "f32",
//     cohesionDistance: "f32",
//     seperationDistance: "f32",
//     alignDistance: "f32",
//     cohesionScale: "f32",
//     seperationScale: "f32",
//     alignScale: "f32",
//     worldSize: "f32",
//     speed: "f32",
//   },
//   {
//     // TODO(@darzu): wish we didn't need to specify this
//     isUniform: true,
//   }
// );
// const boidParams = CY.createSingleton("boidParams", {
//   struct: particleComputeParams,
//   init: () => {
//     return {
//       deltaT: 0.04,
//       cohesionDistance: 1.0,
//       seperationDistance: 0.25,
//       alignDistance: 0.5,
//       cohesionScale: 0.02,
//       seperationScale: 0.2,
//       alignScale: 0.1,
//       worldSize: 10.0,
//       speed: 0.3,
//     };
//   },
// });

// const boidCompDesc: Omit<
//   Parameters<typeof CY.createComputePipeline>[1],
//   "globals"
// > = {
//   shaderComputeEntry: "main",
//   shader: (shaders) =>
//     `var<private> numBoids: u32 = ${maxNumParticles};
// ${shaders["xp-boid-update"].code}`,
//   workgroupCounts: [Math.ceil(maxNumParticles / 64), 1, 1],
// };

// export const boidComp0 = CY.createComputePipeline("boidComp0", {
//   ...boidCompDesc,
//   globals: [
//     boidParams,
//     { ptr: particleData, access: "read", alias: "inBoids" },
//     { ptr: boidData1, access: "write", alias: "outBoids" },
//   ],
// });
// export const boidComp1 = CY.createComputePipeline("boidComp1", {
//   ...boidCompDesc,
//   globals: [
//     boidParams,
//     { ptr: boidData1, access: "read", alias: "inBoids" },
//     { ptr: particleData, access: "write", alias: "outBoids" },
//   ],
// });

// const boidWindow = createCyStruct(
//   {
//     xPos: "vec2<f32>",
//     yPos: "vec2<f32>",
//   },
//   {
//     isUniform: true,
//   }
// );
// const boidWindowUni = CY.createSingleton("boidWindow", {
//   struct: boidWindow,
//   init: () => ({
//     xPos: V2.clone([0, 1]),
//     yPos: V2.clone([0, 1]),
//   }),
// });

// export const { pipeline: boidCanvasMerge } = createRenderTextureToQuad(
//   "boidCanvasMerge",
//   boidDepthTex,
//   litTexturePtr,
//   0.1,
//   0.9,
//   0.1,
//   0.9
// );
