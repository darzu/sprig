struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) uv : vec2<f32>,
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
  output.uv = uv[VertexIndex];
  return output;
}

@stage(fragment)
fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(colorTex, samp, uv).rgb;

  // vignette
  let vigUV = uv * (1.0 - uv.yx);
  var vig = vigUV.x*vigUV.y * 3.0; // multiply with sth for intensity
  vig = pow(vig, 0.15); // change pow for modifying the extend of the  vignette
  color *= vig;

  // TESTING RAND
  // rand_seed = uv;
  // return vec4(rand(), rand(), rand(), 1.0);

  // gamma correction
  let gammaCorrected: vec3<f32> = pow(color, vec3<f32>(1.0/2.2));
  return vec4(gammaCorrected, 1.0);
}

// Move to common file?
var<private> rand_seed : vec2<f32>;
fn rand() -> f32 {
    rand_seed.x = fract(cos(dot(rand_seed, vec2<f32>(26.88662389, 200.54042905))) * 240.61722267);
    rand_seed.y = fract(cos(dot(rand_seed, vec2<f32>(58.302370833, 341.7795489))) * 523.34916812);
    return rand_seed.y;
}
