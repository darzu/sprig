import { particleData } from "../render/pipelines/std-particle.js";

/*
Goals:
cannon ball trail
upward ship explosion
water splash

Impl:
  How to spawn a bunch at once
  How to spawn many over time following a ball
  How to alloc buffer ranges?

Emitter as an entity
  has all the properties of the particles
  runs CPU side update function
  while active,
    adds particle update pipeline to queue
    adds particle init fn to pipeline queue (ea. thread spawns <=8 ?)

Buffer(s):
  1 Buffer = ParticlePool
  Emitter owns sub chunk of buffer
    created and destoryed, alloc & free
  Emitter settings, just data
  
After init shader, we transform by mat4 (size, pos, vel, acl, sizeVel)
*/

const particleInit = {
  useRand: true,
  maxLife: 10_000 + 1_000,
  initShader: `
  let color = vec4(rand(), rand(), rand(), rand());
  particle.color = color;
  // particle.colorVel = vec4(1, -1, -1, 0.0) * 0.0005;
  particle.colorVel = vec4(0.0);

  particle.pos = vec3(rand(), rand(), rand()) * 20.0;
  particle.size = rand() * 0.9 + 0.1;

  particle.vel = (color.xyz - 0.5) * 0.01;
  particle.acl = (vec3(rand(), rand(), rand()) - 0.5) * 0.00001;
  particle.sizeVel = 0.001 * (rand() - 0.5);
  particle.life = rand() * 10000 + 1000;
  `,
  updateShader: `
    // TODO
  `,
};
