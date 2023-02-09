struct VertexOutput {
  @builtin(position) myPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
}

@vertex
fn vert_main(vIn: VertexInput, iIn: InstanceInput) -> VertexOutput {
  // let angle = -atan2(iIn.vel.x, iIn.vel.y);
  // let posXY = vec2<f32>(
  //     (vIn.myPos.x * cos(angle)) - (vIn.myPos.y * sin(angle)),
  //     (vIn.myPos.x * sin(angle)) + (vIn.myPos.y * cos(angle)));
  // let worldPos = vec3<f32>(posXY * 0.1 + iIn.myPos.xy, vIn.myPos.z * 0.1 + iIn.myPos.z);
  let worldPos = vec3<f32>(vIn.myPos.xyz * 0.1 + iIn.myPos.xyz);
  var output: VertexOutput;
  output.worldPos = worldPos;
  output.myPos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);
  return output;
}

@fragment
fn frag_main(v: VertexOutput) -> @location(0) vec4<f32> {
  let norm = -normalize(cross(dpdx(v.worldPos.xyz), dpdy(v.worldPos.xyz)));
  // let norm = -normalize(cross(dpdx(v.worldPos.xyz), -dpdy(v.worldPos.xyz)));
  let color = vec3<f32>(1.0, 1.0, 1.0);  
  return vec4<f32>(color.xyz, 1.0);
}
