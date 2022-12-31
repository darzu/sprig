struct VertexOutput {
    @location(0) @interpolate(flat) normal : vec3<f32>,
    @location(1) @interpolate(flat) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) @interpolate(flat) surface: u32,
    @location(4) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;
    let normal = input.normal;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    // TODO: use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.color = color + meshUni.tint;

    output.surface = input.surfaceId;
    output.id = meshUni.id;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) surface: vec2<u32>,
}

const shadowDepthTextureSize = 2048.0;

fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
  return textureSampleCompare(shadowMap0, shadowSampler, pos, depth);
}

fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
  // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
  // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
  let shadowBias = 0.0002;
  let shadowDepth = shadowPos.z; // * f32(shadowPos.z <= 1.0);
  let outsideShadow = 1.0 - f32(0.0 < shadowPos.x && shadowPos.x < 1.0 
                && 0.0 < shadowPos.y && shadowPos.y < 1.0);

  var visibility : f32 = 0.0;
  let oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;
  for (var y : i32 = -1 ; y <= 1 ; y = y + 1) {
      for (var x : i32 = -1 ; x <= 1 ; x = x + 1) {
          let offset : vec2<f32> = vec2<f32>(
          f32(x) * oneOverShadowDepthTextureSize,
          f32(y) * oneOverShadowDepthTextureSize);

          visibility = visibility + sampleShadowTexture(shadowPos.xy + offset, shadowDepth - shadowBias, index);
      }
  }
  visibility = visibility / 9.0;
  visibility = min(outsideShadow + visibility, 1.0);

  return visibility;
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = normalize(input.normal);

    // var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    // let unlit = meshUni.flags & (1u >> 0u);
    // TODO(@darzu): re-enable multi-point lights
    // for (var i: u32 = 0u; i < scene.numPointLights; i++) {
    let light = pointLights.ms[0];
    let toLight = normalize(light.position - input.worldPos.xyz);
    // let distance = length(toLight);
    let attenuation = 1.0 / light.constant;
    let angle = clamp(dot(toLight, normal), 0.0, 1.0);
    let posFromLight = (pointLights.ms[0].viewProj * input.worldPos).xyz;
     // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
    let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5), posFromLight.z);
    let shadowVis = getShadowVis(shadowPos, input.normal, toLight, 0);
    let lightingColor = (light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis);
    // }
    let litColor = input.color * lightingColor;

    var out: FragOut;
    out.color = vec4<f32>(litColor, 1.0);

    out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 0.0)).xyz), 1.0);
    out.surface.r = input.surface;
    out.surface.g = input.id;

    return out;
}
