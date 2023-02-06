struct VertexOutput {
    @location(0) uv: vec2<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;    
    let worldPos = vec4(input.position, 1.0);
    output.position = (scene.cameraViewProjMatrix * worldPos).xyww;
    output.uv = input.uv;
    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {
    var out: FragOut;
    const yTop = 200;
    let color = mix(vec3(0.0), vec3(1.0), input.uv.y);
    out.color = vec4<f32>(color, 1.0);
    return out;
}
