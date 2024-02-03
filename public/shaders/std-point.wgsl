struct VertexOutput {
    @location(0) @interpolate(flat) color: vec3<f32>,
    // @location(1) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
    @location(1) @interpolate(flat) normal: vec3<f32>,
    @location(2) @interpolate(flat) worldPos: vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;

    let normal = input.normal;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    // output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    output.color = color + meshUni.tint;

    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.worldPos = worldPos;

    // TODO(@darzu): instead of this depth bias, we should do a surface check
    output.position.w += 0.1;

    return output;
}

struct FragOut {
  @location(0) mask: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) color2: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  var alpha: f32 = 1.0;

  var color = input.color;

  let normal = input.normal;
  let worldPos = input.worldPos.xyz;


  var lightingIntensity = 0.0;
  for (var i: u32 = 0u; i < scene.numPointLights; i++) {
    let light = pointLights.ms[i];
    let toLight_ = light.position - worldPos;
    let lightDist = length(toLight_);
    let toLight = toLight_ / lightDist;
    let attenuation = 1.0 / (light.constant + light.linear * lightDist +
                              light.quadratic * lightDist * lightDist);
    let lightAng = clamp(dot(toLight, normal), 0.0, 1.0);

    lightingIntensity += (light.ambient.r * attenuation) 
      + (light.diffuse.r * lightAng * attenuation);
  }

  var litColor = color * lightingIntensity;

  var out: FragOut;

  out.color = vec4(litColor, alpha);
  // out.color = vec4(color, alpha);
  // out.color = vec4(normal.xyz, alpha);
  // out.color = vec4(normal.xyz, alpha);
  out.color2 = vec4(litColor, alpha);
  out.mask = vec4(1.0);
  
  return out;
}
