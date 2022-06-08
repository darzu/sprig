import { vec3 } from "../gl-matrix.js";
import { CY } from "./gpu-registry.js";
import { createCyStruct, CyToTS } from "./gpu-struct.js";
import { sceneBufPtr, litTexturePtr, mainDepthTex } from "./std-scene.js";

export const RopeStickStruct = createCyStruct({
  aIdx: "u32",
  bIdx: "u32",
  length: "f32",
});
export type RopeStickTS = CyToTS<typeof RopeStickStruct.desc>;

export const RopePointStruct = createCyStruct(
  {
    position: "vec3<f32>",
    prevPosition: "vec3<f32>",
    locked: "f32",
  },
  {
    isUniform: false,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.position, offsets_32[0]);
      views.f32.set(data.prevPosition, offsets_32[1]);
      views.f32[offsets_32[2]] = data.locked;
    },
  }
);
export type RopePointTS = CyToTS<typeof RopePointStruct.desc>;

export const CLOTH_W = 12;

function generateRopeGrid(): {
  ropePointData: RopePointTS[];
  ropeStickData: RopeStickTS[];
} {
  // setup scene data:
  // TODO(@darzu): allow init to pass in above

  // setup rope
  // TODO(@darzu): ROPE
  const ropePointData: RopePointTS[] = [];
  const ropeStickData: RopeStickTS[] = [];
  // let n = 0;
  const idx = (x: number, y: number) => {
    if (x >= CLOTH_W || y >= CLOTH_W) return CLOTH_W * CLOTH_W;
    return x * CLOTH_W + y;
  };
  for (let x = 0; x < CLOTH_W; x++) {
    for (let y = 0; y < CLOTH_W; y++) {
      let i = idx(x, y);
      // assert(i === n, "i === n");
      const pos: vec3 = [x, y + 4, 0];
      const p: RopePointTS = {
        position: pos,
        prevPosition: pos,
        locked: 0.0,
      };
      ropePointData[i] = p;

      // if (y + 1 < W && x + 1 < W) {
      // if (y + 1 < W) {
      ropeStickData.push({
        aIdx: i,
        bIdx: idx(x, y + 1),
        length: 1.0,
      });
      // }

      // if (x + 1 < W) {
      ropeStickData.push({
        aIdx: i,
        bIdx: idx(x + 1, y),
        length: 1.0,
      });
      // }
      // }

      // n++;
    }
  }

  console.log(RopeStickStruct.wgsl(true));

  // fix points
  ropePointData[idx(0, CLOTH_W - 1)].locked = 1.0;
  ropePointData[idx(CLOTH_W - 1, CLOTH_W - 1)].locked = 1.0;
  // for (let i = 0; i < ropePointData.length; i++)
  //   if (ropePointData[i].locked > 0) console.log(`locked: ${i}`);
  // console.dir(ropePointData);
  // console.dir(ropeStickData);

  return { ropePointData, ropeStickData };
}
let _initRopePointData: RopePointTS[];
let _initRopeStickData: RopeStickTS[];

const genRopePointData = () => {
  if (!_initRopePointData) {
    let res = generateRopeGrid();
    _initRopePointData = res.ropePointData;
    _initRopeStickData = res.ropeStickData;
  }
  return _initRopePointData;
};
const genRopeStickData = () => {
  if (!_initRopeStickData) {
    let res = generateRopeGrid();
    _initRopePointData = res.ropePointData;
    _initRopeStickData = res.ropeStickData;
  }
  return _initRopeStickData;
};

