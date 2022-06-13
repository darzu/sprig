// BOIDS

import { vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { range } from "../util.js";
import { createRenderTextureToQuad } from "./gpu-helper.js";
import { CY, CyTexturePtr, linearSamplerPtr } from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { sceneBufPtr, litTexturePtr, mainDepthTex } from "./std-scene.js";

const BoidData = createCyStruct({
  pos: "vec3<f32>",
  vel: "vec3<f32>",
});
const numBoids = 1500;
const boidData0 = CY.createArray("boidData0", {
  struct: BoidData,
  init: () =>
    range(numBoids).map((_, i) => ({
      pos: [jitter(10), jitter(10), jitter(10)] as vec3,
      vel: [jitter(10), jitter(10), jitter(10)] as vec3,
    })),
});
const boidData1 = CY.createArray("boidData1", {
  struct: BoidData,
  init: () => numBoids,
});
const BoidVert = createCyStruct({
  pos: "vec3<f32>",
});

const boidVerts = CY.createArray("boidVerts", {
  struct: BoidVert,
  init: () => [
    { pos: [1, 1, 1] },
    { pos: [1, -1, -1] },
    { pos: [-1, 1, -1] },
    { pos: [-1, -1, 1] },
  ],
});
const boidInds = CY.createIdxBuf("boidIdx", {
  init: () => new Uint16Array([2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 3, 1]),
});
const boidResize: CyTexturePtr["onCanvasResize"] = (w, h) => [w / 2, h / 2];
const boidOutTex = CY.createTexture("boidTex", {
  size: [200, 200],
  onCanvasResize: boidResize,
  format: "rgba8unorm",
  // TODO(@darzu): ANTI-ALIAS
  // sampleCount: antiAliasSampleCount,
  init: () => undefined,
});
const boidDepthTex = CY.createDepthTexture("boidDepth", {
  size: [200, 200],
  format: "depth32float",
  onCanvasResize: boidResize,
  // TODO(@darzu): ANTI-ALIAS
  // sampleCount: antiAliasSampleCount,
  init: () => undefined,
});
export const boidRender = CY.createRenderPipeline("boidRender", {
  globals: [sceneBufPtr],
  meshOpt: {
    index: boidInds,
    instance: boidData0,
    vertex: boidVerts,
    stepMode: "per-instance",
  },
  output: [],
  depthStencil: boidDepthTex,
  shader: "xp-boid-render",
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});

const BoidParams = createCyStruct(
  {
    deltaT: "f32",
    cohesionDistance: "f32",
    seperationDistance: "f32",
    alignDistance: "f32",
    cohesionScale: "f32",
    seperationScale: "f32",
    alignScale: "f32",
    worldSize: "f32",
    speed: "f32",
  },
  {
    // TODO(@darzu): wish we didn't need to specify this
    isUniform: true,
  }
);
const boidParams = CY.createSingleton("boidParams", {
  struct: BoidParams,
  init: () => {
    return {
      deltaT: 0.04,
      cohesionDistance: 1.0,
      seperationDistance: 0.25,
      alignDistance: 0.5,
      cohesionScale: 0.02,
      seperationScale: 0.2,
      alignScale: 0.1,
      worldSize: 10.0,
      speed: 0.3,
    };
  },
});

const boidCompDesc: Omit<
  Parameters<typeof CY.createComputePipeline>[1],
  "globals"
> = {
  shaderComputeEntry: "main",
  shader: () => `  
  @stage(compute) @workgroup_size(64)
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
  
    for (var i : u32 = 0u; i < arrayLength(&inBoids.ms); i = i + 1u) {
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
  `,
  workgroupCounts: [Math.ceil(numBoids / 64), 1, 1],
};

export const boidComp0 = CY.createComputePipeline("boidComp0", {
  ...boidCompDesc,
  globals: [
    boidParams,
    { ptr: boidData0, access: "read", alias: "inBoids" },
    { ptr: boidData1, access: "write", alias: "outBoids" },
  ],
});
export const boidComp1 = CY.createComputePipeline("boidComp1", {
  ...boidCompDesc,
  globals: [
    boidParams,
    { ptr: boidData1, access: "read", alias: "inBoids" },
    { ptr: boidData0, access: "write", alias: "outBoids" },
  ],
});

const boidWindow = createCyStruct(
  {
    xPos: "vec2<f32>",
    yPos: "vec2<f32>",
  },
  {
    isUniform: true,
  }
);
const boidWindowUni = CY.createSingleton("boidWindow", {
  struct: boidWindow,
  init: () => ({
    xPos: [0, 1],
    yPos: [0, 1],
  }),
});

export const { pipeline: boidCanvasMerge } = createRenderTextureToQuad(
  "boidCanvasMerge",
  boidDepthTex,
  0.1,
  0.9,
  0.1,
  0.9
);
