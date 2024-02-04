struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
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
  output.uv = uv[VertexIndex];
  return output;
}


@fragment
fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  // let tm = abs(fract(scene.time * 0.0002) * 2.0 - 1.0);
  // if (uv.x < tm + 0.005) {
  //   discard;
  // }


  let tBounce = abs(fract(scene.time * 0.0002) * 2.0 - 1.0);

  let dims : vec2<i32> = vec2<i32>(textureDimensions(voronoiTex));
  let coord = uv * vec2<f32>(dims);
  let uv2 = textureLoad(voronoiTex, vec2<i32>(coord), 0).xy;
  let coord2 = uv2 * vec2<f32>(dims);
  // if (distance(coord, coord2) > (100.0 * tBounce + 1.0)) {
  if (distance(coord, coord2) > 100.0 * smoothstep(0.0, 1.0, tBounce) + 5.0) {
    discard;
  }
  var color = textureLoad(colorTex, vec2<i32>(coord2), 0).rgb;

  // var uv2 = textureSample(voronoiTex, samp, uv).rg;
  // var color = textureSample(colorTex, samp, uv2).rgb;


  let gammaCorrected: vec3<f32> = pow(color, vec3<f32>(1.0/2.2));
  return vec4(gammaCorrected, 1.0);
  
  // return vec4(color, 1.0);
}
