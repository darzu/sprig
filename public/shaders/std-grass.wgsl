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
    // let color = input.color;
    let normal = input.normal;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);
    
    let texY: i32 = i32(worldPos.x + 256.0);
    let texX: i32 = i32(worldPos.z + 512.0);
    let texCoord = vec2<i32>(texX, texY);

    // TODO(@darzu): process cut height correctly
    let cut = textureLoad(grassCut, texCoord, 0).x;
    let colorKey = textureLoad(landMap, texCoord, 0).x;
    let y = worldPos.y * min(1.3 - cut, 1.0);
    // let cutHeight = textureSample(grassCut, samp, worldPos.xz).x;
    var dispPos = vec4<f32>(worldPos.x + cos(worldPos.x + scene.time * 0.001) * y * 0.1, y, worldPos.z + sin(worldPos.z + scene.time * 0.001) * y * 0.1, worldPos.w);
    let windDisp = vec4<f32>(scene.windDir, 0);
    dispPos = dispPos + windDisp * y * 0.7;
    //let origHeight = worldPos.y;
    let toParty = dispPos.xyz - scene.partyPos;
    
    let cameraDist = length(dispPos.xyz - scene.cameraPos);
    let spawnF = 1.0 - smoothstep(meshUni.spawnDist - 5.0, meshUni.spawnDist, cameraDist);

    //let partyDirNorm = normalize(toParty);
    let zDist = dot(toParty, scene.partyDir);
    let zDisp = vec4<f32>(zDist * scene.partyDir * 10.0, 0);
    let zDist2 = smoothstep(10.0, 20.0, abs(zDist));

    let partyX = cross(scene.partyDir, vec3<f32>(0, 1, 0));
    let xDist = dot(toParty, partyX);
    let xDist2 = smoothstep(5.0, 10.0, abs(xDist));

    let yShrink = max(xDist2, zDist2);


    //let dist = xDist * 2 + zDist;
    //let newHeight = clamp((dist/10) * (dist/10) * origHeight, 0.1, origHeight);

    //let flattened = partyDirNorm * (origHeight - newHeight);
    //let newPos = vec4<f32>(worldPos.x + flattened.x, newHeight, worldPos.z + flattened.z, 0);
    //let partyDir = vec4<f32>(partyDirNorm.x, 0.0, partyDirNorm.z, 0.0);
    
    //let disp: vec4<f32> = vec4<f32>(0.0, xDist2 * 10, 0.0, 0.0);

      //vec4<f32>(
      //                                    cos(worldPos.x + scene.time * 0.001), cutHeight, sin(worldPos.z + scene.time * 0.001), 0) + zDisp;
      //partyDir * (1 / distToParty) * 500.0;

    //let dispPos = worldPos + disp * worldPos.y * 0.1;
    let flattenedDispPos = vec4<f32>(dispPos.x, dispPos.y * yShrink * spawnF, dispPos.z, dispPos.w);

    output.worldPos = flattenedDispPos;
    output.position = scene.cameraViewProjMatrix * output.worldPos;
    // TODO: use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;

    // output.color = color + meshUni.tint;

    var color = meshUni.tint.xyz;
    // output.color = meshUni.tint;
    // TODO: this is bad
    // rand_seed = worldPos.xz;
    // let rr = rand();
    // let rg = rand();
    // let rb = rand();
    // let randV3 = vec3<f32>(rr - 0.5, rg - 0.5, rb - 0.5);
    // var color: vec3<f32>;
    // if (colorKey < 0.1) {
    //   color = vec3<f32>(0.1, 0.5, 0.1) + randV3 * 0.1;
    // } else if (colorKey < 0.6) {
    //   color = vec3<f32>(0.2, 0.1, 0.2) + randV3 * 0.1;
    // } else {
    //   color = vec3<f32>(0.5, 0.1, 0.1) + randV3 * 0.1;
    // }
    // // color *= spawnF;
    // color *= 2.0;
    if (cut > 0.1) {
      color *= 0.2;
    }
    // let secRand = rand();
    // if (secRand < 0.05) {
    //   color = scene.secColor; //  + vec3<f32>(0.5);
    // } else if (secRand < 0.07) {
    //   color = scene.terColor;
    // }
    output.color = color;
    output.surface = input.surfaceId;
    output.id = meshUni.id;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) surface: vec2<u32>,
}

// const shadowDepthTextureSize = 2048.0;

// fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
//   return textureSampleCompare(shadowMap0, shadowSampler, pos, depth);
// }

// fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
//   // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
//   // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
//   let shadowBias = 0.0002;
//   let shadowDepth = shadowPos.z; // * f32(shadowPos.z <= 1.0);
//   let outsideShadow = 1.0 - f32(0.0 < shadowPos.x && shadowPos.x < 1.0 
//                 && 0.0 < shadowPos.y && shadowPos.y < 1.0);

//   var visibility : f32 = 0.0;
//   let oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;
//   for (var y : i32 = -1 ; y <= 1 ; y = y + 1) {
//       for (var x : i32 = -1 ; x <= 1 ; x = x + 1) {
//           let offset : vec2<f32> = vec2<f32>(
//           f32(x) * oneOverShadowDepthTextureSize,
//           f32(y) * oneOverShadowDepthTextureSize);

//           visibility = visibility + sampleShadowTexture(shadowPos.xy + offset, shadowDepth - shadowBias, index);
//       }
//   }
//   visibility = visibility / 9.0;
//   visibility = min(outsideShadow + visibility, 1.0);

//   return visibility;
// }

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = normalize(input.normal);

    // var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    // let unlit = meshUni.flags & (1u >> 0u);
    // TODO(@darzu): re-enable multi-point lights
    // for (var i: u32 = 0u; i < scene.numPointLights; i++) {
    // let light = pointLights.ms[0];
    // let toLight = normalize(light.position - input.worldPos.xyz);
    // // let distance = length(toLight);
    // let attenuation = 1.0 / light.constant;
    // let angle = clamp(dot(toLight, normal), 0.0, 1.0);
    // let posFromLight = (pointLights.ms[0].viewProj * input.worldPos).xyz;
    //  // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
    // let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5), posFromLight.z);
    // let shadowVis = getShadowVis(shadowPos, input.normal, toLight, 0);
    // let lightingColor = (light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis);
    // // }
    // let litColor = input.color * lightingColor;

    var out: FragOut;
    // out.color = vec4<f32>(litColor, 1.0);
    out.color = vec4<f32>(input.color, 1.0);

    const fresnel = 0.0;

    out.normal = vec4<f32>(normalize(input.normal), fresnel);
    // out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 0.0)).xyz), 1.0);
    out.surface.r = input.surface;
    out.surface.g = input.id;

    return out;
}
