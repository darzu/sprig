struct VertexOutput {
    @location(0) @interpolate(flat) color : vec3<f32>,
    @location(1) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    output.color = color + meshUni.tint;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  let worldPos = input.worldPos;

  var color: vec3<f32>;
  
  // let dims : vec2<i32> = vec2<i32>(textureDimensions(surfTex));
  // let coord = uv * vec2<f32>(dims);
  // let surf = textureLoad(surfTex, vec2<i32>(coord), 0);

  const lineWidth = vec2<f32>(0.05);

  let uv = worldPos.xy / 10.0;
  let uvDDXY = vec4(dpdx(uv), dpdy(uv));
  if (worldPos.y < -1.0) {
    // bgolus inspired (right):
    let uvDeriv = vec2(length(uvDDXY.xz), length(uvDDXY.yw));
    let drawWidth = clamp(lineWidth, uvDeriv, vec2(0.5));
    let lineAA = uvDeriv * 1.5;
    let gridUV = 1.0 - abs(fract(uv) * 2.0 - 1.0);
    var grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
    grid2 *= saturate(lineWidth / drawWidth);
    grid2 = mix(grid2, lineWidth, saturate(uvDeriv * 2.0 - 1.0));
    let grid = mix(grid2.x, 1.0, grid2.y);
    color = vec3(0.0, grid, grid);
    // iquilezles:
    // TODO(@darzu): 
  } else if (worldPos.y > 1.0) {
    // naive (eft):
    if (fract(uv.x) < lineWidth.x 
    || fract(uv.y) < lineWidth.y) {
      color = vec3(0.0, 1.0, 1.0);
    } else {
      // color = vec3(0.0);
      discard;
    }
  } else {
    // white divider
    color = vec3(1.0);
  }

// float2 grid2 = smoothstep(lineWidth + lineAA, lineWidth - lineAA, gridUV);
// float grid = lerp(grid2.x, 1.0, grid2.y); //

  // if (fract(worldPos.x / 10.0) < 0.05 
  //  || fract(worldPos.y / 10.0) < 0.05) {
  //   if (surf.g == 7u) {
  //     color = vec3(0.0, 1.0, 1.0);
  //   }
  //   else if (surf.g == 8u) {
  //     color = vec3(1.0, 1.0, 0.0);
  //   }
  // }



  var out: FragOut;

  out.color = vec4(color, 1.0);
  
  return out;
}
