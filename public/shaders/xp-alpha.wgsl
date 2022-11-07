struct VertexOutput {
    @location(0) @interpolate(flat) color : vec4<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    output.position = scene.cameraViewProjMatrix * worldPos;

    output.color = vec4(color + meshUni.tint, meshUni.alpha);

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    // TODO(@darzu): DZ
    // let litColor = input.color.xyz;

    var out: FragOut;
    out.color = input.color;
    // out.color = vec4<f32>(1.0, 0.0, 0.0, 0.4);

    return out;
}
