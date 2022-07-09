// TODO(@darzu): use this elsewhere? how does this work exactly
// var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

@stage(compute) @workgroup_size(8, 8, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
) {
  let texXY = vec2<i32>(
    WorkGroupID.xy * vec2<u32>(8u, 8u) +
    LocalInvocationID.xy
  );

  let res = textureLoad(inTex, texXY, 0);
  textureStore(outTex, texXY, res);
}
