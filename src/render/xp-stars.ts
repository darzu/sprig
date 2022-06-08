import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { mainDepthTex, mainTexturePtr, sceneBufPtr } from "./std-scene.js";

const StarStruct = createCyStruct({
  pos: "vec3<f32>",
  color: "vec3<f32>",
  size: "f32",
});
export type StarTS = CyToTS<typeof StarStruct.desc>;

const starData = CY.createArray("starData", {
  struct: StarStruct,
  init: () => 1000,
  // forceUsage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
});

export const initStars = CY.createComputePipeline("initStars", {
  globals: [starData],
  shaderComputeEntry: "main",
  shader: () => `
  var<private> rand_seed : vec2<f32>;

  fn rand() -> f32 {
      rand_seed.x = fract(cos(dot(rand_seed, vec2<f32>(26.88662389, 200.54042905))) * 240.61722267);
      rand_seed.y = fract(cos(dot(rand_seed, vec2<f32>(58.302370833, 341.7795489))) * 523.34916812);
      return rand_seed.y;
  }

  @stage(compute) @workgroup_size(64)
  fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
    rand_seed *= vec2<f32>(gId.xy * gId.z); 
    starDatas.ms[gId.x].pos = vec3(0.0);
    // starDatas.ms[gId.x].pos = vec3(rand(), rand(), rand()) * 10.0;
    starDatas.ms[gId.x].color = vec3(rand(), rand(), rand());
    starDatas.ms[gId.x].size = rand() * 10.0;
  }
  `,
});

export const renderStars = CY.createRenderPipeline("renderStars", {
  globals: [starData, sceneBufPtr],
  shader: () => `
  struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) uv : vec2<f32>,
  };
  
  @stage(vertex)
  fn vert_main(@builtin(vertex_index) gvIdx : u32) -> VertexOutput {
    let vIdx = gvIdx % 6u;
    let starIdx = gvIdx / 6u;

    let star = starDatas.ms[starIdx];
    // Hmmm
    let S = 10.0;
    // let S = star.size;

    let xs = vec2(-S, S);
    let ys = vec2(-S, S);
    var corners = array<vec3<f32>, 6>(
      vec3<f32>(xs.x, ys.x, 0.0),
      vec3<f32>(xs.y, ys.x, 0.0),
      vec3<f32>(xs.y, ys.y, 0.0),
      vec3<f32>(xs.x, ys.y, 0.0),
      vec3<f32>(xs.x, ys.x, 0.0),
      vec3<f32>(xs.y, ys.y, 0.0),
    );
    // let worldPos = corners[vIdx] + star.pos;
    var pos0 = scene.cameraViewProjMatrix * vec4(star.pos, 1.0);
    let pos = pos0 + vec4(corners[vIdx], 0.0);
    // pos.w /= pos.w;
  
    var uv = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
    );
  
    var output : VertexOutput;
    output.Position = pos;
    output.uv = uv[vIdx];
    return output;
  }
  
  @stage(fragment)
  fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 1.0, 0.0, 1.0);
  }
  `,
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  meshOpt: {
    // TODO(@darzu): 6 * num_stars
    vertexCount: 6,
    stepMode: "single-draw",
  },
  depthStencil: mainDepthTex,
  output: [mainTexturePtr],
});
