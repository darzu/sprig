import { CY } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import {
  litTexturePtr,
  mainDepthTex,
  positionsTexturePtr,
  sceneBufPtr,
  surfacesTexturePtr,
  unlitTexturePtr,
  worldNormsAndFresTexPtr,
} from "./std-scene.js";

// TODO(@darzu): generalize for other billboard usage?

export const DotStruct = createCyStruct({
  pos: "vec3<f32>",
  color: "vec3<f32>",
  size: "f32",
});
export type DotTS = CyToTS<typeof DotStruct.desc>;

export let MAX_NUM_DOTS = 1000;

export const dotDataPtr = CY.createArray("dotData", {
  struct: DotStruct,
  init: MAX_NUM_DOTS,
  // forceUsage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
});

export const initDots = CY.createComputePipeline("initDots", {
  globals: [dotDataPtr],
  shaderComputeEntry: "main",
  shader: (shaders) => `
  ${shaders["std-rand"].code}

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
    rand_seed = vec2<f32>(f32(gId.x));
    dotDatas.ms[gId.x].pos = vec3(rand(), rand(), rand()) * 100.0;
    dotDatas.ms[gId.x].color = vec3(rand(), rand(), rand());
    dotDatas.ms[gId.x].size = rand() * 1.0;
  }
  `,
  workgroupCounts: [Math.ceil(MAX_NUM_DOTS / 64), 1, 1],
});

export const renderDots = CY.createRenderPipeline("renderDots", {
  globals: [dotDataPtr, sceneBufPtr],
  // TODO(@darzu): use an "override" var for dotBoxSize once supported
  shader: (shaders) => `
  ${shaders["std-dots"].code}
  `,
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  meshOpt: {
    vertexCount: 6 * MAX_NUM_DOTS,
    stepMode: "single-draw",
  },
  depthStencil: mainDepthTex,
  // output: [litTexturePtr], // no onlines
  output: [
    unlitTexturePtr,
    surfacesTexturePtr,
    worldNormsAndFresTexPtr,
    positionsTexturePtr,
  ],
});
