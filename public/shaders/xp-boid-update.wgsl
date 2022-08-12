
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var index : u32 = GlobalInvocationID.x;

  var vPos = inBoids.ms[index].pos;
  var vVel = inBoids.ms[index].vel;
  var cMass = vec3<f32>(0.0, 0.0, 0.0);
  var cVel = vec3<f32>(0.0, 0.0, 0.0);
  var colVel = vec3<f32>(0.0, 0.0, 0.0);
  var cMassCount : u32 = 0u;
  var cVelCount : u32 = 0u;
  var pos : vec3<f32>;
  var vel : vec3<f32>;

  for (var i : u32 = 0u; i < numBoids; i = i + 1u) {
    if (i == index) {
      continue;
    }

    pos = inBoids.ms[i].pos.xyz;
    vel = inBoids.ms[i].vel.xyz;
    if (distance(pos, vPos) < boidParams.cohesionDistance) {
      cMass = cMass + pos;
      cMassCount = cMassCount + 1u;
    }
    if (distance(pos, vPos) < boidParams.seperationDistance) {
      colVel = colVel - (pos - vPos);
    }
    if (distance(pos, vPos) < boidParams.alignDistance) {
      cVel = cVel + vel;
      cVelCount = cVelCount + 1u;
    }
  }
  if (cMassCount > 0u) {
    var temp = f32(cMassCount);
    cMass = (cMass / vec3<f32>(temp, temp, temp)) - vPos;
  }
  if (cVelCount > 0u) {
    var temp = f32(cVelCount);
    cVel = cVel / vec3<f32>(temp, temp, temp);
  }
  vVel = vVel + (cMass * boidParams.cohesionScale) + (colVel * boidParams.seperationScale) +
      (cVel * boidParams.alignScale);

  // clamp velocity for a more pleasing simulation
  vVel = normalize(vVel) * boidParams.speed; // max velocity
  // vVel = normalize(vVel) * clamp(length(vVel), 0.0, 1.0); // max velocity
  // kinematic update
  vPos = vPos + (vVel * boidParams.deltaT);
  // Wrap around boundary
  if (vPos.x < -boidParams.worldSize) {
    vPos.x = boidParams.worldSize;
  }
  if (vPos.x > boidParams.worldSize) {
    vPos.x = -boidParams.worldSize;
  }
  if (vPos.y < -boidParams.worldSize) {
    vPos.y = boidParams.worldSize;
  }
  if (vPos.y > boidParams.worldSize) {
    vPos.y = -boidParams.worldSize;
  }
  if (vPos.z < -boidParams.worldSize) {
    vPos.z = boidParams.worldSize;
  }
  if (vPos.z > boidParams.worldSize) {
    vPos.z = -boidParams.worldSize;
  }
  // Write back
  outBoids.ms[index].pos = vPos;
  outBoids.ms[index].vel = vVel;
}
