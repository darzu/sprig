import { CY, linearSamplerPtr } from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { canvasTexturePtr, mainTexturePtr } from "./std-scene.js";

export const postProcess = CY.createRenderPipeline("postProcess", {
  globals: [
    { ptr: linearSamplerPtr, alias: "mySampler" },
    { ptr: mainTexturePtr, alias: "myTexture" },
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [canvasTexturePtr],
  shader: () => {
    return `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
};

@stage(vertex)
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  let xs = vec2(-1.0, 1.0);
  let ys = vec2(-1.0, 1.0);
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.x),
    vec2<f32>(xs.y, ys.y),
    vec2<f32>(xs.x, ys.y),
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.y),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@stage(fragment)
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
  let m = vec4(textureSample(myTexture, mySampler, fragUV));
  let e = 0.002;
  let mT = vec4(textureSample(myTexture, mySampler, fragUV + vec2(0.0, e)));
  let mL = vec4(textureSample(myTexture, mySampler, fragUV + vec2(-e, 0.0)));
  let mR = vec4(textureSample(myTexture, mySampler, fragUV + vec2(e, 0.0)));
  let mB = vec4(textureSample(myTexture, mySampler, fragUV + vec2(0.0, -e)));
  if (
    length(m - mT) > 0.1 ||
    length(m - mL) > 0.1 ||
    length(m - mR) > 0.1 ||
    length(m - mB) > 0.1
  ) {
    return vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    let res = vec4(m.r, m.g, m.b, m.a);
    return res;
  }
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
