import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { mat4 } from "../matrix/gl-matrix.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  CY,
  CyCompPipelinePtr,
  CyPipelinePtr,
  CyRenderPipelinePtr,
} from "../render/gpu-registry.js";
import {
  ParticleStruct,
  particleData,
  particleQuadInds,
  particleQuadVert,
} from "../render/pipelines/std-particle.js";
import {
  litTexturePtr,
  mainDepthTex,
  sceneBufPtr,
} from "../render/pipelines/std-scene.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { assert } from "../utils/util-no-import.js";

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

interface ParticleSystemDesc {
  name: string;
  maxParticles: number;
  maxLifeMs: number;
  initParticle: string;
  // TODO(@darzu): support custom update?
  // updateShader: `
  // `,
}

interface ParticleSystem {
  // TODO(@darzu): IMPL ?
  desc: ParticleSystemDesc;

  pipeInit: CyCompPipelinePtr;
  pipeRender: CyRenderPipelinePtr;
  pipeUpdate: CyCompPipelinePtr;
}

// interface Emitter {
//   id: number;
//   system: ParticleSystem;
//   start: (t: mat4) => void;
//   stop: () => void;
// }

function createParticleSystem(desc: ParticleSystemDesc): ParticleSystem {
  // const maxNumParticles = desc.maxEmitters * desc.particlesPerEmitter;
  const maxParticles = desc.maxParticles;

  // TODO(@darzu): hmm shouldn't this be required?
  // assert(maxNumParticles % 64 === 0

  const bufName = `particleData_${desc.name}`;

  const dataPtr = CY.createArray(bufName, {
    struct: ParticleStruct,
    init: maxParticles,
  });

  const threadCount = 64;

  // TODO(@darzu): IMPL continuous spawning

  // TODO(@darzu): work queue
  /*
  per system
  work queue: array of offsets + lengths
  indirect dispatch: number of work items

  "run this program X times w/ these offsets+lengths"
  dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset)
    let dispatchIndirectParameters = new Uint32Array(3);
    dispatchIndirectParameters[0] = workgroupCountX;
    dispatchIndirectParameters[1] = workgroupCountY;
    dispatchIndirectParameters[2] = workgroupCountZ;
  "indirect-first-instance"
    let drawIndexedIndirectParameters = new Uint32Array(5);
    drawIndexedIndirectParameters[0] = indexCount;
    drawIndexedIndirectParameters[1] = instanceCount;
    drawIndexedIndirectParameters[2] = firstIndex;
    drawIndexedIndirectParameters[3] = baseVertex;
    drawIndexedIndirectParameters[4] = firstInstance;

  or b/c of different data structure nad update, maybe ea one is a different pipeline?



  */

  const pipeInit = CY.createComputePipeline(`pipeInitParticles_${desc.name}`, {
    globals: [dataPtr],
    shaderComputeEntry: "main",
    shader: (shaders) => `
    ${shaders["std-rand"].code}
  
    @compute @workgroup_size(${threadCount})
    fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
      rand_seed = vec2<f32>(f32(gId.x));

      var particle = ${bufName}s.ms[gId.x];
      ${desc.initParticle}
      ${bufName}s.ms[gId.x] = particle;
    }
    `,
    workgroupCounts: [Math.ceil(maxParticles / threadCount), 1, 1],
  });

  // TODO(@darzu): PERF. probably shouldn't have a seperate pipeline per particle system!
  const pipeRender = CY.createRenderPipeline(
    `pipeParticleRender_${desc.name}`,
    {
      globals: [sceneBufPtr],
      meshOpt: {
        index: particleQuadInds,
        instance: dataPtr,
        vertex: particleQuadVert,
        stepMode: "per-instance",
      },
      depthStencil: mainDepthTex,
      // ${shaders["std-rand"].code}
      shader: (shaders) => `
    ${shaders["std-particle-render"].code}
    `,
      shaderFragmentEntry: "frag_main",
      shaderVertexEntry: "vert_main",
      output: [
        {
          ptr: litTexturePtr,
          clear: "never",
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              // TODO(@darzu): understand blend modes...
              // srcFactor: "one",
              // dstFactor: "one",
              // operation: "max",
              srcFactor: "constant",
              dstFactor: "zero",
              operation: "add",
            },
          },
        },
      ],
    }
  );

  const pipeUpdate = CY.createComputePipeline(
    `pipeParticleUpdate_${desc.name}`,
    {
      shaderComputeEntry: "main",
      shader: (shaders) =>
        `const numParticles: u32 = ${maxParticles};
  ${shaders["std-particle-update"].code.replaceAll("particleData", bufName)}
  `,
      workgroupCounts: [Math.ceil(maxParticles / threadCount), 1, 1],
      globals: [sceneBufPtr, { ptr: dataPtr, access: "write" }],
    }
  );

  return { desc, pipeInit, pipeRender, pipeUpdate };
}

