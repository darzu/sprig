
struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) @interpolate(flat) color: vec3<f32>,
    @location(2) worldPos: vec4<f32>,
};

@vertex
fn vert_main(vert: VertexInput, particle: InstanceInput, @builtin(vertex_index) gvIdx : u32, ) -> VertexOutput {
  let vIdx = gvIdx % 6u;

  let corner = vert.pos;

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

  let worldPos = particle.pos
    + right * corner.x * particle.size
    + up * corner.y * particle.size;

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

  output.uv = uv[vIdx];
  output.worldPos = vec4(worldPos, 1.0);
  output.position = screenPos;
  output.color = particle.color;

  return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  // @location(1) surface: vec2<u32>,
  // @location(2) normal: vec4<f32>,
  // @location(3) position: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
  let dist = length(input.uv - vec2(0.5));
  if (dist > 0.5) {
    discard;
  }

  var out: FragOut;

  out.color = vec4<f32>(input.color, 1.0);

  // out.position = input.worldPos;
  // const fresnel = 0.0;
  // out.normal = vec4<f32>(normalize(input.normal), fresnel);
  // TODO(@darzu): hacky? just put the normal straight up
  // out.normal = vec4<f32>(0.0, 0.0, 1.0, fresnel);
  // TODO(@darzu): ensure these r unique?
  // out.surface.r = 777;
  // out.surface.g = 777;

  return out;
}