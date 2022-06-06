struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
}

@stage(vertex)
fn vert_main(vIn: VertexInput, iIn: InstanceInput) -> VertexOutput {
  // let angle = -atan2(iIn.vel.x, iIn.vel.y);
  // let posXY = vec2<f32>(
  //     (vIn.pos.x * cos(angle)) - (vIn.pos.y * sin(angle)),
  //     (vIn.pos.x * sin(angle)) + (vIn.pos.y * cos(angle)));
  // let worldPos = vec3<f32>(posXY * 0.1 + iIn.pos.xy, vIn.pos.z * 0.1 + iIn.pos.z);
  let worldPos = vec3<f32>(vIn.pos.xyz * 0.1 + iIn.pos.xyz);
  var output: VertexOutput;
  output.worldPos = worldPos;
  output.pos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);
  return output;
}

@stage(fragment)
fn frag_main(v: VertexOutput) -> @location(0) vec4<f32> {
  let norm = -normalize(cross(dpdx(v.worldPos.xyz), dpdy(v.worldPos.xyz)));
  // let norm = -normalize(cross(dpdx(v.worldPos.xyz), -dpdy(v.worldPos.xyz)));
  let light1 : f32 = clamp(dot(-scene.dirLight1, norm), 0.0, 1.0);
  let light2 : f32 = clamp(dot(-scene.dirLight2, norm), 0.0, 1.0);
  let light3 : f32 = clamp(dot(-scene.dirLight3, norm), 0.0, 1.0);
  let color = vec3<f32>(1.0, 1.0, 1.0)
      * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
  return vec4<f32>(color.xyz, 1.0);
}