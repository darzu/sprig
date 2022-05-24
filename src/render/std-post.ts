import { CY, linearSamplerPtr } from "./gpu-registry.js";
import {
  canvasDepthTex,
  canvasTexturePtr,
  mainTexturePtr,
  normalsTexturePtr,
} from "./std-scene.js";

export const postProcess = CY.createRenderPipeline("postProcess", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: mainTexturePtr, alias: "colorTex" },
    { ptr: normalsTexturePtr, alias: "normTex" },
    { ptr: canvasDepthTex, alias: "depthTex" },
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
  var color = textureSample(colorTex, samp, fragUV);
  let e = 0.002;
  let t = fragUV + vec2(0.0, e);
  let l = fragUV + vec2(-e, 0.0);
  let r = fragUV + vec2(e, 0.0);
  let b = fragUV + vec2(0.0, -e);

  let n = normalize(textureSample(normTex, samp, fragUV)).xyz;

  // let dx = dpdx(n);
  // let dy = dpdy(n);
  // let xneg = n - dx;
  // let xpos = n + dx;
  // let yneg = n - dy;
  // let ypos = n + dy;
  // // let depth = length(vertex);
  // let depth = textureSample(depthTex, samp, fragUV);
  // let curvature = (cross(xneg, xpos).y - cross(yneg, ypos).x) * 4.0 / depth;

  // color += vec4(curvature, curvature, curvature, 1.0);

  let mT = textureSample(normTex, samp, t).xyz;
  let mL = textureSample(normTex, samp, l).xyz;
  let mR = textureSample(normTex, samp, r).xyz;
  let mB = textureSample(normTex, samp, b).xyz;

  // if (
  //   // length(mB - mT) > 0.05 ||
  //   length(mR - mL) > 0.05
  // ) {
  //   if (length(cross(mR,mL)) < 0.0) {
  //     color = vec4(0.0, 0.0, 0.0, 1.0);
  //   } else {
  //     color = vec4(1.0, 1.0, 1.0, 1.0);
  //   }
  // }

  // vignette
  let edgeDistV = fragUV - 0.5;
  let edgeDist = 1.0 - dot(edgeDistV, edgeDistV) * 0.5;
  // let edgeDist = 1.0 - length(fragUV - 0.5) * 0.5;
  color *= edgeDist;

  
  return color;
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
