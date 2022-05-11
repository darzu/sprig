import {
  SceneStruct,
  MeshUniformStruct,
  VertexStruct,
  RopePointStruct,
  RopeStickStruct,
  CLOTH_W,
} from "./pipelines.js";

export const obj_vertShader = () =>
  `
struct Scene {
  ${SceneStruct.wgsl(true)}
};

  struct Model {
      ${MeshUniformStruct.wgsl(true)}
  };

  @group(0) @binding(0) var<uniform> scene : Scene;
  @group(0) @binding(1) var dispSampler: sampler;
  @group(0) @binding(2) var dispTexture: texture_2d<f32>;

  @group(1) @binding(0) var<uniform> model : Model;

  struct VertexOutput {
      @location(0) @interpolate(flat) normal : vec3<f32>,
      @location(1) @interpolate(flat) color : vec3<f32>,
      @location(2) worldPos: vec4<f32>,
      @builtin(position) position : vec4<f32>,
  };

  @stage(vertex)
  fn main(
      ${VertexStruct.wgsl(false, 0)}
      ) -> VertexOutput {
      var output : VertexOutput;
      let worldPos: vec4<f32> = model.transform * vec4<f32>(position, 1.0);

      // let uvInt: vec2<i32> = vec2<i32>(5, 5);
      // let uvInt: vec2<i32> = vec2<i32>(10, i32(uv.x + 5.0));
      let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
      let texDisp = textureLoad(dispTexture, uvInt, 0);

      // let finalPos = worldPos;
      // let finalPos = vec4<f32>(worldPos.xy, worldPos.z + uv.x * 10.0, worldPos.w);
      let finalPos = vec4<f32>(worldPos.xyz + texDisp.xyz, 1.0);

      output.worldPos = finalPos;
      output.position = scene.cameraViewProjMatrix * finalPos;
      output.normal = normalize(model.transform * vec4<f32>(normal, 0.0)).xyz;
      // output.color = vec3<f32>(f32(uvInt.x), f32(uvInt.y), 1.0);
      // output.color = texDisp.rgb;
      // output.color = vec3(uv.xy, 1.0);
      output.color = color + model.tint;
      return output;
  }
`;

// TODO(@darzu): use dynamic background color
// [0.6, 0.63, 0.6]

// TODO(@darzu): DISP
export const obj_fragShader = () =>
  `
struct Scene {
  ${SceneStruct.wgsl(true)}
};

  @group(0) @binding(0) var<uniform> scene : Scene;
  @group(0) @binding(1) var dispSampler: sampler;
  @group(0) @binding(2) var dispTexture: texture_2d<f32>;

  struct VertexOutput {
      @location(0) @interpolate(flat) normal : vec3<f32>,
      @location(1) @interpolate(flat) color : vec3<f32>,
      @location(2) worldPos: vec4<f32>,
  };

  @stage(fragment)
  fn main(input: VertexOutput) -> @location(0) vec4<f32> {
      let light1 : f32 = clamp(dot(-scene.light1Dir, input.normal), 0.0, 1.0);
      let light2 : f32 = clamp(dot(-scene.light2Dir, input.normal), 0.0, 1.0);
      let light3 : f32 = clamp(dot(-scene.light3Dir, input.normal), 0.0, 1.0);
      let resultColor: vec3<f32> = input.color 
        * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
      let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));

      let fogDensity: f32 = 0.02;
      let fogGradient: f32 = 1.5;
      // let fogDist: f32 = 0.1;
      let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
      // output.fogVisibility = 0.9;
      let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);

      let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
      let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);
      return vec4<f32>(finalColor, 1.0);
      // return vec4<f32>(input.color, 1.0);
  }
`;

