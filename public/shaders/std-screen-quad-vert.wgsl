struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  // TODO(@darzu): we shouldn't need uv since built-in position should give us this?
  @location(0) uv : vec2<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(quad.minX, quad.minY),
    vec2<f32>(quad.maxX, quad.minY),
    vec2<f32>(quad.maxX, quad.maxY),
    vec2<f32>(quad.minX, quad.maxY),
    vec2<f32>(quad.minX, quad.minY),
    vec2<f32>(quad.maxX, quad.maxY),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.uv = uv[VertexIndex];
  return output;
}