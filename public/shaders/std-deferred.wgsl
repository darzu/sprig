struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  let xs = vec2(-1.0, 1.0);
  let ys = vec2(-1.0, 1.0);
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.x),
    vec2<f32>(xs.y, ys.y),
    vec2<f32>(xs.x, ys.y),
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.y),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.uv = uv[VertexIndex];
  return output;
}


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

@fragment
fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  // TODO(@darzu): should do blinn material based on: https://youtu.be/esC1HnyD9Bk?list=PLplnkTzzqsZS3R5DjmCQsqupu43oS9CFN&t=2271

  // TODO(@darzu): Do we need to sample these? can't we just load them?
  var color = textureSample(colorTex, samp, uv).rgb;
  let alpha = 1.0;
  // TODO(@darzu): std-ocean and std-mesh store and use normal differently
  let normalAndFresnel = textureSample(normTex, samp, uv);
  let normal = normalAndFresnel.xyz;
  let hasFresnel = normalAndFresnel.w;
  let worldPos = textureSample(posTex, samp, uv).xyz;

  // read gerstner directly for normal:
  // let gerst = gerstner(worldPos.zx, scene.time);
  // let normal = gerst[1];

  // var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  var lightingIntensity = 0.0;
  let isUnlit = 0u;
  // TODO(@darzu): de-dupe light code w/ std-mesh?
  const fresnelFactor = 0.5;
  var fresnelIntensity = 0.0;
  // TODO(@darzu): Parameterize materials!! They shouldn't all use the same fresnel params..
  const fresnelColor = vec3(0.02,0.81,0.91);
  // TODO(@darzu): clean up fresnel
  const f0 = 0.02;
  for (var i: u32 = 0u; i < scene.numPointLights; i++) {
      let light = pointLights.ms[i];
      let toLight_ = light.position - worldPos;
      let lightDist = length(toLight_);
      let toLight = toLight_ / lightDist;
      let toCamera = scene.cameraPos - worldPos;
      let attenuation = 1.0 / (light.constant + light.linear * lightDist +
                                light.quadratic * lightDist * lightDist);
      let lightAng = clamp(dot(toLight, normal), 0.0, 1.0);
      let halfway = normalize(toLight + normal); // TODO(@darzu): use?!
      let cameraAng = clamp(dot(normalize(toCamera), normal), 0.0, 1.0);

      // TODO(@darzu): cascade selection is wrong
      // TODO(@darzu): too much extra math?
      // let shadowFullZ = (pointLights.ms[i].viewProjAll * vec4(worldPos, 1.0)).z;
      let shadowFull = (scene.cameraViewProjMatrix * vec4(worldPos, 1.0));
      let shadowFullZ = shadowFull.z / shadowFull.w;
      // var r = shadowFullZ;
      // var g = 0.0;
      // if (shadowFullZ > 0.99) {
      //   g = shadowFullZ;
      //   r = 0.0;
      // }
      // // var b = shadowFull.w;
      // var b = 0.0;
      // // if (shadowFullZ > 0.95) {
      // //   b = 1.0;
      // //   g = 0.0;
      // // }
      // return vec4(r, g, b, alpha);

      // TODO(@darzu): DBG: try outputing depth from camera as result?
      var cascadeIdx = 0u;
      var viewProj = pointLights.ms[i].viewProj0;
      if (shadowFullZ > light.depth0) {
        cascadeIdx = 1u;
        viewProj = pointLights.ms[i].viewProj1;
      }

      // XY is in (-1, 1) space, Z is in (0, 1) space
      let posFromLight = (viewProj * vec4(worldPos, 1.0)).xyz;
      
      // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
      let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
                                posFromLight.z
                                );
      // return vec4(shadowPos, alpha);

      let shadowVis = getShadowVis(shadowPos, normal, toLight, cascadeIdx);
      //lightingColor = lightingColor + clamp(abs((light.ambient * attenuation) + (light.diffuse * lightAng * attenuation * shadowVis)), vec3(0.0), vec3(1.0));
      //lightingColor += light.ambient;
      // lightingColor = lightingColor + f32(1u - isUnlit) 
      //   * ((light.ambient * attenuation) + (light.diffuse * lightAng * attenuation * shadowVis));
      lightingIntensity += (light.ambient.r * attenuation) 
        + (light.diffuse.r * lightAng * attenuation * shadowVis);

      // fresnelIntensity += (1.0 - cameraAng) * fresnelFactor;
      // Fresnel-Schlick ?
      fresnelIntensity += f0 + (1.0 - f0) * pow(1.0 - cameraAng, 5.0);
  }
  // TODO(@darzu): consider using this rim-lighting approach instead of this fersnel
  //      https://lettier.github.io/3d-game-shaders-for-beginners/rim-lighting.html

  // HACK: disables fresnel
  fresnelIntensity *= hasFresnel;


  // cel shading:
  // TODO(@darzu): kinda hacky to have seperate bands for these?
  // lightingIntensity = ceil(lightingIntensity * 10.0) / 10.0;
  // fresnelIntensity = ceil(fresnelIntensity * 5.0) / 5.0;

  var litColor = mix(
    color * lightingIntensity, 
    fresnelColor, 
  fresnelIntensity * 0.3); // * 0.5;

  let distanceToParty = length(scene.partyPos - scene.cameraPos);
  let inBubble = f32(distanceToParty < scene.bubbleRadius);
  const bubbleColor = vec3<f32>(0.02, 0.81, 0.91);
  litColor = mix(litColor, bubbleColor, inBubble * 0.1);
  
  
  return vec4(litColor, alpha);
}
