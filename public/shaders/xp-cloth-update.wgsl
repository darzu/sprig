
// @group(0) @binding(1) var inTex : texture_2d<f32>;
// @group(0) @binding(2) var outTex : texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(10, 10)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  // var index : u32 = GlobalInvocationID.x;

  // let dims : vec2<i32> = textureDimensions(inTex, 0);

  // let uv: vec2<f32> = vec2<f32>(0.5, 0.5);

  // let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
  let uvInt: vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
  let texDisp = textureLoad(inTex, uvInt, 0);

  // textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz + vec3<f32>(0.01), 1.0));
  textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz * 1.01, 1.0));
}