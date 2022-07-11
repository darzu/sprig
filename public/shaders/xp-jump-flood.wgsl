// TODO(@darzu): use this elsewhere? how does this work exactly
// var<workgroup> tile : array<array<vec3<f32>, 128>, 4>;

// var<storage,read_write> posData: array<array<vec2<f32>, 128>, 128>;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let centerXY = vec2<i32>(GlobalInvocationID.xy);
  // let centerXY = vec2<i32>(32, 32);
  // let centerXY = vec2<i32>(
  //   WorkGroupID.xy * vec2<u32>(8u, 8u) +
  //   LocalInvocationID.xy
  // );
  let dimsI: vec2<i32> = textureDimensions(inTex, 0);
  let dimsF = vec2<f32>(dimsI);
  let centerUV = vec2<f32>(centerXY) / dimsF;

  let stepSize = 4;

  var minDist = 9999.9;
  var minUV = vec2<f32>(0.0);

  // for (var x = -1; x <= 1; x++) {
  //   for (var y = -1; y <= 1; y++) {
    var x = 0;
    var y = 0;

      let neighXY = centerXY + vec2(x,y) * stepSize;
      let neighUV = textureLoad(inTex, neighXY, 0).xy;
      // textureStore(outTex, centerXY, vec4(neighUV, 0.0, 1.0));

      // let neighUV = textureLoad(inTex, neighXY, 0).xy;
      let dist = length(neighUV - centerUV);
      let foo = neighUV.x - 0.5 ;
      // if (true) 
      if (
        true
        && foo > 0.0
        // && neighUV.x > 0.5 
        // && neighUV.y > 0.0 
        // && dist < minDist
      ) 
      {
        minDist = dist;
        minUV = neighUV;

        // textureStore(outTex, centerXY, vec4(minUV, 0.0, 1.0));
        textureStore(outTex, centerXY, vec4(neighUV, 0.0, 1.0));
        // textureStore(outTex, centerXY, vec4(centerUV, 0.0, 1.0));
      }
  //     // let foo2 = textureLoad(inPosTex, centerXY, 0);
  //     // textureStore(outSdfTex, centerXY, vec4(dist));
  // //   }
  // // }

  // // TODO(@darzu): don't use rgba, just rg
  // if (minDist < 999.9) {
  //   // textureStore(outTex, centerXY, vec4(minUV, 0.0, 1.0));
  // }
}
