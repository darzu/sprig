struct VertexOutput {
  @location(0) uv : vec2<f32>,
    @location(1) worldPos: vec4<f32>,
    @location(2) normal: vec3<f32>,
    @builtin(position) position : vec4<f32>,
  
};

@vertex fn vert_main(input : VertexInput)->VertexOutput {
  var output : VertexOutput;
  let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(input.position, 1.0);
  let normal =  meshUni.transform * vec4<f32>(input.normal, 0.0);

  output.worldPos = worldPos;
  output.position = scene.cameraViewProjMatrix * worldPos;
  output.uv = input.uv;
  output.normal = normal.xyz;
  return output;
}

struct FragOut {
  @location(0) color : vec4<f32>,
  @location(1) emissive : vec4<f32>,
}

@fragment fn frag_main(input : VertexOutput) ->FragOut {
  var out : FragOut;
  let dims : vec2<i32> = vec2<i32>(textureDimensions(noiseTex));
  let dimsF = vec2<f32>(dims);
  let time = ((scene.time % 60000) / 60000) * 2 * 3.141;
  let u = input.uv.x * (0.8 + ((cos(time) + 1) / 2) / 5);
  let v = input.uv.y * (0.8 + ((sin(time) + 1) / 2) / 5);
  let coord = vec2<f32>(u, v) * dimsF;
  let noise = textureLoad(noiseTex, vec2<i32>(coord), 0).r * (0.8 + ((sin(time) + 1) / 2) / 5);

  let toCamera = scene.cameraPos - input.worldPos.xyz;
  let cameraAng = clamp(abs(dot(normalize(toCamera), normalize(input.normal))), 0.0, 1.0);
  const f0 = 0.002;

  let fresnelIntensity = f0 + (1.0 - f0) * pow(1.0 - cameraAng, 7.0);

  // ENDESGA16 light blue
  let color = vec3<f32>(0.02, 0.81, 0.91);
  out.color = vec4<f32>(color * noise, fresnelIntensity * 0.7);
  out.emissive = vec4<f32>(color * noise, clamp(fresnelIntensity * 0.7, 0.05, 0.7));
  return out;
}
