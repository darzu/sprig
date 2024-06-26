import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { mat4 } from "../matrix/gl-matrix.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  CY,
  CyArrayPtr,
  CyCompPipelinePtr,
  CyRenderPipelinePtr,
  CySingletonPtr,
} from "../render/gpu-registry.js";
import {
  ParticleStruct,
  particleQuadInds,
  particleQuadVert,
} from "../render/pipelines/std-particle.js";
import {
  litTexturePtr,
  mainDepthTex,
  sceneBufPtr,
} from "../render/pipelines/std-scene.js";
import { Renderer, RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { CyStructDesc, CyToTS, createCyStruct } from "../render/gpu-struct.js";
import { V } from "../matrix/sprig-matrix.js";
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

export interface ParticleSystemDesc<U extends CyStructDesc = CyStructDesc> {
  name: string;
  maxParticles: number;
  maxLifeMs: number;
  initParticle: string;
  initParameters?: U;
  initParameterDefaults?: CyToTS<U>;
  // TODO(@darzu): support custom update?
  // updateShader: `
  // `,
}

export interface ParticleSystem<U extends CyStructDesc = CyStructDesc> {
  // TODO(@darzu): IMPL ?
  desc: ParticleSystemDesc<U>;

  pipeInit: CyCompPipelinePtr;
  pipeRender: CyRenderPipelinePtr;
  pipeUpdate: CyCompPipelinePtr;

  updateParameters?: (renderer: Renderer, params: CyToTS<U>) => void;
  updateSpawnParameters: (renderer: Renderer, count: number) => void;

  _data: CyArrayPtr<typeof ParticleStruct.desc>;
}

// interface Emitter {
//   id: number;
//   system: ParticleSystem;
//   start: (t: mat4) => void;
//   stop: () => void;
// }

export function createParticleSystem<U extends CyStructDesc = {}>(
  desc: ParticleSystemDesc<U>
): ParticleSystem<U> {
  // const maxNumParticles = desc.maxEmitters * desc.particlesPerEmitter;
  const maxParticles = desc.maxParticles;

  // TODO(@darzu): hmm shouldn't this be required?
  // assert(maxNumParticles % 64 === 0

  const bufName = `particleData_${desc.name}`;

  const dataPtr = CY.createArray(bufName, {
    struct: ParticleStruct,
    init: maxParticles,
  });

  const threadCount = 32;

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

  let uniBufPtr: CySingletonPtr<U> | undefined = undefined;
  let updateParameters: ((r: Renderer, p: CyToTS<U>) => void) | undefined =
    undefined;

  if (desc.initParameters) {
    const uniStruct = createCyStruct(desc.initParameters, {
      isUniform: true,
    });
    uniBufPtr = CY.createSingleton(`pipeInitParticles_${desc.name}_uni`, {
      struct: uniStruct,
      init: desc.initParameterDefaults
        ? () => desc.initParameterDefaults!
        : undefined,
    });
    updateParameters = (r: Renderer, p: CyToTS<U>) => {
      const uniBuf = r.getCyResource(uniBufPtr!)!;
      uniBuf.queueUpdate(p);
    };
  }

  // spawn parameters
  let _spawnIdx = 0;
  let _spawnCount = maxParticles;

  const spawnUniStruct = createCyStruct(
    {
      startIdx: "u32",
      endIdxExcl: "u32",
    },
    {
      isUniform: true,
    }
  );
  const spawnUniBufPtr = CY.createSingleton(
    `pipeInitParticles_${desc.name}_spawnUni`,
    {
      struct: spawnUniStruct,
      init: () => ({
        startIdx: _spawnIdx,
        endIdxExcl: _spawnIdx + _spawnCount,
      }),
    }
  );
  const updateSpawnParameters = (r: Renderer, count: number) => {
    assert(
      count <= maxParticles,
      `invalid spawn count ${count}, max particles: ${maxParticles}`
    );
    _spawnCount = count;

    _spawnIdx += _spawnCount;
    if (_spawnIdx + _spawnCount > maxParticles) _spawnIdx = 0;

    const uniBuf = r.getCyResource(spawnUniBufPtr!)!;
    uniBuf.queueUpdate({
      startIdx: _spawnIdx,
      endIdxExcl: _spawnIdx + _spawnCount,
    });
  };

  const pipeInit = CY.createComputePipeline(`pipeInitParticles_${desc.name}`, {
    globals: [
      sceneBufPtr,
      dataPtr,
      { ptr: spawnUniBufPtr, alias: "spawn" },
      ...(uniBufPtr
        ? [
            {
              ptr: uniBufPtr,
              alias: "param",
            },
          ]
        : []),
    ],
    shaderComputeEntry: "main",
    // TODO(@darzu): BUG. setting the rand seed from the time isn't quite working right
    shader: (shaders) => `
    ${shaders["std-rand"].code}

    @compute @workgroup_size(${threadCount})
    fn main(@builtin(global_invocation_id) gId : vec3<u32>) {
      let idx = spawn.startIdx + gId.x;

      rand_seed = vec2<f32>(f32(idx), fract(scene.time * 0.01));

      if (idx >= spawn.endIdxExcl) { return; }

      var particle = ${bufName}s.ms[idx];
      ${desc.initParticle}
      ${bufName}s.ms[idx] = particle;
    }
    `,
    workgroupCounts: {
      onDispatch: () => {
        let res: [number, number, number] = [
          Math.ceil(_spawnCount / threadCount),
          1,
          1,
        ];

        return res;
      },
    },
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

  // TODO(@darzu): PERF: probably multiple particles per thread is better
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

  return {
    desc,
    pipeInit,
    pipeRender,
    pipeUpdate,
    _data: dataPtr,
    updateParameters,
    updateSpawnParameters,
  };
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
  let color = mix(param.minColor, param.maxColor, vec4(rand(), rand(), rand(), rand()));
  particle.color = color;
  particle.colorVel = mix(param.minColorVel, param.maxColorVel, vec4(rand(), rand(), rand(), rand())) * 0.001;
  particle.pos = mix(param.minPos, param.maxPos, vec3(rand(), rand(), rand()));
  particle.size = mix(param.minSize, param.maxSize, rand());
  particle.vel = mix(param.minVel, param.maxVel, vec3(rand(), rand(), rand())) * 0.1;
  particle.acl = mix(param.minAcl, param.maxAcl, vec3(rand(), rand(), rand())) * 0.0001;
  particle.sizeVel = mix(param.minSizeVel, param.maxSizeVel,  rand()) * 0.001;
  particle.life = mix(param.minLife, param.maxLife, rand()) * 1000;
  `,
  initParameters: {
    minColor: "vec4<f32>",
    maxColor: "vec4<f32>",
    minColorVel: "vec4<f32>",
    maxColorVel: "vec4<f32>",
    minPos: "vec3<f32>",
    maxPos: "vec3<f32>",
    minVel: "vec3<f32>",
    maxVel: "vec3<f32>",
    minAcl: "vec3<f32>",
    maxAcl: "vec3<f32>",
    minSize: "f32",
    maxSize: "f32",
    minSizeVel: "f32",
    maxSizeVel: "f32",
    minLife: "f32",
    maxLife: "f32",
  },
  initParameterDefaults: {
    minColor: V(0, 0, 0, 0),
    maxColor: V(1, 1, 1, 1),
    minColorVel: V(0, 0, 0, 0),
    maxColorVel: V(-0.1, -0.1, +0.1, 0),
    minPos: V(-10, -10, -10),
    maxPos: V(+10, +10, +10),
    minVel: V(-0.5, -0.5, -0.5),
    maxVel: V(+0.5, +0.5, +0.5),
    minAcl: V(-0.5, -0.5, -0.5),
    maxAcl: V(+0.5, +0.5, +0.5),
    minSize: 0.1,
    maxSize: 1.0,
    minSizeVel: -0.5,
    maxSizeVel: +0.5,
    minLife: 1,
    maxLife: 10,
  },
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
