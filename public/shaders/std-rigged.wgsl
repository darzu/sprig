struct VertexOutput {
  @location(0) @interpolate(flat) normal : vec3<f32>,
  @location(1) @interpolate(flat) color  : vec3<f32>,
  @location(2) worldPos : vec4<f32>,
  @location(3) @interpolate(flat) surface : u32,
  @location(4) @interpolate(flat) id : u32,
  @builtin(position) position : vec4<f32>,
};

@vertex fn vert_main(input : VertexInput)->VertexOutput {
  let idMatrix = mat4x4<f32>(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
                             1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
  let position = vec4<f32>(input.position, 1.0);
  let color = input.color;
  let normal = vec4<f32>(input.normal, 0.0);

  var output : VertexOutput;

  let skinMatrix =
      joints.ms[input.jointIds[0]].jointMatrix * input.jointWeights[0] +
      joints.ms[input.jointIds[1]].jointMatrix * input.jointWeights[1] +
      joints.ms[input.jointIds[2]].jointMatrix * input.jointWeights[2] +
      joints.ms[input.jointIds[3]].jointMatrix * input.jointWeights[3];

  // let skinMatrix = idMatrix;

  // let skinMatrix = joints.ms[input.jointIds[0]].jointMatrix;

  let jointTransformedPosition = skinMatrix * position;
  let jointTransformedNormal = skinMatrix * normal;

  // var jointTransformedPosition = vec4<f32>(0.0);
  // for (var i: u32 = 1; i < 4; i++) {
  //     let jointId = input.jointIds[i];
  //     let jointMatrix = joints.ms[jointId].jointMatrix;
  //     // let jointMatrix = mat4x4<f32>(1.0, 0.0, 0.0, 0.0,
  //     //                               0.0, 1.0, 0.0, 0.0,
  //     //                               0.0, 0.0, 1.0, 0.0,
  //     //                               0.0, 0.0, 0.0, 1.0);
  //     jointTransformedPosition += jointMatrix * position *
  //     input.jointWeights[i];
  // }

  let worldPos : vec4<f32> = meshUni.transform * jointTransformedPosition;

  output.worldPos = worldPos;
  output.position = scene.cameraViewProjMatrix * worldPos;
  output.normal = (meshUni.transform * jointTransformedNormal).xyz;
  output.color =
      color +
      meshUni.tint; //+ vec3<f32>(0.1, 0.0, 0.0)* f32(input.jointIds[0]);

  output.surface = input.surfaceId;
  output.id = meshUni.id;

  return output;
}

struct FragOut {
  @location(0) color : vec4<f32>,
  @location(1) normal : vec4<f32>,
  @location(2) position : vec4<f32>,
  @location(3) surface : vec2<u32>,
}

@fragment fn
frag_main(input : VertexOutput)
    ->FragOut {
  let normal = normalize(input.normal);
  var out : FragOut;
  out.color = vec4<f32>(input.color, 1.0);
  out.position = input.worldPos;

  const fresnel = 0.0;

  out.normal = vec4<f32>(normalize(input.normal), fresnel);
  out.surface.r = input.surface;
  out.surface.g = input.id;

  return out;
}
