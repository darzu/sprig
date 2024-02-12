struct VertexOutput {
    @location(0) color: vec3<f32>,
    // @location(1) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) @interpolate(flat) objId: u32,
    @location(4) screenSize: f32,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;

    let normal = input.normal;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    // output.worldPos = worldPos;
    let screenPos = scene.cameraViewProjMatrix * worldPos;

    // TODO(@darzu): PERF! Put on scene uni.
    let right = normalize(vec3(
      scene.cameraViewProjMatrix[0][0], 
      scene.cameraViewProjMatrix[1][0], 
      scene.cameraViewProjMatrix[2][0],
    ));

    // const S = 1.0; 

    let worldPos2 = worldPos.xyz + meshUni.size * right;
    
    // TODO(@darzu): PERF. Somehow using the depth buffer could maybe be a cheaper way to do this?
    let screenPos2 = scene.cameraViewProjMatrix * vec4(worldPos2, 1.0); 
    let screenSize = distance(screenPos.xy / screenPos.w, screenPos2.xy / screenPos2.w) // NOTE: in NDC, should be [0-2]
      // *0.5  // bring into 0-1, easier to visualize
      ;

    output.position = screenPos;
    output.color = color + meshUni.tint;
    // output.color = vec3(screenSize, 0.0, 0.0);

    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.worldPos = worldPos;

    // TODO(@darzu): instead of this depth bias, we should do a surface check
    // output.position.w += 0.1;
    
    output.objId = meshUni.id;
    output.screenSize = screenSize;

    return output;
}

struct FragOut {
  @location(0) mask: vec4<f32>,
  @location(1) color: vec4<f32>,
  // @location(2) color2: vec4<f32>,
  // @location(2) surface: vec2<u32>,
}

// TODO(@darzu): DEDUP: w/ deffered.wgsl
const shadowDepthTextureSize = 2048.0;

fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
  return textureSampleCompare(shadowMap, shadowSampler, pos, index, depth);
}

fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
  if (scene.highGraphics == 0u) {
    return 1.0;
  }

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

          visibility += sampleShadowTexture(shadowPos.xy + offset, shadowDepth - shadowBias, index);
      }
  }
  visibility = visibility / 9.0;
  visibility = min(outsideShadow + visibility, 1.0);

  return visibility;
}

// TODO(@darzu): this isn't working for some reason..
// override backface: bool = true;

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  var alpha: f32 = 1.0;

  var color = input.color;

  let normal = normalize(input.normal); // TODO(@darzu): BUG. these should already be normalized
  // let normal = input.normal;
  let worldPos = input.worldPos.xyz;

  let toCamera = normalize(scene.cameraPos - worldPos);
  if (((meshUni.flags & 1) != 0) && dot(normal, toCamera) < 0) {
     discard; // back-face cull
  }

  var lightingIntensity = 0.0;
  let isUnlit = 0;
  for (var i: u32 = 0u; i < scene.numPointLights; i++) {
      let light = pointLights.ms[i];
      let toLight_ = light.position - worldPos;
      let lightDist = length(toLight_);
      let toLight = toLight_ / lightDist;
      let attenuation = 1.0 / (light.constant + light.linear * lightDist +
                                light.quadratic * lightDist * lightDist);
      let lightAng = clamp(dot(toLight, normal), 0.0, 1.0);
      let halfway = normalize(toLight + normal); // TODO(@darzu): use?!
      let cameraAng = clamp(dot(toCamera, normal), 0.0, 1.0);
      let shadowFull = (scene.cameraViewProjMatrix * vec4(worldPos, 1.0));
      let shadowFullZ = shadowFull.z / shadowFull.w;
      var cascadeIdx = 0u;
      var viewProj = pointLights.ms[i].viewProj0;
      if (shadowFullZ > light.depth0) {
        cascadeIdx = 1u;
        viewProj = pointLights.ms[i].viewProj1;
      }
      let posFromLight = (viewProj * vec4(worldPos, 1.0)).xyz;
      let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
                                posFromLight.z
                                );
      let shadowVis = getShadowVis(shadowPos, normal, toLight, cascadeIdx);
      const specStr = 0.5;
      let refl = reflect(-toLight, normal);
      let specTerm = specStr * pow(max(dot(toCamera, refl), 0.0), 256);
      lightingIntensity += (light.ambient.r * attenuation) 
        + (light.diffuse.r * lightAng * attenuation * shadowVis)
        + (specTerm);
  }

  var litColor = color * lightingIntensity;

  let centerXY = vec2<i32>(input.position.xy);
  let centerObj: u32 = textureLoad(surfTex, centerXY, 0).g;
  if (input.objId != centerObj) {
    discard;
  }

  var out: FragOut;

  out.color = vec4(litColor, alpha);
  // out.color = vec4(input.color, 1.0);

  // out.color = vec4(color, alpha);
  // out.color = vec4(normal.xyz, alpha);
  // out.color = vec4(normal.xyz, alpha);
  // out.color2 = vec4(litColor, alpha);
  // TODO(@darzu): PERF. don't need size and mask i think
  out.mask = vec4(
    1.0, //mask bit
    input.screenSize, // ish
    0.0, 0.0); 

  // out.surface.r = 1;
  // out.surface.g = input.objId;
  
  return out;
}
