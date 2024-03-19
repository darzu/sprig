
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gId : vec3u) {

  var particle = particleDatas.ms[gId.x];

  particle.pos += particle.vel * scene.dt;
  particle.vel += particle.acl * scene.dt;
  particle.color += particle.colorVel * scene.dt;
  particle.size = max(particle.size + particle.sizeVel * scene.dt, 0.0);
  particle.life -= scene.dt;

  particleDatas.ms[gId.x] = particle;
}