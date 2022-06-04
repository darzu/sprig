import { CY, linearSamplerPtr } from "./gpu-registry.js";
import {
  canvasDepthTex,
  canvasTexturePtr,
  mainTexturePtr,
  normalsTexturePtr,
  positionsTexturePtr,
  sceneBufPtr,
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
    sceneBufPtr,
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

  var lineColor = 0.0;

  // SURFACE ID BASED
  let dims : vec2<i32> = textureDimensions(surfTex);
  let dimsF = vec2<f32>(dims);
  // NOTE: we make the line width depend on resolution b/c that gives a more consistent
  //    look across resolutions.
  // let lineWidth = 1.0;
  let lineWidth = 3.0;
  // let lineWidth = max((f32(dims.r) / 800.0), 1.0);
  let coord = fragUV * vec2<f32>(dims);
  let t = coord - vec2(0.0, lineWidth);
  let l = coord - vec2(lineWidth, 0.0);
  let r = coord + vec2(lineWidth, 0.0);
  let b = coord + vec2(0.0, lineWidth);
  let sT = textureLoad(surfTex, vec2<i32>(t), 0);
  let sL = textureLoad(surfTex, vec2<i32>(l), 0);
  let sR = textureLoad(surfTex, vec2<i32>(r), 0);
  let sB = textureLoad(surfTex, vec2<i32>(b), 0);  

  let concaveE = lineWidth * 1.0 ;
  let h = textureSample(depthTex, samp, fragUV);
  // let hT = textureSample(depthTex, samp, fragUV + vec2(0.0, 0.01));
  // let hL = textureSample(depthTex, samp, fragUV + vec2(-0.01, 0.0));
  // let hR = textureSample(depthTex, samp, fragUV + vec2(0.01, 0.0));
  // let hB = textureSample(depthTex, samp, fragUV + vec2(0.0, -0.01));  
  let hT = textureSample(depthTex, samp, (coord - vec2(0.0, concaveE)) / dimsF);
  let hL = textureSample(depthTex, samp, (coord - vec2(concaveE, 0.0)) / dimsF);
  let hR = textureSample(depthTex, samp, (coord + vec2(concaveE, 0.0)) / dimsF);
  let hB = textureSample(depthTex, samp, (coord + vec2(0.0, concaveE)) / dimsF);  
  // let hDX = abs((h - hL) - (h - hR)) > 0.1;
  // let hDY = abs((h - hT) - (h - hB)) > 0.1;

  // let depthXf = hR - hL;
  // let depthYf = hT - hB;
  // let depthD = depthXf + depthYf;
  let depthDX1 = hR - h;
  let depthDX2 = h - hL;
  let depthDY1 = hT - h;
  let depthDY2 = h - hB;
  let depthD = (depthDX1 - depthDX2) + (depthDY1 - depthDY2);

  // let concaveX = h > hL && h > hR;
  // let concaveY = h > hT && h > hB;
  // let concave = f32(concaveX || concaveY) * 2.0 - 1.0;

  let n = normalize(textureSample(normTex, samp, fragUV).xyz);
  let nT = normalize(textureSample(normTex, samp, (coord - vec2(0.0, concaveE)) / dimsF).xyz);
  let nL = normalize(textureSample(normTex, samp, (coord - vec2(concaveE, 0.0)) / dimsF).xyz);
  let nR = normalize(textureSample(normTex, samp, (coord + vec2(concaveE, 0.0)) / dimsF).xyz);
  let nB = normalize(textureSample(normTex, samp, (coord + vec2(0.0, concaveE)) / dimsF).xyz);
  
  let surfaceDidChange = sT.r != sB.r || sL.r != sR.r;
  let objectDidChange = sT.g != sB.g || sL.g != sR.g;

  let convexX = nL.x < nR.x; // && abs(hL - hR) < 0.001;
  let convexXf = nR.x - nL.x; // && abs(hL - hR) < 0.001;
  let convexY = nT.y > nB.y; // && abs(hT - hB) < 0.001;
  let convexYf = nT.y - nB.y; // && abs(hT - hB) < 0.001;
  // let convexity = sqrt(pow(convexYf, 2.0) + pow(convexXf, 2.0));
  let convexity = convexYf + convexXf;
  let convex = convexity > 0.05;
  // let convex = convexX || convexY;
  let convexFactor = f32(!objectDidChange && convex) * 2.0 - 1.0;

  // let dx = dpdx(n);
  // let dy = dpdy(n);
  // let xneg = n - dx;
  // let xpos = n + dx;
  // let yneg = n - dy;
  // let ypos = n + dy;
  // // let depth = length(vertex);
  // let depth = textureSample(depthTex, samp, fragUV);
  // let curvature = (cross(xneg, xpos).y - cross(yneg, ypos).x) * 4.0 / depth;
  // // let curvature = cross(xneg, xpos).y - cross(yneg, ypos).x > 0.0;

  // if (h < 0.98) {
    if (
      surfaceDidChange || objectDidChange
    ) {
      // lineColor = -0.1 + -0.3 * (f32(curvature) * 2.0 - 1.0);
      lineColor = convexity * 0.3;
      if (lineColor > 0.0) {
        lineColor *= 0.5;
      }
      // lineColor = 0.3 * convexFactor;
    }
  // }

  // lineColor *= 20.0;

  color += lineColor;

  let ni = (n + 1.0) / 2.0;
  color = vec4(ni, 1.0) * 0.5;
  color.r = 0.0;
  // color.g = 0.0;
  color.b = 0.0;

  color *= 0.0;
  color.a = 1.0;
  // color.b = h;
  // if (!objectDidChange && convexX) {
  //   color.r = 1.0;
  // }
  // if (!objectDidChange && convexY) {
  //   color.g = 1.0;
  // }
  if (surfaceDidChange && !objectDidChange) {
    color.r = (convexYf + convexXf);// * 20.0;
    color.b = -(convexYf + convexXf);// * 20.0;
    // color.g = 0.5 - abs(convexYf + convexXf);
    // color.r = convexYf * 20.0; // + 0.5;
    // color.r = convexXf + 0.5;
  }
  if (surfaceDidChange) {
    color.g = depthD * 100.0;
  }
  if (objectDidChange) {
    color.r = 0.0;
    color.b = 0.0;
    color.g = 0.5;
  }
  // color.b = 0.5 + convexYf; // + convexXf;

  // color.r = h;
  // // color.r = curvature;
  // color.g = 0.2;
  // color.b = 0.0;
  // color.r = (l / dimsF.x).r;
  // color.g = (l / dimsF.x).g;

  // color.r = fragUV.x;
  // color.g = fragUV.y;

  // DEBUG: visualizes surface IDs
  // let s = textureLoad(surfTex, vec2<i32>(coord), 0);
  // color = vec4(u32toVec3f32(u32(s.r), 24u), 1.0);

  // vignette
  // let edgeDistV = fragUV - 0.5;
  // let edgeDist = 1.0 - dot(edgeDistV, edgeDistV) * 0.5;
  // // let edgeDist = 1.0 - length(fragUV - 0.5) * 0.5;
  // color *= edgeDist;
  
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
