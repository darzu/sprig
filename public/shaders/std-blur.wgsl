// credit: https://austin-eng.com/webgpu-samples/samples/imageBlur

// TODO(@darzu): use this elsewhere? how does this work exactly
var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

@compute @workgroup_size(32, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
) {
  // TODO(@darzu): pass in?
  let tileDim = 128u;
  let filterDim = 15u;
  let blockDim = tileDim - (filterDim - 1u);

  let filterOffset : u32 = (filterDim - 1u) / 2u;
  let dims : vec2<i32> = vec2<i32>(textureDimensions(inTex, 0));

  let baseIndex = vec2<i32>(
    WorkGroupID.xy * vec2<u32>(blockDim, 4u) +
    LocalInvocationID.xy * vec2<u32>(4u, 1u)
  ) - vec2<i32>(i32(filterOffset), 0);

  for (var r : u32 = 0u; r < 4u; r = r + 1u) {
    for (var c : u32 = 0u; c < 4u; c = c + 1u) {
      var loadIndex = baseIndex + vec2<i32>(i32(c), i32(r));
      if (params.isVertical != 0u) {
        loadIndex = loadIndex.yx;
      }

      tile[r][4u * LocalInvocationID.x + c] =
        textureSampleLevel(inTex, samp,
          (vec2<f32>(loadIndex) + vec2<f32>(0.25, 0.25)) / vec2<f32>(dims), 0.0).rgb;
    }
  }

  workgroupBarrier();

  for (var r : u32 = 0u; r < 4u; r = r + 1u) {
    for (var c : u32 = 0u; c < 4u; c = c + 1u) {
      var writeIndex = baseIndex + vec2<i32>(i32(c), i32(r));
      if (params.isVertical != 0u) {
        writeIndex = writeIndex.yx;
      }

      let center : u32 = 4u * LocalInvocationID.x + c;
      if (center >= filterOffset &&
          center < 128u - filterOffset &&
          all(writeIndex < dims)) {
        var acc : vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
        for (var f : u32 = 0u; f < filterDim; f = f + 1u) {
          var i : u32 = center + f - filterOffset;
          acc = acc + (1.0 / f32(filterDim)) * tile[r][i];
        }
        textureStore(outTex, writeIndex, vec4<f32>(acc, 1.0));
      }
      // TODO(@darzu): dbg
      // textureStore(outTex, writeIndex, vec4<f32>(1.0, 0.0, 0.0, 1.0));
    }
  }
}