export const cloth_shader = () =>
  `
@group(0) @binding(1) var inTex : texture_2d<f32>;
@group(0) @binding(2) var outTex : texture_storage_2d<rgba32float, write>;

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
struct Scene {
  ${SceneStruct.wgsl(true)}
};

@group(0) @binding(0) var<uniform> scene : Scene;

struct RopePoint {
  ${RopePointStruct.wgsl(true)}
};
struct RopePoints {
  ropePoints : array<RopePoint>,
};

struct RopeStick {
  ${RopeStickStruct.wgsl(true)}
};
struct RopeSticks {
  ropeSticks : array<RopeStick>,
};

@group(0) @binding(1) var<storage, read_write> ropePoints : RopePoints;
@group(0) @binding(2) var<storage, read> ropeSticks : RopeSticks;

// todo: pick workgroup size based on max rope system?
@stage(compute) @workgroup_size(${CLOTH_W ** 2})
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var pIdx : u32 = GlobalInvocationID.x;

  let p = ropePoints.ropePoints[pIdx];

  // ropePoints.ropePoints[pIdx].locked = f32(pIdx) / 10.0;

  // let gravity = 0.0;
  let gravity = 0.00002;
  // let gravity = 0.00001;

  // this is setting color:
  // ropePoints.ropePoints[pIdx].position.z += 0.01;
  // ropePoints.ropePoints[pIdx].locked -= scene.time;

  if (p.locked < 0.5) {
    let newPrev = p.position;
    let delta = p.position - p.prevPosition;
    let newPos = p.position + delta * 0.9 + vec3(0.0, -1.0, 0.0) * gravity * scene.time * scene.time;

  // //   ropePoints.ropePoints[pIdx].position *= 1.002;
    ropePoints.ropePoints[pIdx].position = newPos;
    ropePoints.ropePoints[pIdx].prevPosition = newPrev;
  }
  
  workgroupBarrier();

  var i: u32 = 0u;
  loop {
    if i >= 8u { break; }

    let sIdx = GlobalInvocationID.x * 2u + (i % 2u);
    let stick = ropeSticks.ropeSticks[sIdx];
    let a = ropePoints.ropePoints[stick.aIdx];
    let b = ropePoints.ropePoints[stick.bIdx];

    if stick.bIdx >= ${CLOTH_W ** 2}u { continue; }

    // if sIdx >= 9u { continue; }

    let center = (a.position + b.position) / 2.0;
    let diff = a.position - b.position;
    let sep = (length(diff) - stick.length) * 0.5;
    let dir = normalize(diff);
    let walk = dir * (sep * 0.95);
    let offset = dir * stick.length / 2.0;

    // ropePoints.ropePoints[pIdx].locked = length(diff) / 7.0;
    // ropePoints.ropePoints[pIdx].locked = abs(sep * 0.8);

    // // ropePoints.ropePoints[stick.aIdx].locked += 0.01;
    // // ropePoints.ropePoints[stick.bIdx].locked += 0.01;

    // // ropePoints.ropePoints[sIdx].locked = f32(stick.aIdx); // / 10.0;

    // if (a.locked < 0.5) {
    if (a.locked < 0.5 && (i / 2u) % 2u == 0u) {
      ropePoints.ropePoints[stick.aIdx].position -= walk;
      // ropePoints.ropePoints[stick.aIdx].position = center + offset;
    }
    // if (b.locked < 0.5) {
    if (b.locked < 0.5 && (i / 2u) % 2u == 1u) {
      ropePoints.ropePoints[stick.bIdx].position += walk;
      // ropePoints.ropePoints[stick.bIdx].position = center - offset;
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
struct Scene {
  ${SceneStruct.wgsl(true)}
};

@group(0) @binding(0) var<uniform> scene : Scene;


struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec3<f32>,
};

@stage(vertex)
fn vert_main(
  @location(0) vertPos : vec3<f32>,
  @location(1) position : vec3<f32>,
  @location(2) prevPosition : vec3<f32>,
  // @location(3) locked : vec3<f32>,
  @location(3) locked : f32,
  // @location(4) aIdx: u32,
  // @location(5) bIdx: u32,
  // @location(6) length: f32,
) -> VertexOutput {
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
