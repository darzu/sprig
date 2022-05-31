import { CY, linearSamplerPtr } from "./gpu-registry.js";
import {
  canvasDepthTex,
  canvasTexturePtr,
  mainTexturePtr,
  normalsTexturePtr,
  positionsTexturePtr,
  surfacesTexturePtr,
} from "./std-scene.js";

// TODO(@darzu): rewrite post processing with compute shader?
//  https://computergraphics.stackexchange.com/questions/54/when-is-a-compute-shader-more-efficient-than-a-pixel-shader-for-image-filtering
//  result: yes, probably it is a good idea.

export const postProcess = CY.createRenderPipeline("postProcess", {
  globals: [
    { ptr: linearSamplerPtr, alias: "samp" },
    { ptr: mainTexturePtr, alias: "colorTex" },
    { ptr: normalsTexturePtr, alias: "normTex" },
    { ptr: positionsTexturePtr, alias: "posTex" },
    { ptr: surfacesTexturePtr, alias: "surfTex" },
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
  // let e = 0.01;
  let e = 0.0015;
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

  let nT = textureSample(normTex, samp, t).xyz;
  let nL = textureSample(normTex, samp, l).xyz;
  let nR = textureSample(normTex, samp, r).xyz;
  let nB = textureSample(normTex, samp, b).xyz;

  let p = textureSample(posTex, samp, fragUV).xyz;
  let pT = textureSample(posTex, samp, t).xyz;
  let pL = textureSample(posTex, samp, l).xyz;
  let pR = textureSample(posTex, samp, r).xyz;
  let pB = textureSample(posTex, samp, b).xyz;

  let dX0 = length(pL - pR);
  let dX1 = length((pL + nL * 0.001) - (pR + nR * 0.001));
  let dY0 = length(pT - pB);
  let dY1 = length((pT + nT * 0.001) - (pB + nB * 0.001));

  let h = textureSample(depthTex, samp, fragUV);
  let hT = textureSample(depthTex, samp, t);
  let hL = textureSample(depthTex, samp, l);
  let hR = textureSample(depthTex, samp, r);
  let hB = textureSample(depthTex, samp, b);  
  let hDX = abs((h - hL) - (h - hR)) > 0.1;
  let hDY = abs((h - hT) - (h - hB)) > 0.1;


  var colorChange = 0.0;

  // if (h + 0.000001 < hL && h + 0.000001 < hR) {
  // // if (h < hL || h < hR) {
  //   colorChange = 0.2;
  // }

  // let depthChangeX = abs(hL - hR) > 0.02;
  // let depthChangeY = abs(hT - hB) > 0.02;
  // let depthChangeXf = f32(abs(hL - hR) > 0.1) * 2.0 - 1.0;
  // let depthChangeYf = f32(abs(hT - hB) > 0.1) * 2.0 - 1.0;
  // // let depthChangeX = f32(abs(hL - hR) > 0.01 && hDX) * 2.0 - 1.0;
  // // let depthChangeY = f32(abs(hT - hB) > 0.01 && hDY) * 2.0 - 1.0;

  // // color.r = depthChangeX;
  // // color.g = depthChangeY;

  let posChangeX = dX0 > 1.5;
  let posChangeY = dY0 > 1.5;
  let posChangeXf = f32(posChangeX) * 2.0 - 1.0;
  let posChangeYf = f32(posChangeY) * 2.0 - 1.0;

  if (
    length( nR - nL) > 0.05
    // || posChangeX
    // || depthChangeX
  ) {
    if (dX0 < dX1) {
      colorChange = 0.2 * -posChangeXf;
      // colorChange = 0.2; // * -depthChangeX;
      // color = vec4(1.0, 0.0, 0.0, 1.0);
    } else {
      colorChange = -0.3;
      // color = vec4(0.0, 1.0, 0.0, 1.0);
    }
  } 
  else if (
    length( nB - nT) > 0.05
    // || posChangeY
    // || depthChangeY
  ) {
    if (dY0 < dY1) {
      colorChange = 0.2 * -posChangeYf;
      // colorChange = 0.2; // * -depthChangeY; 
      // color = vec4(0.0, 0.0, 1.0, 1.0);
    } else {
      colorChange = -0.3;
      // color = vec4(1.0, 1.0, 0.0, 1.0);
    }
  }

  // SURFACE ID BASED
  // let sL = surfTex


  let surf_dims : vec2<i32> = textureDimensions(surfTex);
  // NOTE: we make the line width depend on resolution b/c that gives a more consistent
  //    look across resolutions.
  // let lineWidth = 1.0;
  let lineWidth = max((f32(surf_dims.r) / 800.0), 1.0);
  let coord = fragUV * vec2<f32>(surf_dims);
  let sT = textureLoad(surfTex, vec2<i32>(coord + vec2(0.0, lineWidth)), 0);
  let sL = textureLoad(surfTex, vec2<i32>(coord - vec2(lineWidth, 0.0)), 0);
  let sR = textureLoad(surfTex, vec2<i32>(coord + vec2(lineWidth, 0.0)), 0);
  let sB = textureLoad(surfTex, vec2<i32>(coord - vec2(0.0, lineWidth)), 0);  

  colorChange = 0.0;


  // if (h < 0.98) {
    if (
      sT.r != sB.r ||
      sT.g != sB.g ||
      sL.r != sR.r ||
      sL.g != sR.g ||
      false
    ) {
      colorChange = -0.3;
    }
  // }

  // colorChange *= 20.0;

  color += colorChange;

  // DEBUG: visualizes surface IDs
  // let s = textureLoad(surfTex, vec2<i32>(coord), 0);
  // color = vec4(u32toVec3f32(u32(s.r), 100u), 1.0);

  // vignette
  let edgeDistV = fragUV - 0.5;
  let edgeDist = 1.0 - dot(edgeDistV, edgeDistV) * 0.5;
  // let edgeDist = 1.0 - length(fragUV - 0.5) * 0.5;
  color *= edgeDist;
  
  return color;
}

fn u32toVec3f32(i: u32, max: u32) -> vec3<f32> {
  let maxF = f32(max);
  return vec3(
    f32(((((i % 7u) + 1u) & 1u) >> 0u) * ((i / 7u) + 1u)) / ceil(maxF / 7.0),
    f32(((((i % 7u) + 1u) & 2u) >> 1u) * ((i / 7u) + 1u)) / ceil(maxF / 7.0),
    f32(((((i % 7u) + 1u) & 4u) >> 2u) * ((i / 7u) + 1u)) / ceil(maxF / 7.0),
  );
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
