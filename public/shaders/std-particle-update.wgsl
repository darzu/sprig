
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gId : vec3u) {
  let idx = gId.x;

  rand_seed = vec2<f32>(f32(gId.x));

  var particle = particleDatas.ms[idx];

  particle.pos = particle.pos + vec3(0,0,-0.1);

  // particle.velocity.z = particle.velocity.z - sim_params.deltaTime * 0.5;
  // particle.lifetime = particle.lifetime - sim_params.deltaTime;
  // particle.color.a = smoothstep(0.0, 0.5, particle.lifetime);

  // Store the new particle value
  particleDatas.ms[idx] = particle;
}