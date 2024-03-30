
struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) @interpolate(flat) color: vec4<f32>,
    @location(1) worldPos: vec4<f32>,
    @location(2) uv : vec2<f32>,
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

  // smooth out in the last 0.5 seconds
  let deathSmooth = smoothstep(0.0, 500.0, particle.life);
  var color = particle.color;
  color.a *= deathSmooth;
  var size = particle.size;
  size *= deathSmooth;

  let worldPos = particle.pos
    + right * corner.x * size
    + up * corner.y * size;

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
  output.color = color;

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

  // dither edges?
  // let clipProb = smoothstep(0.4, 0.5, dist);
  // if (rand() < clipProb) {
  //   discard;
  // }

  if (dist > 0.5) {
    discard;
  }

  
  var color = input.color;

  // rand_seed = floor(input.uv * 128) / 128; // quantize this for more stability?
  // let alphaDiscard = rand() > color.a;
  // if (alphaDiscard) {
  //   discard;
  // }
  // color.a = 1.0;


  var out: FragOut;

  out.color = color;

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