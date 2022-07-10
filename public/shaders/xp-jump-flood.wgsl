// TODO(@darzu): use this elsewhere? how does this work exactly
// var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
) {
  let texXY = vec2<i32>(
    WorkGroupID.xy * vec2<u32>(8u, 8u) +
    LocalInvocationID.xy
  );

  let stepSize = 4;
  let center = textureLoad(inTex, texXY, 0);

      // let foo1 = textureLoad(sdfTex, texXY, 0);
      // let foo2 = textureLoad(posTex, texXY, 0);

  let minDist = 9999.9;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let coord = texXY + vec2(x,y) * stepSize;
      let pos = textureLoad(inTex, coord, 0);
      let dist = length(pos - center);
      textureStore(sdfTex, texXY, vec4(dist));
      textureStore(posTex, texXY, pos);
    }
  }
}