export const ParticleDef = defineResourceWithInit(
  "particles",
  [RendererDef],
  ({ renderer }) => {
    // TODO(@darzu): IMPL

    EM.addSystem(
      "updateEmitters",
      Phase.POST_GAME_WORLD,
      [EmitterDef, WorldFrameDef],
      [TimeDef],
      (es, res) => {
        const systems = es.reduce(
          (p, n) => (n.emitter.system ? p.add(n.emitter.system) : p),
          new Set<ParticleSystem>() // TODO(@darzu): PERF: reuse
        );

        type spawnEvent = {
          system: ParticleSystem;
          transform: mat4;
          amount: number;
        };

        const events: spawnEvent[] = [];

        for (let e of es) {
          if (!e.emitter.system) continue;
          let amount = 0;
          if (e.emitter.continuousPerSecNum)
            amount += e.emitter.continuousPerSecNum * res.time.dt;
          while (e.emitter.pulseNum.length) amount += e.emitter.pulseNum.pop()!;
          if (amount)
            events.push({
              system: e.emitter.system,
              transform: e.world.transform,
              amount,
            });
        }

        // TODO(@darzu): IMPL
        /*
        per system
        find all init obligations for frame
        track active systems
        setup argument buffer
        track pipelines
        */
      }
    );

    return {
      getPipelinesForFrame: () => {
        throw "TODO";
      },
    };
  }
);

type Emitter = {
  system: ParticleSystem | undefined;
  continuousPerSecNum: number;
  pulseNum: number[];
};

export const EmitterDef = EM.defineComponent(
  "emitter",
  () => {
    const e: Emitter = {
      system: undefined,
      continuousPerSecNum: 0,
      pulseNum: [],
    };
    return e;
  },
  (p, n: Partial<Emitter>) => Object.assign(p, n)
);

export const cloudBurstSys = createParticleSystem({
  name: "cloudBurst",
  maxParticles: 1_000,
  maxLifeMs: 10_000 + 1_000,
  initParticle: `
  let color = vec4(rand(), rand(), rand(), rand());
  particle.color = color;
  // particle.colorVel = vec4(1, -1, -1, 0.0) * 0.0005;
  particle.colorVel = vec4(0.0);

  particle.pos = vec3(rand(), rand(), rand()) * 10.0;
  particle.size = rand() * 0.9 + 0.1;

  particle.vel = (color.xyz - 0.5) * 0.1;
  particle.acl = (vec3(rand(), rand(), rand()) - 0.5) * 0.0001;
  particle.sizeVel = 0.001 * (rand() - 0.5);
  particle.life = rand() * 10000 + 1000;
  `,
});

export const fireTrailSys = createParticleSystem({
  name: "fireTrail",
  maxParticles: 1_000,
  maxLifeMs: 3_000,
  initParticle: `
  let color = vec4(rand() * 0.2 + 0.8, rand() * 0.2, rand() * 0.2, 1.0);
  particle.color = color;
  // particle.colorVel = vec4(1, -1, -1, 0.0) * 0.0005;
  // particle.colorVel = vec4(0.0, 0.0, 0.0, -0.00001);

  particle.pos = vec3(rand(), rand(), rand()) * 5.0;
  particle.size = rand() * 0.4 + 0.1;

  particle.vel = vec3(rand() - 0.5, rand() - 0.5, rand() * 2.0) * 0.01;
  particle.acl = vec3(0,0,0.00001);
  // particle.sizeVel = -0.0001;
  particle.life = rand() * 2000 + 500;
  `,
});
