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
export const pipeParticleRender = CY.createRenderPipeline(
  "pipeParticleRender",
  {
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
  }
);

export const pipeParticleUpdate = CY.createComputePipeline(
  "pipeParticleUpdate",
  {
    shaderComputeEntry: "main",
    shader: (shaders) =>
      `var<private> numParticles: u32 = ${maxNumParticles};
${shaders["std-rand"].code}
${shaders["std-particle-update"].code}
`,
    workgroupCounts: [Math.ceil(maxNumParticles / 64), 1, 1],
    globals: [sceneBufPtr, { ptr: particleData, access: "write" }],
  }
);
