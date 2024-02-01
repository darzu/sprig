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

  const lineSpacing = 10.0;
  const lineSpacing2 = 100.0;

  const lineWidth = 0.5;
  const lineWidth2 = 2.0;

  var alpha: f32 = 0.0;

  const lineFrac = vec2<f32>(lineWidth / lineSpacing);
  const lineFrac2 = vec2<f32>(lineWidth2 / lineSpacing2);
  let uv = worldPos.xy / lineSpacing;
  let uv2 = worldPos.xy / lineSpacing2;
  let uvDDXY = vec4(dpdx(uv), dpdy(uv));
  let uvDDXY2 = vec4(dpdx(uv2), dpdy(uv2));
  if (worldPos.y < -1.0 && worldPos.x < -1.0) {
    // bgolus inspired:
    { // grid #1
      let uvDeriv = vec2(length(uvDDXY.xz), length(uvDDXY.yw));
      let drawWidth = clamp(lineFrac, uvDeriv, vec2(0.5));
      let lineAA = uvDeriv * 1.5;
      let gridUV = 1.0 - abs(fract(uv) * 2.0 - 1.0);
      var grid = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
      grid *= saturate(lineFrac / drawWidth);
      grid = mix(grid, lineFrac, saturate(uvDeriv * 2.0 - 1.0));
      alpha += mix(grid.x, 1.0, grid.y);
    }
    { // grid #2
      let uvDeriv = vec2(length(uvDDXY2.xz), length(uvDDXY2.yw));
      let drawWidth = clamp(lineFrac2, uvDeriv, vec2(0.5));
      let lineAA = uvDeriv * 1.5;
      let gridUV = 1.0 - abs(fract(uv2) * 2.0 - 1.0);
      var grid = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);
      grid *= saturate(lineFrac2 / drawWidth);
      grid = mix(grid, lineFrac2, saturate(uvDeriv * 2.0 - 1.0));
      alpha += mix(grid.x, 1.0, grid.y);
    }
  } else if (worldPos.y < -1.0  && worldPos.x > 1.0) {
    // iquilezles box filter:
    // TODO(@darzu): center lines
    const N = 1 / lineFrac.x;
    let w = max(abs(uvDDXY.xy), abs(uvDDXY.zw));
    let a = uv + 0.5*w; 
    let b = uv - 0.5*w; 
    let i = (floor(a)+min(fract(a)*N,vec2(1.0))-
              floor(b)-min(fract(b)*N,vec2(1.0)))/(N*w);
    alpha =  1.0 - (1.0-i.x)*(1.0-i.y);
  } else if (worldPos.y > 1.0 && worldPos.x > 1.0) {
    // // line width varies by worldPos ??
    // var width = 0.5;
    // var num = worldPos.x / 5.0;
    // var i = 0;
    // for (i = 0; i < 5; i++) {
    //   if (fract(num / 5.0) < 0.2) {
    //     width *= 5.0;
    //     num /= 5.0;
    //   }
    // }
    // naive:
    if (
      fract(uv.x) < lineFrac.x
      || fract(uv.y) < lineFrac.y
      // || fract(uv2.x) < lineFrac2.x
      // || fract(uv2.y) < lineFrac2.y
    ) {
      alpha = 1.0;
    } else {
      alpha = 0.0;
    }
  } else if (worldPos.y > 1.0 && worldPos.x < -1.0) {
    // iquilezles dots:
    const N = 1 / lineFrac.x * 0.5;
    let w = max(abs(uvDDXY.xy), abs(uvDDXY.zw));
    let a = uv + 0.5*w; 
    let b = uv - 0.5*w;    
    let i = (floor(a)+min(fract(a)*N,vec2(1.0))-
            floor(b)-min(fract(b)*N,vec2(1.0)))/(N*w);
    alpha += sqrt(i.x*i.y);

    const N2 = 1 / lineFrac2.x * 0.5;
    let w2 = max(abs(uvDDXY2.xy), abs(uvDDXY2.zw));
    let a2 = uv2 + 0.5*w2; 
    let b2 = uv2 - 0.5*w2; 
    let i2 = (floor(a2)+min(fract(a2)*N2,vec2(1.0))-
              floor(b2)-min(fract(b2)*N2,vec2(1.0)))/(N2*w2);
    // alpha += 1.0 - (1.0-i.x)*(1.0-i.y);
    // alpha +=  1.0 - 1.0-i.x-i.y+2.0*i.x*i.y;
    // alpha += max(i.x, i2.x) * max(i.y, i2.y);
    alpha += sqrt(i2.x*i2.y);
  } else {
    color = vec3(1);
    if (abs(worldPos.y) <= 1.0 && worldPos.x > 0) {
      color = vec3(1,0,0);
    }
    else if (abs(worldPos.x) <= 1.0 && worldPos.y > 0) {
      color = vec3(0,1,0);
    }
    alpha = 1.0;
  }

  alpha *= 0.5;

  var out: FragOut;

  out.color = vec4(color, alpha);
  
  return out;
}
