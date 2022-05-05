import { mat4, vec3 } from "../gl-matrix.js";
import { align, sum } from "../math.js";
import { RopePoint, RopeStick, SceneUniform, Vertex } from "./mesh-pool.js";
import { shaderSceneStruct } from "./render_webgpu.js";

export module MeshUniformMod {
  export interface Data {
    readonly transform: mat4;
    readonly aabbMin: vec3;
    readonly aabbMax: vec3;
    readonly tint: vec3;
  }

  const _counts = [
    align(4 * 4, 4), // transform
    align(3, 4), // aabb min
    align(3, 4), // aabb max
    align(3, 4), // tint
  ];
  const _names = ["transform", "aabbMin", "aabbMax", "tint"];
  const _types = ["mat4x4<f32>", "vec3<f32>", "vec3<f32>", "vec3<f32>"];

  const _offsets = _counts.reduce((p, n) => [...p, p[p.length - 1] + n], [0]);

  export const byteSizeExact = sum(_counts) * Float32Array.BYTES_PER_ELEMENT;

  export const byteSizeAligned = align(byteSizeExact, 256); // uniform objects must be 256 byte aligned

  const scratch_f32 = new Float32Array(sum(_counts));
  const scratch_f32_as_u8 = new Uint8Array(scratch_f32.buffer);
  export function serialize(
    buffer: Uint8Array,
    byteOffset: number,
    d: Data
  ): void {
    scratch_f32.set(d.transform, _offsets[0]);
    scratch_f32.set(d.aabbMin, _offsets[1]);
    scratch_f32.set(d.aabbMax, _offsets[2]);
    scratch_f32.set(d.tint, _offsets[3]);
    buffer.set(scratch_f32_as_u8, byteOffset);
  }

  export function generateWGSLUniformStruct() {
    // Example:
    //     transform: mat4x4<f32>;
    //     aabbMin: vec3<f32>;
    //     aabbMax: vec3<f32>;
    //     tint: vec3<f32>;
    if (_names.length !== _types.length)
      throw `mismatch between names and sizes for mesh uniform format`;
    let res = ``;

    for (let i = 0; i < _names.length; i++) {
      const n = _names[i];
      const t = _types[i];
      res += `${n}: ${t},\n`;
    }

    return res;
  }

  export function CloneData(d: Data): Data {
    return {
      aabbMin: vec3.clone(d.aabbMin),
      aabbMax: vec3.clone(d.aabbMax),
      transform: mat4.clone(d.transform),
      tint: vec3.clone(d.tint),
    };
  }
}

export const obj_vertShader = () =>
  shaderSceneStruct() +
  `
    struct Model {
        ${MeshUniformMod.generateWGSLUniformStruct()}
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
        ${Vertex.GenerateWGSLVertexInputStruct()}
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
  shaderSceneStruct() +
  `
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
  // struct Params {
  //   filterDim : u32;
  //   blockDim : u32;
  // };
  
  // @group(0) @binding(0) var<uniform> params : Params;
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
  ${SceneUniform.generateWGSLUniformStruct()}
  };

  @group(0) @binding(0) var<uniform> scene : Scene;

  struct RopePoint {
    ${RopePoint.generateWGSLUniformStruct()}
  };
  struct RopePoints {
    ropePoints : array<RopePoint>,
  };

  struct RopeStick {
    ${RopeStick.generateWGSLUniformStruct()}
  };
  struct RopeSticks {
    ropeSticks : array<RopeStick>,
  };

  @group(0) @binding(1) var<storage, read_write> ropePoints : RopePoints;
  @group(0) @binding(2) var<storage, read> ropeSticks : RopeSticks;
  
  // todo: pick workgroup size based on max rope system?
  @stage(compute) @workgroup_size(10)
  fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    var pIdx : u32 = GlobalInvocationID.x;

    let p = ropePoints.ropePoints[pIdx];

    let gravity = 0.0001;

    // if (p.locked > 0.0) {
      // let newPrev = p.position;
      // let delta = p.position - p.prevPosition;
      // let newPos = p.position + delta * 0.1; // + vec3(0.0, -1.0, 0.0) * gravity * scene.time * scene.time;

      // ropePoints.ropePoints[pIdx].position *= 1.01;
      // ropePoints.ropePoints[pIdx].position = newPos;
      // ropePoints.ropePoints[pIdx].prevPosition = newPrev;
    // }
    
  }
  
  `;

// TODO(@darzu): ROPE
// Particle

export const particle_shader = () =>
  `
  ${shaderSceneStruct()}

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
    @location(3) locked : vec3<f32>,
    // @location(3) locked : f32,
  ) -> VertexOutput {
    // return vec4<f32>(vertPos, 1.0);
    // let worldPos = vertPos;
    let worldPos = vertPos * 0.5 + position;
    let screenPos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);

    // return vec4<f32>(vertPos, 1.0);
    // return vec4<f32>(vertPos + position, 1.0);

    var output : VertexOutput;
    output.position = screenPos;
    output.color = vec3<f32>(0.5, locked.r, 0.5);

    return output;
  }

  @stage(fragment)
  fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
  }

`;
