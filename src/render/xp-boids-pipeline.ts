// BOIDS

import { vec3 } from "../gl-matrix.js";
import { jitter } from "../math.js";
import { range } from "../util.js";
import {
  CY,
  CyTexturePtr,
  linearSamplerPtr,
  canvasTexturePtr,
} from "./gpu-registry.js";
import { createCyStruct } from "./gpu-struct.js";
import { sceneBufPtr, canvasDepthTex } from "./std-pipeline.js";

const BoidData = createCyStruct({
  pos: "vec3<f32>",
  vel: "vec3<f32>",
});
const numBoids = 1500;
const boidData0 = CY.registerManyBufPtr("boidData0", {
  struct: BoidData,
  init: () =>
    range(numBoids).map((_, i) => ({
      pos: [jitter(10), jitter(10), jitter(10)] as vec3,
      vel: [jitter(10), jitter(10), jitter(10)] as vec3,
    })),
});
const boidData1 = CY.registerManyBufPtr("boidData1", {
  struct: BoidData,
  init: () => numBoids,
});
const BoidVert = createCyStruct({
  pos: "vec3<f32>",
});

const boidVerts = CY.registerManyBufPtr("boidVerts", {
  struct: BoidVert,
  init: () => [
    { pos: [1, 1, 1] },
    { pos: [1, -1, -1] },
    { pos: [-1, 1, -1] },
    { pos: [-1, -1, 1] },
  ],
});
const boidInds = CY.registerIdxBufPtr("boidIdx", {
  init: () => new Uint16Array([2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 3, 1]),
});
const boidResize: CyTexturePtr["onCanvasResize"] = (w, h) => [w / 2, h / 2];
const boidOutTex = CY.registerTexPtr("boidTex", {
  size: [200, 200],
  onCanvasResize: boidResize,
  format: "rgba8unorm",
  // TODO(@darzu): ANTI-ALIAS
  // sampleCount: antiAliasSampleCount,
  init: () => undefined,
});
const boidDepthTex = CY.registerDepthTexPtr("boidDepth", {
  size: [200, 200],
  format: "depth32float",
  onCanvasResize: boidResize,
  // TODO(@darzu): ANTI-ALIAS
  // sampleCount: antiAliasSampleCount,
  init: () => undefined,
});
export const boidRender = CY.registerRenderPipeline("boidRender", {
  globals: [sceneBufPtr],
  meshOpt: {
    index: boidInds,
    instance: boidData0,
    vertex: boidVerts,
    stepMode: "per-instance",
  },
  // output: canvasTexturePtr,
  output: boidOutTex,
  depthStencil: boidDepthTex,
  shader: () => {
    return `
    struct VertexOutput {
      @builtin(position) pos: vec4<f32>,
      @location(0) worldPos: vec3<f32>,
    }

    @stage(vertex)
    fn vert_main(vIn: VertexInput, iIn: InstanceInput) -> VertexOutput {
      // let angle = -atan2(iIn.vel.x, iIn.vel.y);
      // let posXY = vec2<f32>(
      //     (vIn.pos.x * cos(angle)) - (vIn.pos.y * sin(angle)),
      //     (vIn.pos.x * sin(angle)) + (vIn.pos.y * cos(angle)));
      // let worldPos = vec3<f32>(posXY * 0.1 + iIn.pos.xy, vIn.pos.z * 0.1 + iIn.pos.z);
      let worldPos = vec3<f32>(vIn.pos.xyz * 0.1 + iIn.pos.xyz);
      var output: VertexOutput;
      output.worldPos = worldPos;
      output.pos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);
      return output;
    }

    @stage(fragment)
    fn frag_main(v: VertexOutput) -> @location(0) vec4<f32> {
      let norm = -normalize(cross(dpdx(v.worldPos.xyz), dpdy(v.worldPos.xyz)));
      // let norm = -normalize(cross(dpdx(v.worldPos.xyz), -dpdy(v.worldPos.xyz)));
      let light1 : f32 = clamp(dot(-scene.light1Dir, norm), 0.0, 1.0);
      let light2 : f32 = clamp(dot(-scene.light2Dir, norm), 0.0, 1.0);
      let light3 : f32 = clamp(dot(-scene.light3Dir, norm), 0.0, 1.0);
      let color = vec3<f32>(1.0, 1.0, 1.0)
          * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
      return vec4<f32>(color.xyz, 1.0);
    }
  `;
  },
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
const boidParams = CY.registerOneBufPtr("boidParams", {
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
  Parameters<typeof CY.registerCompPipeline>[1],
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

export const boidComp0 = CY.registerCompPipeline("boidComp0", {
  ...boidCompDesc,
  globals: [
    boidParams,
    { ptr: boidData0, access: "read", alias: "inBoids" },
    { ptr: boidData1, access: "write", alias: "outBoids" },
  ],
});
export const boidComp1 = CY.registerCompPipeline("boidComp1", {
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
const boidWindowUni = CY.registerOneBufPtr("boidWindow", {
  struct: boidWindow,
  init: () => ({
    xPos: [0, 1],
    yPos: [0, 1],
  }),
});

export const boidCanvasMerge = CY.registerRenderPipeline("boidCanvasMerge", {
  globals: [
    // // { ptr: nearestSamplerPtr, alias: "mySampler" },
    { ptr: linearSamplerPtr, alias: "mySampler" },
    { ptr: boidDepthTex, alias: "myTexture" },
    // { ptr: boidOutTex, alias: "myTexture" },
    boidWindowUni,
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: canvasTexturePtr,
  depthStencil: canvasDepthTex,
  shader: () => {
    return `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
};

@stage(vertex)
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(boidWindow.xPos.x, boidWindow.yPos.x),
    vec2<f32>(boidWindow.xPos.y, boidWindow.yPos.x),
    vec2<f32>(boidWindow.xPos.y, boidWindow.yPos.y),
    vec2<f32>(boidWindow.xPos.x, boidWindow.yPos.y),
    vec2<f32>(boidWindow.xPos.x, boidWindow.yPos.x),
    vec2<f32>(boidWindow.xPos.y, boidWindow.yPos.y),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@stage(fragment)
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(textureSample(myTexture, mySampler, fragUV));
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
