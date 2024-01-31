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

  var color = input.color;

  const lineWidth = vec2<f32>(0.05);

  var alpha: f32;

  let uv = worldPos.xy / 10.0;
  let uvDDXY = vec4(dpdx(uv), dpdy(uv));
  if (worldPos.y < -1.0 && worldPos.x < -1.0) {
    // bgolus inspired:
    let uvDeriv = vec2(length(uvDDXY.xz), length(uvDDXY.yw));
    let drawWidth = clamp(lineWidth, uvDeriv, vec2(0.5));
    let lineAA = uvDeriv * 1.5;
    let gridUV = 1.0 - abs(fract(uv) * 2.0 - 1.0);
    var grid = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
    grid *= saturate(lineWidth / drawWidth);
    grid = mix(grid, lineWidth, saturate(uvDeriv * 2.0 - 1.0));
    alpha = mix(grid.x, 1.0, grid.y);
  } else if (worldPos.y < -1.0  && worldPos.x > 1.0) {
    // iquilezles box filter:
    const N = 1 / lineWidth.x;
    let w = max(abs(uvDDXY.xy), abs(uvDDXY.zw));
    let a = uv + 0.5*w + lineWidth.x * 0.5;                        
    let b = uv - 0.5*w + lineWidth.x * 0.5;           
    let i = (floor(a)+min(fract(a)*N,vec2(1.0))-
              floor(b)-min(fract(b)*N,vec2(1.0)))/(N*w);
    alpha = mix(i.x, 1.0, i.y);
  } else if (worldPos.y > 1.0 && worldPos.x > 1.0) {
    // naive:
    if (fract(uv.x) < lineWidth.x 
    || fract(uv.y) < lineWidth.y) {
      alpha = 1.0;
    } else {
      alpha = 0.0;
    }
  } else if (worldPos.y > 1.0 && worldPos.x < -1.0) {
    // fourth technique?
    alpha = 0.0;
  } else {
    // white divider
    color = vec3(1.0);
    alpha = 1.0;
  }

  var out: FragOut;

  out.color = vec4(color, alpha);
  
  return out;
}
