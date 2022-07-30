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
    // Hmmm
    // let S = 4.0;
    let S = star.size;

    let xs = vec2(-S, S);
    let ys = vec2(-S, S);
    var corners = array<vec3<f32>, 6>(
      vec3<f32>(xs.x, ys.x, 0.0),
      vec3<f32>(xs.y, ys.x, 0.0),
      vec3<f32>(xs.y, ys.y, 0.0),
      vec3<f32>(xs.x, ys.y, 0.0),
      vec3<f32>(xs.x, ys.x, 0.0),
      vec3<f32>(xs.y, ys.y, 0.0),
    );
    let corner = corners[vIdx];

    let right = vec3(
      scene.cameraViewProjMatrix[0][0], 
      scene.cameraViewProjMatrix[1][0], 
      scene.cameraViewProjMatrix[2][0]
    );
    let up = vec3(
      scene.cameraViewProjMatrix[0][1], 
      scene.cameraViewProjMatrix[1][1], 
      scene.cameraViewProjMatrix[2][1]
    );

    let worldPos = star.pos
      + right * corner.x
      + up * corner.y;

    let screenPos = scene.cameraViewProjMatrix * vec4(worldPos, 1.0);

    // let worldPos = corners[vIdx] + star.pos;
    // let pos = pos0 + vec4(corners[vIdx], 0.0);
    // pos.w /= pos.w;
  
    var uv = array<vec2<f32>, 6>(
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
    // TODO(@darzu): is this right?
    // let w = 1.0;
    // let h = 1.0;
    let w = max(1.0 / scene.canvasAspectRatio, 1.0);
    let h = max(scene.canvasAspectRatio, 1.0);

    // let xDist = input.uv.x 
    let dist = length(input.uv * vec2(w,h) - vec2(0.5));
    // TODO: what's the perf difference of alpha vs discard?
    if (dist > 0.5) {
      discard;
    }

    // let invDist = 0.5 / dist;
    // // let invDist = 1.0 / max(dist - 0.1, 0.001);
    // let color = input.color * invDist;

    var out: FragOut;

    out.emission = vec4<f32>(input.color * 0.5, 1.0);
    out.color = vec4<f32>(input.color * 2.0, 1.0);

    return out;
  }