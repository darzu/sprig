struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) color: vec3<f32>,
  };
  
  @vertex
  fn vert_main(@builtin(vertex_index) gvIdx : u32) -> VertexOutput {
    let vIdx = gvIdx % 6u;
    let starIdx = gvIdx / 6u;

    let star = starDatas.ms[starIdx];
    let S = star.size;

    let corners = array<vec3<f32>, 6>(
      vec3<f32>(-S, -S, 0.0),
      vec3<f32>(S, -S, 0.0),
      vec3<f32>(S, S, 0.0),
      vec3<f32>(-S, S, 0.0),
      vec3<f32>(-S, -S, 0.0),
      vec3<f32>(S, S, 0.0),
    );
    let corner = corners[vIdx];

    // TODO(@darzu): just include this on the scene?
    // TODO(@darzu): PERF. precompute
    // TODO(@darzu): DEDUP w/ dots
    let right = normalize(vec3(
      scene.cameraViewProjMatrix[0][0], 
      scene.cameraViewProjMatrix[1][0], 
      scene.cameraViewProjMatrix[2][0]
    ));
    let up = normalize(vec3(
      scene.cameraViewProjMatrix[0][1], 
      scene.cameraViewProjMatrix[1][1], 
      scene.cameraViewProjMatrix[2][1]
    ));

    let hyperspeedFactor = 1.0; 
    var wrappedPos = (
      fract(star.pos - scene.cameraPos * hyperspeedFactor / starBoxSize)
      - 0.5 
      ) * starBoxSize + scene.cameraPos;

    // let hyperspeedFactor = 10.0; // 1.0 = none, 2.0 = ea 1.0 ship forward stars go backward 1.0
    // var wrappedPos = (
    //   fract(star.pos - scene.partyPos * hyperspeedFactor / starBoxSize)
    //   - 0.5 
    //   ) * starBoxSize + scene.partyPos;

    let worldPos = wrappedPos
      + right * corner.x
      + up * corner.y;

    let screenPos = scene.cameraViewProjMatrix * vec4(worldPos, 1.0);

    let uv = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
    );
  
    var output : VertexOutput;
    output.Position = screenPos;
    output.uv = uv[vIdx];
    output.color = star.color;
    return output;
  }
  
  struct FragOut {
    @location(0) emission: vec4<f32>,
    @location(1) color: vec4<f32>,
  }

  @fragment
  fn frag_main(input: VertexOutput) -> FragOut {
    // TODO(@darzu): Can we do emissive blur by outputing a fading-out color
    //    straight to the emission texture? Might not need the guassian blur
    //    at all. One tricky thing is that that the output size for the emission
    //    texture is much bigger so we need to not write to the color tex in
    //    all locations. We should be able to handle this easily with alpha blend
    //    mode stuff or maybe a stencil mask or something.
    //    Another benefit of doing this is that we can have the blur be proportional
    //    to the size of the star.

    let dist = length(input.uv - vec2(0.5));
    // TODO: what's the perf difference of alpha vs discard?
    if (dist > 0.5) {
      discard;
    }

    var out: FragOut;

    out.emission = vec4<f32>(input.color * 0.5, 1.0);
    out.color = vec4<f32>(input.color * 2.0, 1.0);

    return out;
  }