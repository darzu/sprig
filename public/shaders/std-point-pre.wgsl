struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) @interpolate(flat) objId: u32,
    @location(1) @interpolate(flat) surfId: u32,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    let position = input.position;
    var output : VertexOutput;
    let worldPos: vec4<f32> = meshUni.transform * vec4<f32>(position, 1.0);
    output.position = scene.cameraViewProjMatrix * worldPos;
    output.objId = meshUni.id;
    output.surfId = input.surfaceId;
    return output;
}

struct FragOut {
  @location(0) surface: vec2<u32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

  var out: FragOut;

  out.surface.r = input.surfId;
  out.surface.g = input.objId;
  
  return out;
}
