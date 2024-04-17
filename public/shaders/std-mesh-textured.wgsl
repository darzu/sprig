struct VertexOutput {
    @location(0) worldPos: vec4<f32>,
    @location(1) @interpolate(flat) normal : vec3<f32>,
    @location(2) @interpolate(flat) color : vec3<f32>,
    @location(3) uv : vec2<f32>,
    // @location(4) @interpolate(flat) surface: u32,
    // @location(4) @interpolate(flat) id: u32,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let normal = input.normal;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    // TODO(@darzu): de-dupe w/ std-mesh
    output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    output.normal = (meshUni.transform * vec4<f32>(normal, 0.0)).xyz;

    output.color = input.color + meshUni.tint;

    output.uv = input.uv;

    // output.surface = input.surfaceId;
    // output.id = meshUni.id;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) position: vec4<f32>,
  // @location(3) surface: vec2<u32>,
  @location(3) emissive: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    let normal = normalize(input.normal);

    var out: FragOut;

    let uv = vec2(input.uv.x, 1.0 - input.uv.y);

    let texDist: f32 = textureSample(sdfTex, samp, uv).x;

    let texMask = 1.0 - smoothstep(0.15, 0.25, texDist);

    let dimsI : vec2<i32> = vec2<i32>(textureDimensions(vorTex)); 
    let dimsF = vec2<f32>(dimsI);

    let xy = vec2<i32>(uv * dimsF);
    let sourceXY: vec2<u32> = textureLoad(vorTex, xy, 0).xy;
    let sourceColor = textureLoad(colorTex, sourceXY, 0).rgb;

    let color = sourceColor + input.color;

    out.color = vec4<f32>(color, texMask);

    out.emissive = vec4(color * texMask, 1.0);

    out.position = input.worldPos;

    const fresnel = 0.0;

    out.normal = vec4<f32>(normalize(input.normal), fresnel);
    
    // out.surface.r = input.surface;
    // out.surface.g = input.id;

    return out;
}
