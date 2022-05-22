import { CLOTH_W } from "./pipelines.js";

export const cloth_shader = () =>
  `
// @group(0) @binding(1) var inTex : texture_2d<f32>;
// @group(0) @binding(2) var outTex : texture_storage_2d<rgba32float, write>;

@stage(compute) @workgroup_size(10, 10)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  // var index : u32 = GlobalInvocationID.x;

  // let dims : vec2<i32> = textureDimensions(inTex, 0);

  // let uv: vec2<f32> = vec2<f32>(0.5, 0.5);

  // let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
  let uvInt: vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
  let texDisp = textureLoad(inTex, uvInt, 0);

  // textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz + vec3<f32>(0.01), 1.0));
  textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz * 1.01, 1.0));
}

`;

export const rope_shader = () =>
  `
// todo: pick workgroup size based on max rope system?
@stage(compute) @workgroup_size(${CLOTH_W ** 2})
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pIdx : u32 = GlobalInvocationID.x;

  let p = ropePoints.ms[pIdx];

  // ropePoints.ms[pIdx].locked = f32(pIdx) / 10.0;

  // let gravity = 0.0;
  let gravity = 0.00002;
  // let gravity = 0.00001;

  // this is setting color:
  // ropePoints.ms[pIdx].position.z += 0.01;
  // ropePoints.ms[pIdx].locked -= scene.time;

  if (p.locked < 0.5) {
    let newPrev = p.position;
    let delta = p.position - p.prevPosition;
    let newPos = p.position + delta * 0.9 + vec3(0.0, -1.0, 0.0) * gravity * scene.time * scene.time;

  // //   ropePoints.ms[pIdx].position *= 1.002;
    ropePoints.ms[pIdx].position = newPos;
    ropePoints.ms[pIdx].prevPosition = newPrev;
  }
  
  workgroupBarrier();

  var i: u32 = 0u;
  loop {
    if i >= 8u { break; }

    let sIdx = GlobalInvocationID.x * 2u + (i % 2u);
    let stick = ropeSticks.ms[sIdx];
    let a = ropePoints.ms[stick.aIdx];
    let b = ropePoints.ms[stick.bIdx];

    if stick.bIdx >= ${CLOTH_W ** 2}u { continue; }

    // if sIdx >= 9u { continue; }

    let center = (a.position + b.position) / 2.0;
    let diff = a.position - b.position;
    let sep = (length(diff) - stick.length) * 0.5;
    let dir = normalize(diff);
    let walk = dir * (sep * 0.95);
    let offset = dir * stick.length / 2.0;

    // ropePoints.ms[pIdx].locked = length(diff) / 7.0;
    // ropePoints.ms[pIdx].locked = abs(sep * 0.8);

    // // ropePoints.ms[stick.aIdx].locked += 0.01;
    // // ropePoints.ms[stick.bIdx].locked += 0.01;

    // // ropePoints.ms[sIdx].locked = f32(stick.aIdx); // / 10.0;

    // if (a.locked < 0.5) {
    if (a.locked < 0.5 && (i / 2u) % 2u == 0u) {
      ropePoints.ms[stick.aIdx].position -= walk;
      // ropePoints.ms[stick.aIdx].position = center + offset;
    }
    // if (b.locked < 0.5) {
    if (b.locked < 0.5 && (i / 2u) % 2u == 1u) {
      ropePoints.ms[stick.bIdx].position += walk;
      // ropePoints.ms[stick.bIdx].position = center - offset;
    }

    continuing {
      // TODO: bad perf ?
      workgroupBarrier();
      i++;
    }
  }

}

`;

export const particle_shader = () =>
  `
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec3<f32>,
};

@stage(vertex)
fn vert_main(vIn: VertexInput, iIn: InstanceInput) -> VertexOutput {
  let vertPos = vIn.position;
  let position = iIn.position;
  let prevPosition = iIn.prevPosition;
  let locked = iIn.locked;

  // return vec4<f32>(vertPos, 1.0);
  // let worldPos = vertPos;
  let worldPos = vertPos * 0.3 + position;
  let screenPos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);

  // return vec4<f32>(vertPos, 1.0);
  // return vec4<f32>(vertPos + position, 1.0);

  var output : VertexOutput;
  output.position = screenPos;
  output.color = vec3<f32>(locked, 0.0, 0.0);
  // output.color = vec3<f32>(0.0, f32(bIdx) / 10.0, locked);
  // output.color = vec3<f32>(f32(aIdx) / 10.0, 0.0, locked);
  // output.color = vec3<f32>(f32(aIdx) / 10.0, f32(bIdx) / 10.0, locked);
  // output.color = vec3<f32>(0.5, locked, 0.5);
  // output.color = vec3<f32>(0.5, locked.r, 0.5);

  return output;
}

@stage(fragment)
fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;
