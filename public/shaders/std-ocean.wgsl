struct VertexOutput {
    // TODO(@darzu): can we get rid of worldPos if we do our own depth invert?
    // @location(0) @interpolate(flat) normal : vec3<f32>,
    // @location(1) @interpolate(flat) color : vec3<f32>,
    // @location(2) @interpolate(flat) worldPos: vec4<f32>,
    // @location(3) @interpolate(flat) uv: vec2<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) @interpolate(flat) surface: u32,
    @location(5) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

// const shadowDepthTextureSize = 2048.0;
// const shadowDepthTextureSize = vec2<f32>(textureDimensions(shadowMap, 0.0));

// fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
//   // TODO(@darzu): re-enable multi-shadow? probably w/ option
//     // if (index == 0) {
//         return textureSampleCompare(shadowMap0, shadowSampler, pos, depth);
//     // } else if (index == 1) {
//     //     return textureSampleCompare(shadowMap1, shadowSampler, pos, depth);
//     // } else {
//     //     return textureSampleCompare(shadowMap2, shadowSampler, pos, depth);
//     // }
// }

// TODO(@darzu): de-dupe w/ std-mesh
// fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
//   // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
//   // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
//     //let shadowBias = 0.007;
//     //let shadowBias = 0.001;
//     //let shadowBias = max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);
//   let shadowBias = 0.0002;
//   let shadowDepth = shadowPos.z; // * f32(shadowPos.z <= 1.0);
//   let outsideShadow = 1.0 - f32(0.0 < shadowPos.x && shadowPos.x < 1.0 
//                 && 0.0 < shadowPos.y && shadowPos.y < 1.0);
//   //let shadowSamp = sampleShadowTexture(shadowPos.xy, shadowDepth - shadowBias, index);

//   //Percentage-closer filtering. Sample texels in the region
//   //to smooth the result.
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
//   // var visibility = textureSampleCompare(shadowMap, shadowSampler, 
//   //                                       shadowPos.xy, shadowDepth - shadowBias);
 
//   visibility = min(outsideShadow + visibility, 1.0);

//   return visibility;
// }

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let uv = input.uv;
    let color = input.color;
    let normal = input.normal;
    let tangent = input.tangent;
    // let normal = vec3<f32>(0.0, 0.0, 1.0);
    // let tangent = vec3<f32>(1.0, 0.0, 0.0);
    let perp = cross(tangent, normal);

    // let flattenedPos = vec3<f32>(uv.x - 1.0, 0, uv.y) * 1000;
    // TODO(@darzu): we're not totally sure about x,y,z vs normal,tangent,perp
    let surfBasis = mat3x3<f32>(tangent/*+x*/, perp/*+y*/, normal/*+z*/);
    // TODO(@darzu): PERF. don't transform twice..
    let oldWorldPos = meshUni.transform * vec4<f32>(position, 1.0);
    let gerst = gerstner(oldWorldPos.xy, scene.time);
    // let gerst = gerstner(uv * 1000, scene.time * .001);

    // let displacedPos = position;
    let displacedPos = position + surfBasis * gerst[0];

    // TODO(@darzu): oh hmm the UVs also need to be displaced

    //let displacedPos = flattenedPos + gerst[0];
    let gerstNormal = surfBasis * gerst[1];
    //let gerstNormal = gerst[1];
    // let displacedPos = flattenedPos + wave1;
    // let displacedPos = position + wave0;
    // let displacedPos = position + wave1;
    // let displacedPos = flattenedPos + wave0 + wave0a;// wave0 + wave0a + wave1; //+ wave2;

    var output : VertexOutput;
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(displacedPos, 1.0);

    let finalPos = worldPos;

    output.worldPos = finalPos;
    output.position = scene.cameraViewProjMatrix * finalPos;
    // TODO: use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    //output.normal = normalize(meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.normal = normalize(meshUni.transform * vec4<f32>(gerstNormal, 0.0)).xyz;
    output.color = color + meshUni.tint;
    // output.color = tangent; // DBG TANGENT
    //output.color = output.normal;
    output.surface = input.surfaceId;
    output.id = meshUni.id;

    output.uv = uv;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) position: vec4<f32>,
  @location(3) surface: vec2<u32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    // let normal = normalize(input.normal);

    // read gerstner directly for normal:
    // let gerst = gerstner(input.worldPos.zx, scene.time);
    // let normal = gerst[1];

    // var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    // var lightingIntensity = 0.0;
    // let isUnlit = 0u;
    // // TODO(@darzu): de-dupe light code w/ std-mesh?
    // const fresnelFactor = 0.5;
    // var fresnelIntensity = 0.0;
    // const fresnelColor = vec3(0.02,0.81,0.91);
    // // TODO(@darzu): clean up fresnel
    // const f0 = 0.02;
    // for (var i: u32 = 0u; i < scene.numPointLights; i++) {
    //     let light = pointLights.ms[i];
    //     let toLight_ = light.position - input.worldPos.xyz;
    //     let lightDist = length(toLight_);
    //     let toLight = toLight_ / lightDist;
    //     let toCamera = scene.cameraPos - input.worldPos.xyz;
    //     let attenuation = 1.0 / (light.constant + light.linear * lightDist +
    //                              light.quadratic * lightDist * lightDist);
    //     let lightAng = clamp(dot(toLight, normal), 0.0, 1.0);
    //     let halfway = normalize(toLight + normal); // TODO(@darzu): use?!
    //     let cameraAng = clamp(dot(normalize(toCamera), normal), 0.0, 1.0);
    //     // XY is in (-1, 1) space, Z is in (0, 1) space
    //     let posFromLight = (pointLights.ms[i].viewProj * input.worldPos).xyz;
        
    //     // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
    //     let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
    //                               posFromLight.z
    //                               );
    //     let shadowVis = getShadowVis(shadowPos, normal, toLight, i);
    //     //lightingColor = lightingColor + clamp(abs((light.ambient * attenuation) + (light.diffuse * lightAng * attenuation * shadowVis)), vec3(0.0), vec3(1.0));
    //     //lightingColor += light.ambient;
    //     // lightingColor = lightingColor + f32(1u - isUnlit) 
    //     //   * ((light.ambient * attenuation) + (light.diffuse * lightAng * attenuation * shadowVis));
    //     lightingIntensity += (light.ambient.r * attenuation) 
    //       + (light.diffuse.r * lightAng * attenuation * shadowVis);

    //     // fresnelIntensity += (1.0 - cameraAng) * fresnelFactor;
    //     // Fresnel-Schlick ?
    //     fresnelIntensity += f0 + (1.0 - f0) * pow(1.0 - cameraAng, 5.0);
    // }
    // // TODO(@darzu): consider using this rim-lighting approach instead of this fersnel
    // //      https://lettier.github.io/3d-game-shaders-for-beginners/rim-lighting.html

    // // cel shading:
    // // TODO(@darzu): kinda hacky to have seperate bands for these?
    // let lightCel = ceil(lightingIntensity * 10.0) / 10.0;
    // let fresnelCel = ceil(fresnelIntensity * 5.0) / 5.0;
    // // non-cel shading
    // // let lightCel = lightingIntensity;
    // // let fresnelCel = fresnelIntensity;

    // // regular shading:
    // // let litColor = input.color * lightingIntensity;
    // let litColor = mix(
    //   input.color * lightCel, 
    //   fresnelColor, 
    // fresnelCel * 0.3); // * 0.5;
    // let litColor = input.color * (lightingColor + vec3(f32(isUnlit)));

    // unlit:
    // let litColor = input.color; // * (lightingColor + vec3(f32(isUnlit)));
    // let celColor = 

    // let litColor = input.color * lightingIntensity;
    
    var out: FragOut;
    out.color = vec4<f32>(input.color, 1.0);

    // out.color = vec4<f32>(normal, 1.0);

    const fresnel = 1.0;

    // TODO(@darzu): this normal is way different then std-mesh's normal
    // out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 0.0)).xyz), 1.0);
    out.normal = vec4<f32>(normalize(input.normal), fresnel);
    out.position = input.worldPos;

    out.surface.r = input.surface;
    out.surface.g = input.id;

    return out;
}
