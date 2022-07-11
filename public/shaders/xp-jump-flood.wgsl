@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  // @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  // @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let centerXY = vec2<i32>(WorkGroupID.xy);
  // let dimsI: vec2<i32> = textureDimensions(inTex, 0);
  // let dimsF = vec2<f32>(dimsI);
  // let centerUV = vec2<f32>(centerXY) / dimsF;
  let neighUV = textureLoad(inTex, centerXY, 0).x;

  // let neighUV = centerUV;
  // if (neighUV.x < 0.5 && neighUV.y < 0.5) 
  if (centerXY.x > 32 && neighUV > 0.4) 
  {
  //   // if (length(neighUV.xy) > 0.2) 
  //   {
      textureStore(outTex, centerXY, vec4(1.0 - neighUV));
  //   }
  //   // textureStore(outTex, centerXY, textureLoad(inTex, centerXY, 0));
  // } else {
  //   // textureStore(outTex, centerXY, 1.0 - neighUV);
  }
}