const ropePointBufPtr = CY.createArray("ropePoint", {
  struct: RopePointStruct,
  init: genRopePointData,
});
const ropeStickBufPtr = CY.createArray("ropeStick", {
  struct: RopeStickStruct,
  init: genRopeStickData,
});
export const compRopePipelinePtr = CY.createComputePipeline("ropeComp", {
  globals: [sceneBufPtr, ropePointBufPtr, ropeStickBufPtr],
  shaderComputeEntry: "main",
  workgroupCounts: [1, 1, 1],
  shader: () =>
    `
// todo: pick workgroup size based on max rope system?
@stage(compute) @workgroup_size(${CLOTH_W ** 2})
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
var pIdx : u32 = GlobalInvocationID.x;

let p = ropePoints.ms[pIdx];

// ropePoints.ms[pIdx].locked = f32(pIdx) / 10.0;

// let gravity = 0.0;
let gravity = 0.00002;
// let gravity = 0.00001;

// this is setting color:
// ropePoints.ms[pIdx].position.z += 0.01;
// ropePoints.ms[pIdx].locked -= scene.time;

if (p.locked < 0.5) {
  let newPrev = p.position;
  let delta = p.position - p.prevPosition;
  let newPos = p.position + delta * 0.9 + vec3(0.0, -1.0, 0.0) * gravity * scene.time * scene.time;

// //   ropePoints.ms[pIdx].position *= 1.002;
  ropePoints.ms[pIdx].position = newPos;
  ropePoints.ms[pIdx].prevPosition = newPrev;
}

workgroupBarrier();

var i: u32 = 0u;
loop {
  if i >= 8u { break; }

  let sIdx = GlobalInvocationID.x * 2u + (i % 2u);
  let stick = ropeSticks.ms[sIdx];
  let a = ropePoints.ms[stick.aIdx];
  let b = ropePoints.ms[stick.bIdx];

  if stick.bIdx >= ${CLOTH_W ** 2}u { continue; }

  // if sIdx >= 9u { continue; }

  let center = (a.position + b.position) / 2.0;
  let diff = a.position - b.position;
  let sep = (length(diff) - stick.length) * 0.5;
  let dir = normalize(diff);
  let walk = dir * (sep * 0.95);
  let offset = dir * stick.length / 2.0;

  // ropePoints.ms[pIdx].locked = length(diff) / 7.0;
  // ropePoints.ms[pIdx].locked = abs(sep * 0.8);

  // // ropePoints.ms[stick.aIdx].locked += 0.01;
  // // ropePoints.ms[stick.bIdx].locked += 0.01;

  // // ropePoints.ms[sIdx].locked = f32(stick.aIdx); // / 10.0;

  // if (a.locked < 0.5) {
  if (a.locked < 0.5 && (i / 2u) % 2u == 0u) {
    ropePoints.ms[stick.aIdx].position -= walk;
    // ropePoints.ms[stick.aIdx].position = center + offset;
  }
  // if (b.locked < 0.5) {
  if (b.locked < 0.5 && (i / 2u) % 2u == 1u) {
    ropePoints.ms[stick.bIdx].position += walk;
    // ropePoints.ms[stick.bIdx].position = center - offset;
  }

  continuing {
    // TODO: bad perf ?
    workgroupBarrier();
    i++;
  }
}

}

`,
});

// rope particle render
const ParticleVertStruct = createCyStruct(
  {
    position: "vec3<f32>",
  },
  {
    isCompact: true,
  }
);
const initParticleVertData: () => CyToTS<
  typeof ParticleVertStruct.desc
>[] = () => [
  { position: [1, 1, 1] },
  { position: [1, -1, -1] },
  { position: [-1, 1, -1] },
  { position: [-1, -1, 1] },
];
const particleVertBufPtr = CY.createArray("particleVert", {
  struct: ParticleVertStruct,
  init: initParticleVertData,
});

const initParticleIdxData = () =>
  new Uint16Array([2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 3, 1]);

const particleIdxBufPtr = CY.createIdxBuf("particleIdx", {
  init: initParticleIdxData,
});

export const renderRopePipelineDesc = CY.createRenderPipeline("renderRope", {
  globals: [sceneBufPtr],
  meshOpt: {
    vertex: particleVertBufPtr,
    instance: ropePointBufPtr,
    index: particleIdxBufPtr,
    stepMode: "per-instance",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [litTexturePtr],
  depthStencil: mainDepthTex,
  shader: () =>
    `
struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec3<f32>,
};

@stage(vertex)
fn vert_main(vIn: VertexInput, iIn: InstanceInput) -> VertexOutput {
  let vertPos = vIn.position;
  let position = iIn.position;
  let prevPosition = iIn.prevPosition;
  let locked = iIn.locked;

  // return vec4<f32>(vertPos, 1.0);
  // let worldPos = vertPos;
  let worldPos = vertPos * 0.3 + position;
  let screenPos = scene.cameraViewProjMatrix * vec4<f32>(worldPos, 1.0);

  // return vec4<f32>(vertPos, 1.0);
  // return vec4<f32>(vertPos + position, 1.0);

  var output : VertexOutput;
  output.position = screenPos;
  output.color = vec3<f32>(locked, 0.0, 0.0);
  // output.color = vec3<f32>(0.0, f32(bIdx) / 10.0, locked);
  // output.color = vec3<f32>(f32(aIdx) / 10.0, 0.0, locked);
  // output.color = vec3<f32>(f32(aIdx) / 10.0, f32(bIdx) / 10.0, locked);
  // output.color = vec3<f32>(0.5, locked, 0.5);
  // output.color = vec3<f32>(0.5, locked.r, 0.5);

  return output;
}

@stage(fragment)
fn frag_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`,
});
