@compute @workgroup_size(1, 1, 1)
fn main_bug(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
) {
  let coord = vec2<i32>(WorkGroupID.xy);
  let inPx = textureLoad(inTex, coord, 0);

  if (inPx.x > 0.0)
  {
      textureStore(outTex, coord, vec4(inPx.xzyw));
  }
}

@compute @workgroup_size(1, 1, 1)
fn main_nobug(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
) {
  let coord = vec2<i32>(WorkGroupID.xy);
  let inPx = textureLoad(inTex, coord, 0);

  // if (inPx.x > 0.0)
  {
      textureStore(outTex, coord, vec4(inPx.xzyw));
  }
}