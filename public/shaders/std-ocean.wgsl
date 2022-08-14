struct VertexOutput {
  // TODO(@darzu): change
    @location(0) @interpolate(flat) normal : vec3<f32>,
    @location(1) @interpolate(flat) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) @interpolate(flat) surface: u32,
    @location(5) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

const shadowDepthTextureSize = 2048.0;
// const shadowDepthTextureSize = vec2<f32>(textureDimensions(shadowMap, 0.0));

fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
    if (index == 0) {
        return textureSampleCompare(shadowMap0, shadowSampler, pos, depth);
    } else if (index == 1) {
        return textureSampleCompare(shadowMap1, shadowSampler, pos, depth);
    } else {
        return textureSampleCompare(shadowMap2, shadowSampler, pos, depth);
    }
}

fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
  // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
  // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
    //let shadowBias = 0.007;
    //let shadowBias = 0.001;
    //let shadowBias = max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);
  let shadowBias = 0.0001;
  let shadowDepth = shadowPos.z; // * f32(shadowPos.z <= 1.0);
  let outsideShadow = 1.0 - f32(0.0 < shadowPos.x && shadowPos.x < 1.0 
                && 0.0 < shadowPos.y && shadowPos.y < 1.0);
  //let shadowSamp = sampleShadowTexture(shadowPos.xy, shadowDepth - shadowBias, index);

  //Percentage-closer filtering. Sample texels in the region
  //to smooth the result.
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
  // var visibility = textureSampleCompare(shadowMap, shadowSampler, 
  //                                       shadowPos.xy, shadowDepth - shadowBias);
 
  visibility = min(outsideShadow + visibility, 1.0);

  return visibility;
}


@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let uv = input.uv;
    let color = input.color;
    let normal = input.normal;

    var output : VertexOutput;
    let worldPos: vec4<f32> = oceanUni.transform * vec4<f32>(position, 1.0);

    let finalPos = worldPos;

    output.worldPos = finalPos;
    output.position = scene.cameraViewProjMatrix * finalPos;
    // TODO: use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    output.normal = normalize(oceanUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.color = color + oceanUni.tint;

    output.surface = input.surfaceId;
    output.id = oceanUni.id;

    output.uv = uv;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = normalize(input.normal);

    var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    let unlit = 0u;
    for (var i: u32 = 0u; i < scene.numPointLights; i++) {
        let light = pointLights.ms[i];
        let toLight = light.position - input.worldPos.xyz;
        let distance = length(toLight);
        let attenuation = 1.0 / (light.constant + light.linear * distance +
                                 light.quadratic * distance * distance);
        let angle = clamp(dot(normalize(toLight), input.normal), 0.0, 1.0);
     // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight = (pointLights.ms[i].viewProj * input.worldPos).xyz;
        
        // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
        let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
                                  posFromLight.z
                                  );
        let shadowVis = getShadowVis(shadowPos, input.normal, normalize(toLight), i);
        //lightingColor = lightingColor + clamp(abs((light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis)), vec3(0.0), vec3(1.0));
        //lightingColor += light.ambient;
        lightingColor = lightingColor + f32(1u - unlit) * ((light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis));
    }
    let litColor = input.color * (lightingColor + vec3(f32(unlit)));

    
    var out: FragOut;
    out.color = vec4<f32>(litColor, 1.0);

    return out;
}
