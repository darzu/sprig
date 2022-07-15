@group(0) @binding(0) var inTex : texture_2d<f32>;
@group(0) @binding(1) var outTex : texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(1, 1, 1)
fn main_bug(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
) {
  let coord = vec2<i32>(WorkGroupID.xy);
  let inPx = textureLoad(inTex, coord, 0);
  if (inPx.x > 0.0)
  {
      textureStore(outTex, coord, inPx);
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
      textureStore(outTex, coord, inPx);
  }
}

// @compute @workgroup_size(1, 1, 1)
// fn main_nobug2(
//   @builtin(workgroup_id) WorkGroupID : vec3<u32>,
// ) {
//   let coord = vec2<i32>(WorkGroupID.xy);
//   let inPx = textureLoad(inTex, coord, 0);

//   if (inPx.x > 0.0)
//   {
//       textureStore(outTex, coord, inPx);
//   } 
//   else {
//       textureStore(outTex, coord, vec4(0.0));
//   }
// }