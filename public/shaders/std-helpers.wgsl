
fn tBounce(speed: f32) -> f32 {
  return abs(fract(scene.time * speed) * 2.0 - 1.0);
}
fn tBounceSmooth(speed: f32, pad: f32) -> f32 {
  return smoothstep(pad, 1.0 - pad, tBounce(speed));
}