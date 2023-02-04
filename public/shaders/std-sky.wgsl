struct VertexOutput {
    @location(0) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(input.position, 1.0);
    output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    var out: FragOut;
    out.color = vec4<f32>(input.worldPos.xyz * 0.001, 1.0);
    return out;
}
