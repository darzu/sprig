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
    // TODO(@darzu): for non-uniform scaling, we need to use inverse-transpose matrix for normals as per: https://learnopengl.com/Lighting/Basic-Lighting
    // TODO(@darzu): apply inverse of scale? https://youtu.be/esC1HnyD9Bk?list=PLplnkTzzqsZS3R5DjmCQsqupu43oS9CFN&t=3120
    //    m3x3 = R2*S*R1
    //    mNorm = R2*S^-1*R1
    //    mNorm = ((m3x3)^-1)^T
    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;
    output.color = color + meshUni.tint;

    output.surface = input.surfaceId;
    output.id = meshUni.id;

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

    // // cel shading:
    // // var lightingIntensity = (light.ambient.r * attenuation) + (light.diffuse.r * angle * attenuation * shadowVis);
    // // const shades = 10.0;
    // // lightingIntensity = ceil(lightingIntensity * shades) / shades;

    // let lightingColor = (light.ambient * attenuation) + (light.diffuse * angle * attenuation * shadowVis);
    // // }
    // let litColor = input.color * lightingColor;
    // let litColor = input.color * lightingIntensity;

    var out: FragOut;
    out.color = vec4<f32>(input.color, 1.0);
    out.position = input.worldPos;

    const fresnel = 0.0;

    out.normal = vec4<f32>(normalize(input.normal), fresnel);
    // out.normal = vec4(normalize((scene.cameraViewProjMatrix * vec4<f32>(input.normal, 0.0)).xyz), 1.0);
    out.surface.r = input.surface;
    out.surface.g = input.id;

    return out;
}
