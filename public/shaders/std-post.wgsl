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
  // if (uv.x >= tm - 0.005) {
  //   discard;
  // }

  var color = textureSample(colorTex, samp, uv).rgb;
  let bloom = textureSample(bloomTex, samp, uv).rgb;
  let depth = textureSample(depthTex, samp, uv);

  // fog
  // TODO: hard to evaluate fog w/o objects to fade in and out
  // TODO(@darzu): flag to enable fog
  // if (depth < 1.0) {
  //   color = mix(color, vec3(0.2, 0.2, 0.5), pow(depth, 300.0));
  // }

  // bloom
  if (scene.highGraphics == 1u) {
    // color += pow(bloom, vec3(2.0));

    // color = max(color, bloom);
    color += bloom; // * 10.0;
    // color = bloom;
  }

  // vignette
  let vigUV = uv * (1.0 - uv.yx);
  var vig = vigUV.x * vigUV.y * 1.0 *
            (1.0 / (scene.vignetteIntensity +
                    0.001)); // multiply with sth for intensity
  vig = pow(vig, 2.5 * pow(scene.vignetteIntensity,
                           5.0)); // change pow for modifying
                                  // the extend of the vignette
  color *= vig;

  // TESTING RAND
  // rand_seed = uv;
  // return vec4(rand(), rand(), rand(), 1.0);

  // return vec4(color, 1.0);
  // gamma correction
  let gammaCorrected: vec3<f32> = pow(color, vec3<f32>(1.0/2.2));
  return vec4(gammaCorrected, 1.0);
}


