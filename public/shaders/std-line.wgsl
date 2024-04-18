struct VertexOutput {
    @location(0) color : vec3<f32>,
    // @location(1) worldPos: vec4<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    let color = input.color;

    var output : VertexOutput;
    
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);

    // output.worldPos = worldPos;
    output.position = scene.cameraViewProjMatrix * worldPos;
    output.color = color + meshUni.tint;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
  // @location(1) bloom: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  var color = input.color;

  var alpha: f32 = 1.0;

  var out: FragOut;

  out.color = vec4(color, alpha);
  // out.bloom = vec4(color, 1.0);
  
  return out;
}
