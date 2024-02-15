struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) @interpolate(flat) color: vec3<f32>,
    // TODO(@darzu): This is probably overkill for outlines:
    // @location(2) @interpolate(flat) normal : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
};

// TODO(@darzu): simpler:
/*
@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var quad_pos = mat2x3<f32>(render_params.right, render_params.up) * in.quad_pos;
  var position = in.position + quad_pos * 0.01;
  var out : VertexOutput;
  out.position = render_params.modelViewProjectionMatrix * vec4<f32>(position, 1.0);
  out.color = in.color;
  out.quad_pos = in.quad_pos;
  return out;
}
*/

@vertex
fn vert_main(@builtin(vertex_index) gvIdx : u32) -> VertexOutput {
  let vIdx = gvIdx % 6u;
  let dotIdx = gvIdx / 6u;

  let dot = dotDatas.ms[dotIdx];
  let S = dot.size;

  let corners = array<vec3<f32>, 6>(
    vec3<f32>(-S, -S, 0.0),
    vec3<f32>(S, -S, 0.0),
    vec3<f32>(S, S, 0.0),
    vec3<f32>(-S, S, 0.0),
    vec3<f32>(-S, -S, 0.0),
    vec3<f32>(S, S, 0.0),
  );
  let corner = corners[vIdx];

  // TODO(@darzu): PERF! pre-compute these. put on scene uni
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
  // let back = normalize(vec3(
  //   scene.cameraViewProjMatrix[0][2], 
  //   scene.cameraViewProjMatrix[1][2], 
  //   scene.cameraViewProjMatrix[2][2]
  // ));

  let worldPos = dot.pos
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

  // let normal = -back;

  output.uv = uv[vIdx];
  output.worldPos = vec4(worldPos, 1.0);
  output.position = screenPos;
  // output.normal = normal;
  output.color = dot.color;

  return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) surface: vec2<u32>,
  @location(2) normal: vec4<f32>,
  @location(3) position: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  let dist = length(input.uv - vec2(0.5));
  // TODO(@darzu): PERF. what's the perf difference of alpha vs discard?
  if (dist > 0.5) {
    discard;
  }

  var out: FragOut;

  out.color = vec4<f32>(input.color, 1.0);

  out.position = input.worldPos;

  const fresnel = 0.0;

  // out.normal = vec4<f32>(normalize(input.normal), fresnel);
  // TODO(@darzu): hacky? just put the normal straight up
  out.normal = vec4<f32>(0.0, 0.0, 1.0, fresnel);

  // TODO(@darzu): ensure these r unique?
  out.surface.r = 777;
  out.surface.g = 777;

  return out;
}