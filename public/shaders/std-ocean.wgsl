struct VertexOutput {
  // TODO(@darzu): change
    @location(0) normal : vec3<f32>,
    @location(1) color : vec3<f32>,
    // TODO(@darzu): can we get rid of worldPos if we do our own depth invert?
    @location(2) worldPos: vec4<f32>,
    @location(3) uv: vec2<f32>,
    @location(4) @interpolate(flat) surface: u32,
    @location(5) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

const shadowDepthTextureSize = 2048.0;
// const shadowDepthTextureSize = vec2<f32>(textureDimensions(shadowMap, 0.0));

fn sampleShadowTexture(pos: vec2<f32>, depth: f32, index: u32) -> f32 {
  // TODO(@darzu): re-enable multi-shadow? probably w/ option
    // if (index == 0) {
        return textureSampleCompare(shadowMap0, shadowSampler, pos, depth);
    // } else if (index == 1) {
    //     return textureSampleCompare(shadowMap1, shadowSampler, pos, depth);
    // } else {
    //     return textureSampleCompare(shadowMap2, shadowSampler, pos, depth);
    // }
}

// TODO(@darzu): de-dupe w/ std-mesh
fn getShadowVis(shadowPos: vec3<f32>, normal: vec3<f32>, lightDir: vec3<f32>, index: u32) -> f32 {
  // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
  // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
    //let shadowBias = 0.007;
    //let shadowBias = 0.001;
    //let shadowBias = max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);
  let shadowBias = 0.0002;
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

fn gerstner(uv: vec2<f32>, t: f32) -> mat2x3<f32> {
    var displacement = vec3<f32>(0.0, 0.0, 0.0);
    var normal = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < scene.numGerstnerWaves; i++) {
        let wave = gerstnerWaves.ms[i];
        displacement = displacement +
            vec3<f32>(wave.Q * wave.A + wave.D.x * cos(dot(wave.w * wave.D, uv) + wave.phi * t),
                      wave.A * sin(dot(wave.w * wave.D, uv) + wave.phi * t),
                      wave.Q * wave.A + wave.D.y * cos(dot(wave.w * wave.D, uv) + wave.phi * t));
        normal = normal +
            vec3<f32>(-1.0 * wave.D.x * wave.w * wave.A * cos(wave.w * dot(wave.D, uv) + wave.phi * t),
                      wave.Q * wave.w * wave.A * sin(wave.w * dot(wave.D, uv) + wave.phi * t),
                      -1.0 * wave.D.y * wave.w * wave.A * cos(wave.w * dot(wave.D, uv) + wave.phi * t));
    }
    normal.y = 1.0 - normal.y;
    normalize(normal);
    return mat2x3(displacement, normal);
}

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let uv = input.uv;
    let color = input.color;
    let normal = input.normal;
    let tangent = input.tangent;
    let perp = cross(tangent, normal);

    let flattenedPos = vec3<f32>(uv.x - 1.0, 0, uv.y) * 1000;
    // TODO(@darzu): we're not totally sure about x,y,z vs normal,tangent,perp
    let surfBasis = mat3x3<f32>(perp, normal, tangent);
    // TODO(@darzu): PERF. don't transform twice..
    let oldWorldPos = meshUni.transform * vec4<f32>(position, 1.0);
    let gerst = gerstner(oldWorldPos.zx, scene.time * .001);
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
  @location(2) surface: vec2<u32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    // let normal = normalize(input.normal);

    // let gerst = gerstner(input.uv * 1000, scene.time * .001);
    let gerst = gerstner(input.worldPos.zx, scene.time * .001);
    let normal = gerst[1];

    var lightingColor: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
    var lightingIntensity = 0.0;
    let isUnlit = 0u;
    // TODO(@darzu): de-dupe light code w/ std-mesh?
    for (var i: u32 = 0u; i < scene.numPointLights; i++) {
        let light = pointLights.ms[i];
        let toLight = light.position - input.worldPos.xyz;
        let distance = length(toLight);
        let attenuation = 1.0 / (light.constant + light.linear * distance +
                                 light.quadratic * distance * distance);
        let angle = clamp(dot(normalize(toLight), normal), 0.0, 1.0);
        // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight = (pointLights.ms[i].viewProj * input.worldPos).xyz;
        
        // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
        let shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
                                  posFromLight.z
                                  );
        let shadowVis = getShadowVis(shadowPos, normal, normalize(toLight), i);
        //lightingColor = lightingColor + clamp(abs((light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis)), vec3(0.0), vec3(1.0));
        //lightingColor += light.ambient;
        lightingColor = lightingColor + f32(1u - isUnlit) 
          * ((light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis));
        lightingIntensity = (light.ambient.r * attenuation) 
          + (light.diffuse.r * angle * attenuation * shadowVis);
    }
    const shades = 10.0;
    // lightingIntensity = ceil(lightingIntensity * shades) / shades;
    // let litColor = input.color * lightingIntensity;
    let litColor = input.color * (lightingColor + vec3(f32(isUnlit)));
    // let litColor = input.color; // * (lightingColor + vec3(f32(isUnlit)));
    // let celColor = 

    
    var out: FragOut;
    // out.color = vec4<f32>(litColor, 1.0);

    out.color = vec4<f32>(normal, 1.0);

    out.normal = vec4<f32>(normal, 1.0);

    out.surface.r = input.surface;
    out.surface.g = input.id;

    return out;
}
