struct VertexOutput {
    @location(0) @interpolate(flat) normal : vec3<f32>,
    @location(1) @interpolate(flat) color : vec3<f32>,
    @location(2) worldPos: vec4<f32>,
    @location(3) shadowPos: vec3<f32>,
    @location(4) uv: vec2<f32>,
    @location(5) @interpolate(flat) surface: u32,
    @location(6) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let uv = input.uv;
    let color = input.color;
    let normal = input.normal;

    var output : VertexOutput;
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    let finalPos = worldPos;

     // XY is in (-1, 1) space, Z is in (0, 1) space
    let posFromLight = (scene.lightViewProjMatrix * worldPos).xyz;

    // Convert XY to (0, 1), Y is flipped because texture coords are Y-down.
    output.shadowPos = vec3<f32>(
        posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
        posFromLight.z
    );

    output.worldPos = finalPos;
    output.position = scene.cameraViewProjMatrix * finalPos;
    // TODO: use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    output.normal = normalize(meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.color = color + meshUni.tint;

    // DEBUG:
    // output.color = vec3<f32>(f32(uvInt.x), f32(uvInt.y), 1.0);
    // output.color = texDisp.rgb;
    // output.color = vec3(uv.xy, 1.0);
    // output.color = input.color;

    output.surface = input.surfaceId;
    output.id = meshUni.id;

    output.uv = uv;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  // @location(2) position: vec4<f32>,
  @location(2) surface: vec2<u32>,
}

const shadowDepthTextureSize = 1024.0;
// const shadowDepthTextureSize = vec2<f32>(textureDimensions(shadowMap, 0.0));

fn getShadowVis(shadowPos: vec3<f32>) -> f32 {
  // See: https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
  // Note: a better bias would look something like "max(0.05 * (1.0 - dot(normal, lightDir)), 0.005);"
  let shadowBias = 0.007;
  let shadowDepth = shadowPos.z; // * f32(shadowPos.z <= 1.0);
  let outsideShadow = 1.0 - f32(0.0 < shadowPos.x && shadowPos.x < 1.0 
                && 0.0 < shadowPos.y && shadowPos.y < 1.0);
  let shadowSamp = textureSampleCompare(
    shadowMap, shadowSampler, shadowPos.xy, shadowDepth - shadowBias);

  // Percentage-closer filtering. Sample texels in the region
  // to smooth the result.
  var visibility : f32 = 0.0;
  let oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;
  for (var y : i32 = -1 ; y <= 1 ; y = y + 1) {
      for (var x : i32 = -1 ; x <= 1 ; x = x + 1) {
        let offset : vec2<f32> = vec2<f32>(
          f32(x) * oneOverShadowDepthTextureSize,
          f32(y) * oneOverShadowDepthTextureSize);

          visibility = visibility + textureSampleCompare(
            shadowMap, shadowSampler, 
            shadowPos.xy + offset, shadowDepth - shadowBias);
      }
  }
  visibility = visibility / 9.0;

  visibility = min(outsideShadow + visibility, 1.0);

  return visibility;
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = normalize(input.normal);
    // let normal = -normalize(cross(dpdx(input.worldPos.xyz), dpdy(input.worldPos.xyz)));

    let shadowVis = getShadowVis(input.shadowPos);

    let ambientStrength = 0.1;
    let ambient = vec3(1.0) * ambientStrength;
    let lightColor1 = vec3(1.0, 1.0, 1.0);
    let lightColor2 = vec3(1.0, 1.0, 1.0);
    let lightColor3 = vec3(1.0, 1.0, 1.0);
    let diffuse1 = max(dot(-scene.dirLight1, normal), 0.0);
    let diffuse2 = max(dot(-scene.dirLight2, normal), 0.0);
    let diffuse3 = max(dot(-scene.dirLight3, normal), 0.0);
    let allLights = (
      ambient
      + diffuse1 * lightColor1 * shadowVis
      + diffuse2 * lightColor2 
      + diffuse3 * lightColor3 
    );
    let litColor: vec3<f32> = input.color * allLights;
      // * ((1.0 - shadowVis) * light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);

    let fogDensity: f32 = 0.02;
    let fogGradient: f32 = 1.5;
    // let fogDist: f32 = 0.1;
    let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
    // output.fogVisibility = 0.9;
    let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);

    let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    // let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
    // let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);
    // let finalColor: vec3<f32> = gammaCorrected;


    var out: FragOut;
    out.color = vec4<f32>(litColor, 1.0);

    // let t = scene.time * 0.0005;
    // // TODO(@darzu): experimenting with reading from SDF
    // // TODO(@darzu): use sample instead of load
    // let sdf = textureSample(sdf, samp, input.uv);
    // out.color = vec4<f32>(sdf.x * 0.5 + 0.1);
    // if (fract(input.uv.x * 10.0 + t) < 0.1) {
    //   out.color.g += 0.2;
    // }
    // if (fract(input.uv.y * 10.0 + t) < 0.1) {
    //   out.color.r += 0.2;
    // }
    // if (input.uv.x > 0.0 && input.uv.y > 0.0)
    // {
    //   // let xy = vec2<i32>(input.uv * vec2<f32>(textureDimensions(sdf)));
    //   // let t = textureLoad(sdf, xy, 0);
    //   // let d = length(t);
    //   let d = sdf.x;
    //   // if (t.x > 0.0 || t.y > 0.0) {
    //   //   out.color.r = 1.0;
    //   // }
    //   let d2 = fract(d * 10.0 + t);
    //   if (0.0 < d2 && d2 < 0.1 * 4.0) {
    //     out.color.b += 0.2;
    //   }
    //   if (d < 0.01 * 4.0) {
    //     out.color.b += 0.2;
    //   }
    //   // if (d > 0.0) {
    //   //   out.color.r = 1.0;
    //   // }
    // }

    // out.color = vec4<f32>(input.uv, 0.0, 1.0);
    // out.normal = vec4(input.normal, 1.0);
    out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 0.0)).xyz), 1.0);
    // out.position = input.worldPos;
    out.surface.r = input.surface;
    out.surface.g = input.id;
    // out.color = vec4(input.color, 1.0);
    // out.color = input.surface;
    // out.color = vec4(input.shadowPos.xy, 0.0, 1.0);

    return out;
    // return vec4<f32>(finalColor, 1.0);
    // return vec4<f32>(input.color, 1.0);
}