import { CY } from "../gpu-registry.js";
import { createCyStruct, CyToTS } from "../gpu-struct.js";
import { outlinedTexturePtr } from "./std-outline.js";
import { litTexturePtr, mainDepthTex, sceneBufPtr } from "./std-scene.js";

// TODO(@darzu): generalize for other billboard usage?

const StarStruct = createCyStruct({
  pos: "vec3<f32>",
  color: "vec3<f32>",
  size: "f32",
});
type StarTS = CyToTS<typeof StarStruct.desc>;

let NUM_STARS = 1000;
// let NUM_STARS = 100000

const starData = CY.createArray("starData", {
  struct: StarStruct,
  init: NUM_STARS,
  // forceUsage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
});

export const emissionTexturePtr = CY.createTexture("emissionTexture", {
  size: [100, 100],
  onCanvasResize: (w, h) => [w, h],
  format: "rgba16float",
});

const STAR_BOX_SIZE = 200.0;
// const STAR_BOX_SIZE = 1000.0;

export const initStars = CY.createComputePipeline("initStars", {
  globals: [starData],
  shaderComputeEntry: "main",
  shader: (shaders) => `
  ${shaders["std-rand"].code}

  @compute @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
    rand_seed = vec2<f32>(f32(gId.x));
    // starDatas.ms[gId.x].pos = vec3(0.0);
    starDatas.ms[gId.x].pos = vec3(rand(), rand(), rand());
    // starDatas.ms[gId.x].pos = vec3(rand() - 0.5, rand() - 0.5, rand() - 0.5) 
    //   * ${STAR_BOX_SIZE.toFixed(1)};
    // TODO: generate a random hue not color
    // starDatas.ms[gId.x].color = vec3(f32(gId.x) / 5.0, 0.2, 0.2);
    starDatas.ms[gId.x].color = vec3(rand(), rand(), rand());
    // starDatas.ms[gId.x].size = rand() * 3.0
    starDatas.ms[gId.x].size = rand() * 0.2
      ;
      // * 0.2;
  }
  `,
  workgroupCounts: [Math.ceil(NUM_STARS / 64), 1, 1],
});

export const renderStars = CY.createRenderPipeline("renderStars", {
  globals: [starData, sceneBufPtr],
  // TODO(@darzu): use an "override" var for starBoxSize once supported
  shader: (shaders) => `
  var<private> starBoxSize = ${STAR_BOX_SIZE.toFixed(1)};
  ${shaders["std-stars"].code}
  `,
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  meshOpt: {
    vertexCount: 6 * NUM_STARS,
    stepMode: "single-draw",
  },
  depthStencil: mainDepthTex,
  output: [
    emissionTexturePtr,
    // outlinedTexturePtr
    litTexturePtr,
  ],
});
