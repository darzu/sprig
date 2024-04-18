

@fragment
fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  // let tm = abs(fract(scene.time * 0.0002) * 2.0 - 1.0);
  // if (uv.x < tm + 0.005) {
  //   discard;
  // }

  let dims : vec2<i32> = vec2<i32>(textureDimensions(voronoiTex));
  let dimsF = vec2<f32>(dims);
  let coord = uv * dimsF;
  // let uv2 = textureLoad(voronoiTex, vec2<i32>(coord), 0).xy;
  let dataXY = textureLoad(voronoiTex, vec2<i32>(coord), 0).xy;
  let uv2 = vec2<f32>(dataXY) / dimsF;
  let coord2 = uv2 * dimsF;
  // if (distance(coord, coord2) > 100.0 * tBounceSmooth(0.0002, 0.1) + 5.0) {
  //   discard;
  // }
  var color = textureLoad(colorTex, vec2<i32>(coord2), 0).rgb;

  // var uv2 = textureSample(voronoiTex, samp, uv).rg;
  // var color = textureSample(colorTex, samp, uv2).rgb;

  let gammaCorrected: vec3<f32> = pow(color, vec3<f32>(1.0/2.2));
  return vec4(gammaCorrected, 1.0);
  
  // return vec4(color, 1.0);
}
