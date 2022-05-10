import {
  createCyMany,
  createCyOne,
  createCyStruct,
  CyBuffer,
  CyStruct,
  CyToTS,
} from "./data.js";

// TODO(@darzu):
export const VertexStruct = createCyStruct(
  {
    position: "vec3<f32>",
    color: "vec3<f32>",
    normal: "vec3<f32>",
    uv: "vec2<f32>",
  },
  {
    isCompact: true,
    serializer: ({ position, color, normal, uv }, _, offsets_32, views) => {
      views.f32.set(position, offsets_32[0]);
      views.f32.set(color, offsets_32[1]);
      views.f32.set(normal, offsets_32[2]);
      views.f32.set(uv, offsets_32[3]);
    },
  }
);

export const RopeStickStruct = createCyStruct({
  aIdx: "u32",
  bIdx: "u32",
  length: "f32",
});
export type RopeStickTS = CyToTS<typeof RopeStickStruct.desc>;

export const SceneStruct = createCyStruct(
  {
    cameraViewProjMatrix: "mat4x4<f32>",
    light1Dir: "vec3<f32>",
    light2Dir: "vec3<f32>",
    light3Dir: "vec3<f32>",
    cameraPos: "vec3<f32>",
    playerPos: "vec2<f32>",
    time: "f32",
  },
  {
    isUniform: true,
    serializer: (data, _, offsets_32, views) => {
      views.f32.set(data.cameraViewProjMatrix, offsets_32[0]);
      views.f32.set(data.light1Dir, offsets_32[1]);
      views.f32.set(data.light2Dir, offsets_32[2]);
      views.f32.set(data.light3Dir, offsets_32[3]);
      views.f32.set(data.cameraPos, offsets_32[4]);
      views.f32.set(data.playerPos, offsets_32[5]);
      views.f32[offsets_32[6]] = data.time;
    },
  }
);
export type SceneTS = CyToTS<typeof SceneStruct.desc>;

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

export const MeshUniformStruct = createCyStruct(
  {
    transform: "mat4x4<f32>",
    aabbMin: "vec3<f32>",
    aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
  },
  {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
      views.f32.set(d.transform, offsets_32[0]);
      views.f32.set(d.aabbMin, offsets_32[1]);
      views.f32.set(d.aabbMax, offsets_32[2]);
      views.f32.set(d.tint, offsets_32[3]);
    },
  }
);
export type MeshUniformTS = CyToTS<typeof MeshUniformStruct.desc>;

export const CLOTH_W = 12;

export const obj_vertShader = () =>
  `
  struct Scene {
    ${SceneStruct.wgsl(true)}
  };

    struct Model {
        ${MeshUniformStruct.wgsl(true)}
    };

    @group(0) @binding(0) var<uniform> scene : Scene;
    @group(0) @binding(1) var dispSampler: sampler;
    @group(0) @binding(2) var dispTexture: texture_2d<f32>;

    @group(1) @binding(0) var<uniform> model : Model;

    struct VertexOutput {
        @location(0) @interpolate(flat) normal : vec3<f32>,
        @location(1) @interpolate(flat) color : vec3<f32>,
        @location(2) worldPos: vec4<f32>,
        @builtin(position) position : vec4<f32>,
    };

    @stage(vertex)
    fn main(
        ${VertexStruct.wgsl(false, 0)}
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.transform * vec4<f32>(position, 1.0);

        // let uvInt: vec2<i32> = vec2<i32>(5, 5);
        // let uvInt: vec2<i32> = vec2<i32>(10, i32(uv.x + 5.0));
        let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
        let texDisp = textureLoad(dispTexture, uvInt, 0);

        // let finalPos = worldPos;
        // let finalPos = vec4<f32>(worldPos.xy, worldPos.z + uv.x * 10.0, worldPos.w);
        let finalPos = vec4<f32>(worldPos.xyz + texDisp.xyz, 1.0);

        output.worldPos = finalPos;
        output.position = scene.cameraViewProjMatrix * finalPos;
        output.normal = normalize(model.transform * vec4<f32>(normal, 0.0)).xyz;
        // output.color = vec3<f32>(f32(uvInt.x), f32(uvInt.y), 1.0);
        // output.color = texDisp.rgb;
        // output.color = vec3(uv.xy, 1.0);
        output.color = color + model.tint;
        return output;
    }
`;

// TODO(@darzu): use dynamic background color
// [0.6, 0.63, 0.6]

// TODO(@darzu): DISP
export const obj_fragShader = () =>
  `
  struct Scene {
    ${SceneStruct.wgsl(true)}
  };

    @group(0) @binding(0) var<uniform> scene : Scene;
    @group(0) @binding(1) var dispSampler: sampler;
    @group(0) @binding(2) var dispTexture: texture_2d<f32>;

    struct VertexOutput {
        @location(0) @interpolate(flat) normal : vec3<f32>,
        @location(1) @interpolate(flat) color : vec3<f32>,
        @location(2) worldPos: vec4<f32>,
    };

    @stage(fragment)
    fn main(input: VertexOutput) -> @location(0) vec4<f32> {
        let light1 : f32 = clamp(dot(-scene.light1Dir, input.normal), 0.0, 1.0);
        let light2 : f32 = clamp(dot(-scene.light2Dir, input.normal), 0.0, 1.0);
        let light3 : f32 = clamp(dot(-scene.light3Dir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color 
          * (light1 * 1.5 + light2 * 0.5 + light3 * 0.2 + 0.1);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));

        let fogDensity: f32 = 0.02;
        let fogGradient: f32 = 1.5;
        // let fogDist: f32 = 0.1;
        let fogDist: f32 = max(-input.worldPos.y - 10.0, 0.0);
        // output.fogVisibility = 0.9;
        let fogVisibility: f32 = clamp(exp(-pow(fogDist*fogDensity, fogGradient)), 0.0, 1.0);

        let backgroundColor: vec3<f32> = vec3<f32>(0.6, 0.63, 0.6);
        let finalColor: vec3<f32> = mix(backgroundColor, gammaCorrected, fogVisibility);
        return vec4<f32>(finalColor, 1.0);
        // return vec4<f32>(input.color, 1.0);
    }
`;

export const cloth_shader = () =>
  `
  // struct Params {
  //   filterDim : u32;
  //   blockDim : u32;
  // };
  
  // @group(0) @binding(0) var<uniform> params : Params;
  @group(0) @binding(1) var inTex : texture_2d<f32>;
  @group(0) @binding(2) var outTex : texture_storage_2d<rgba32float, write>;
  
  @stage(compute) @workgroup_size(10, 10)
  fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    // var index : u32 = GlobalInvocationID.x;

    // let dims : vec2<i32> = textureDimensions(inTex, 0);

    // let uv: vec2<f32> = vec2<f32>(0.5, 0.5);

    // let uvInt: vec2<i32> = vec2<i32>(i32(uv.x * 10.0), i32(uv.y * 10.0));
    let uvInt: vec2<i32> = vec2<i32>(GlobalInvocationID.xy);
    let texDisp = textureLoad(inTex, uvInt, 0);
  
    // textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz + vec3<f32>(0.01), 1.0));
    textureStore(outTex, uvInt, vec4<f32>(texDisp.xyz * 1.01, 1.0));
  }
  
  `;

export const rope_shader = () =>
  `
  struct Scene {
    ${SceneStruct.wgsl(true)}
  };

  @group(0) @binding(0) var<uniform> scene : Scene;

  struct RopePoint {
    ${RopePointStruct.wgsl(true)}
  };
  struct RopePoints {
    ropePoints : array<RopePoint>,
  };

  struct RopeStick {
    ${RopeStickStruct.wgsl(true)}
  };
  struct RopeSticks {
    ropeSticks : array<RopeStick>,
  };

  @group(0) @binding(1) var<storage, read_write> ropePoints : RopePoints;
  @group(0) @binding(2) var<storage, read> ropeSticks : RopeSticks;
  
  // todo: pick workgroup size based on max rope system?
  @stage(compute) @workgroup_size(${CLOTH_W ** 2})
  fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    var pIdx : u32 = GlobalInvocationID.x;

    let p = ropePoints.ropePoints[pIdx];

    // ropePoints.ropePoints[pIdx].locked = f32(pIdx) / 10.0;

    // let gravity = 0.0;
    let gravity = 0.00002;
    // let gravity = 0.00001;

    // this is setting color:
    // ropePoints.ropePoints[pIdx].position.z += 0.01;
    // ropePoints.ropePoints[pIdx].locked -= scene.time;

    if (p.locked < 0.5) {
      let newPrev = p.position;
      let delta = p.position - p.prevPosition;
      let newPos = p.position + delta * 0.9 + vec3(0.0, -1.0, 0.0) * gravity * scene.time * scene.time;

    // //   ropePoints.ropePoints[pIdx].position *= 1.002;
      ropePoints.ropePoints[pIdx].position = newPos;
      ropePoints.ropePoints[pIdx].prevPosition = newPrev;
    }
    
    workgroupBarrier();

    var i: u32 = 0u;
    loop {
      if i >= 8u { break; }

      let sIdx = GlobalInvocationID.x * 2u + (i % 2u);
      let stick = ropeSticks.ropeSticks[sIdx];
      let a = ropePoints.ropePoints[stick.aIdx];
      let b = ropePoints.ropePoints[stick.bIdx];

      if stick.bIdx >= ${CLOTH_W ** 2}u { continue; }

      // if sIdx >= 9u { continue; }

      let center = (a.position + b.position) / 2.0;
      let diff = a.position - b.position;
      let sep = (length(diff) - stick.length) * 0.5;
      let dir = normalize(diff);
      let walk = dir * (sep * 0.95);
      let offset = dir * stick.length / 2.0;

      // ropePoints.ropePoints[pIdx].locked = length(diff) / 7.0;
      // ropePoints.ropePoints[pIdx].locked = abs(sep * 0.8);

      // // ropePoints.ropePoints[stick.aIdx].locked += 0.01;
      // // ropePoints.ropePoints[stick.bIdx].locked += 0.01;

      // // ropePoints.ropePoints[sIdx].locked = f32(stick.aIdx); // / 10.0;

      // if (a.locked < 0.5) {
      if (a.locked < 0.5 && (i / 2u) % 2u == 0u) {
        ropePoints.ropePoints[stick.aIdx].position -= walk;
        // ropePoints.ropePoints[stick.aIdx].position = center + offset;
      }
      // if (b.locked < 0.5) {
      if (b.locked < 0.5 && (i / 2u) % 2u == 1u) {
        ropePoints.ropePoints[stick.bIdx].position += walk;
        // ropePoints.ropePoints[stick.bIdx].position = center - offset;
      }

      continuing {
        // TODO: bad perf ?
        workgroupBarrier();
        i++;
      }
    }

  }
  
  `;

// TODO(@darzu): ROPE
// Particle

export const particle_shader = () =>
  `
  struct Scene {
    ${SceneStruct.wgsl(true)}
  };

  @group(0) @binding(0) var<uniform> scene : Scene;
  

  struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec3<f32>,
  };

  @stage(vertex)
  fn vert_main(
    @location(0) vertPos : vec3<f32>,
    @location(1) position : vec3<f32>,
    @location(2) prevPosition : vec3<f32>,
    // @location(3) locked : vec3<f32>,
    @location(3) locked : f32,
    // @location(4) aIdx: u32,
    // @location(5) bIdx: u32,
    // @location(6) length: f32,
  ) -> VertexOutput {
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

`;

// EXPERIMENTS:
// Goal: post process with a blur effect
//    use compute shader to do a blur
// Goal: add boids to the sky as birds
//    use comptue shader to update boids
//    render via custom instanced tri shader
// Goal: split screen, multiple cameras
// Goal: deferred rendering
//    textures: 2 of rgba32float, albedo as bgra8unorm
//
//
// I should be able to describe my render pipeline
//    without access to the "device" or "canvas"

export interface CyCompPass {
  // TODO(@darzu): Pass, Pipeline, Layout, Description
}

export interface CyCompPipeline {
  // TODO(@darzu):
}

// a composition of pipelines/passes?
export interface CyTimeline {
  // TODO(@darzu):
}

// resource:
// var<storage, read>, read_write,
// var<uniform>
// array<RopePoint>
//
// we want static descriptions, top level
//  internally, instancing it will create CyOne and CyMany as needed
//  layout vs binding
//
// open questions:
//  - are resource just CyTypes or do they wrap them?
//  - CyBuffer or CyStruct needed?
//
// a render pass has 1-n target outputs
//    can have multiple pipelines and many draw calls per pass
export type CyResource = CyBuffer<any>;

if (false as true) {
  const device: GPUDevice = null as any;
  // const ropeCmp = createCyCompPipeline(
  //   device,
  //   [SceneStruct, RopePointStruct, RopeStickStruct],
  //   rope_shader()
  // );

  let SceneStruct: CyStruct<any> = null as any;
  let RopePointStruct: CyStruct<any> = null as any;
  let RopeStickStruct: CyStruct<any> = null as any;
  let rope_shader = () => "my shader";

  // TODO(@darzu): needs "name" in struct
  let ropePipelineDesc = {
    resources: [
      { struct: SceneStruct, memory: "uniform", parity: "one" },
      {
        struct: RopePointStruct,
        memory: "storage, read_write",
        parity: "many",
      },
      { struct: RopeStickStruct, memory: "storage, read", parity: "many" },
    ],
    shader: rope_shader,
  };

  let sceneUni = createCyOne(device, SceneStruct);
  let ropePointBuf = createCyMany(device, RopePointStruct, 0, 0);
  let ropeStickBuf = createCyMany(device, RopeStickStruct, 0, 0);

  let ropePipeline = createCyPipeline(device, ropePipelineDesc, [
    sceneUni,
    ropePointBuf,
    ropeStickBuf,
  ]);

  const commandEncoder = device.createCommandEncoder();

  ropePipeline.dispatch(commandEncoder);

  // TRI
  let ModelUniStruct: CyStruct<any> = null as any;
  let MyDispTexDesc = null as any;
  let VertexStruct: CyStruct<any> = null as any;
  let ParticleVertStruct: CyStruct<any> = null as any;
  let tri_shader = () => "foo"; // comp_main
  let presentationFormat = null;
  let MyCanvas = null;

  let triPipelineDesc = {
    resources: [
      { struct: SceneStruct, memory: "uniform", parity: "one" },
      // TODO(@darzu): how to describe this dynamic offset thing?
      { struct: ModelUniStruct, memory: "uniform", parity: "one" },
      { texture: MyDispTexDesc },
      { sampler: MyDispTexDesc },
    ],
    // TODO(@darzu): how to handle matching with index buffer?
    vertex: [VertexStruct],
    shader: tri_shader, // vert_main, frag_main
    output: MyCanvas,
  };

  let particlePipelineDesc = {
    resources: [{ struct: SceneStruct, memory: "uniform", parity: "one" }],
    // TODO(@darzu): how to handle matching with index buffer?
    vertex: [ParticleVertStruct],
    instance: [RopePointStruct],
    shader: tri_shader, // vert_main, frag_main
  };

  let GAlbedo = null;
  let GPosition = null;
  let GNormal = null;
  let writeDeffered = () => "writeDeffered";

  let deferredPipelineDesc = {
    resources: [
      { struct: SceneStruct, memory: "uniform", parity: "one" },
      // TODO(@darzu): how to describe this dynamic offset thing?
      { struct: ModelUniStruct, memory: "uniform", parity: "one" },
      { texture: MyDispTexDesc },
      { sampler: MyDispTexDesc },
    ],
    // TODO(@darzu): how to handle matching with index buffer?
    vertex: [VertexStruct],
    shader: writeDeffered, // vert_main, frag_main
    output: [GAlbedo, GPosition, GNormal],
  };

  let timeline = [ropePipelineDesc, triPipelineDesc, particlePipelineDesc];

  let CLOTH_SIZE = 10;

  let clothTexDesc: GPUTextureDescriptor = {
    size: [CLOTH_SIZE, CLOTH_SIZE],
    format: "rgba32float", // TODO(@darzu): format?
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING,
  };
  let clothSamplerDesc = {
    magFilter: "linear",
    minFilter: "linear",
  };

  let U16IdxStruct = null;
  let MeshUniformStruct = null;

  let SceneBufPtr = { struct: SceneStruct, parity: "one" };
  let MeshBufPtr = { struct: MeshUniformStruct, parity: "many" };
  let VertBufPtr = { struct: VertexStruct, parity: "many" };
  let TriBufPtr = { struct: U16IdxStruct, parity: "many" };

  // what makes mesh pools special?
  //   they have the vert, tri index, line index, mesh index data
  //   we need a draw descriptor,
  //   probably related to rebundle decisions,
  // why be declarative like this instead of just wrapping and simplifying
  //    the code APIs?

  let obj_vertShader = () => "obj_vertShader";
  let obj_fragShader = () => "obj_fragShader";

  const triPipelineDesc2 = {
    resources: [
      { buf: SceneBufPtr, memory: "uniform" },
      // TODO(@darzu): how to describe this dynamic offset thing?
      { texture: clothTexDesc },
      { sampler: clothSamplerDesc },
    ],
    // TODO(@darzu): how to handle matching with index buffer?
    meshPool: [
      { buf: MeshBufPtr, memory: "uniform" },
      { buf: VertBufPtr, memory: "vertex" },
      { buf: TriBufPtr, memory: "vertex" },
    ],
    vertShader: obj_vertShader(),
    fragShader: obj_fragShader(),
    output: "canvas",
  } as const;

  /*
    colorFormats: [this.presentationFormat],
    depthStencilFormat: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
    ...
    primitive: prim_tris,
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: depthStencilFormat,
    },
    multisample: {
      count: antiAliasSampleCount,
    },
    targets: [{ format: this.presentationFormat }],

    or deferred:
    targets: [
      // position
      { format: 'rgba32float' },
      // normal
      { format: 'rgba32float' },
      // albedo
      { format: 'bgra8unorm' },
    ],

    canvas size as a uniform
    
  */

  // let triPipeline = createCyPipeline(device,
}

function createCyPipeline(d: any, a: any, ...s: any[]) {
  return {
    dispatch: (a: any) => a,
  };
}

/* ROPE

  const cmpRopePassEncoder = commandEncoder.beginComputePass();
  cmpRopePassEncoder.setPipeline(this.cmpRopePipeline);
  cmpRopePassEncoder.setBindGroup(0, cmpRopeBindGroup);
  cmpRopePassEncoder.dispatchWorkgroups(1);
  cmpRopePassEncoder.end();

  struct Scene {
    ${SceneStruct.wgsl(true)}
  };
  @group(0) @binding(0) var<uniform> scene : Scene;

  struct RopePoint {
    ${RopePointStruct.wgsl(true)}
  };
  struct RopePoints {
    ropePoints : array<RopePoint>,
  };

  struct RopeStick {
    ${RopeStickStruct.wgsl(true)}
  };
  struct RopeSticks {
    ropeSticks : array<RopeStick>,
  };

  @group(0) @binding(1) var<storage, read_write> ropePoints : RopePoints;
  @group(0) @binding(2) var<storage, read> ropeSticks : RopeSticks;
*/

export function createCyCompPipeline(device: GPUDevice): CyCompPipeline {
  // const bindGroupLayout = device.createBindGroupLayout({
  //   entries: [
  //     // TODO(@darzu): move into CyBuffer system
  //     {
  //       binding: 0,
  //       visibility: GPUShaderStage.COMPUTE,
  //       buffer: { type: "uniform" },
  //     },
  //     {
  //       binding: 1,
  //       visibility: GPUShaderStage.COMPUTE,
  //       buffer: {
  //         type: "storage",
  //         minBindingSize: this.ropePointBuf.struct.size,
  //       },
  //     },
  //     {
  //       binding: 2,
  //       visibility: GPUShaderStage.COMPUTE,
  //       buffer: {
  //         type: "read-only-storage",
  //         minBindingSize: this.ropeStickBuf.struct.size,
  //       },
  //     },
  //   ],
  // });

  // const pipeline = device.createComputePipeline({
  //   layout: device.createPipelineLayout({
  //     bindGroupLayouts: [bindGroupLayout],
  //   }),
  //   compute: {
  //     module: device.createShaderModule({
  //       code: rope_shader(),
  //     }),
  //     entryPoint: "main",
  //   },
  // });

  const res: CyCompPipeline = {
    // TODO(@darzu):
  };

  return res;
}

/* TRIANGLES

    @group(0) @binding(0) var<uniform> scene : Scene;
    @group(0) @binding(1) var dispSampler: sampler;
    @group(0) @binding(2) var dispTexture: texture_2d<f32>;

    @group(1) @binding(0) var<uniform> model : Model;

  const renderPipelineDesc_tris: GPURenderPipelineDescriptor = {
    layout: this.device.createPipelineLayout({
      bindGroupLayouts: [
        renderSceneUniBindGroupLayout,
        modelUniBindGroupLayout,
      ],
    }),
    vertex: {
      module: this.device.createShaderModule({ code: obj_vertShader() }),
      entryPoint: "main",
      buffers: [VertexStruct.vertexLayout("vertex", 0)],
    },
    fragment: {
      module: this.device.createShaderModule({ code: obj_fragShader() }),
      entryPoint: "main",
      targets: [{ format: this.presentationFormat }],
    },
    primitive: prim_tris,
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: depthStencilFormat,
    },
    multisample: {
      count: antiAliasSampleCount,
    },
  };

  const bundleEnc = this.device.createRenderBundleEncoder({
    colorFormats: [this.presentationFormat],
    depthStencilFormat: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
  });

  // render triangles and lines
  bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
  bundleEnc.setVertexBuffer(0, this.pool.verticesBuffer.buffer);

  bundleEnc.setPipeline(renderPipeline_tris);
  // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
  bundleEnc.setIndexBuffer(this.pool.triIndicesBuffer, "uint16");
  for (let m of Object.values(handles)) {
    bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
    bundleEnc.drawIndexed(
      m.numTris * 3,
      undefined,
      m.triIndicesNumOffset,
      m.vertNumOffset
    );
  }

   const renderSceneUniBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        this.sceneUni.struct.layout(0),
        // TODO(@darzu): DISP
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }, // TODO(@darzu): what kind?
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" }, // TODO(@darzu): what type?
        },
      ],
    });
    const renderSceneUniBindGroup = this.device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [
        this.sceneUni.binding(0),
        // TODO(@darzu): DISP
        {
          binding: 1,
          resource: this.clothSampler,
        },
        {
          binding: 2,
          resource: this.clothTextures[this.clothReadIdx].createView(),
        },
      ],
    });

  LINES:

  bundleEnc.setPipeline(renderPipeline_lines);
  // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
  bundleEnc.setIndexBuffer(this.pool.lineIndicesBuffer, "uint16");
  for (let m of Object.values(handles)) {
    bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
    bundleEnc.drawIndexed(
      m.numLines * 2,
      undefined,
      m.lineIndicesNumOffset,
      m.vertNumOffset
    );
  }

  PARTICLES:
    
  bundleEnc.setPipeline(rndrRopePipeline);
  bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
  bundleEnc.setIndexBuffer(this.particleIndexBuffer, "uint16");
  bundleEnc.setVertexBuffer(0, this.particleVertexBuffer);
  bundleEnc.setVertexBuffer(1, this.ropePointBuf.buffer);
  // bundleEnc.setVertexBuffer(2, this.ropeStickBuffer);
  bundleEnc.drawIndexed(12, this.ropePointBuf.length, 0, 0);

  DEFERRED:
    this is a fairly succinct multi-pass description:

  const commandEncoder = device.createCommandEncoder();
  {
    // Write position, normal, albedo etc. data to gBuffers
    const gBufferPass = commandEncoder.beginRenderPass(
      writeGBufferPassDescriptor
    );
    gBufferPass.setPipeline(writeGBuffersPipeline);
    gBufferPass.setBindGroup(0, sceneUniformBindGroup);
    gBufferPass.setVertexBuffer(0, vertexBuffer);
    gBufferPass.setIndexBuffer(indexBuffer, 'uint16');
    gBufferPass.drawIndexed(indexCount);
    gBufferPass.end();
  }
  {
    // Update lights position
    const lightPass = commandEncoder.beginComputePass();
    lightPass.setPipeline(lightUpdateComputePipeline);
    lightPass.setBindGroup(0, lightsBufferComputeBindGroup);
    lightPass.dispatch(Math.ceil(kMaxNumLights / 64));
    lightPass.end();
  }
  {
    if (settings.mode === 'gBuffers view') {
      // GBuffers debug view
      // Left: position
      // Middle: normal
      // Right: albedo (use uv to mimic a checkerboard texture)
      textureQuadPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
      const debugViewPass = commandEncoder.beginRenderPass(
        textureQuadPassDescriptor
      );
      debugViewPass.setPipeline(gBuffersDebugViewPipeline);
      debugViewPass.setBindGroup(0, gBufferTexturesBindGroup);
      debugViewPass.setBindGroup(1, canvasSizeUniformBindGroup);
      debugViewPass.draw(6);
      debugViewPass.end();
    } else {
      // Deferred rendering
      textureQuadPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();
      const deferredRenderingPass = commandEncoder.beginRenderPass(
        textureQuadPassDescriptor
      );
      deferredRenderingPass.setPipeline(deferredRenderPipeline);
      deferredRenderingPass.setBindGroup(0, gBufferTexturesBindGroup);
      deferredRenderingPass.setBindGroup(1, lightsBufferBindGroup);
      deferredRenderingPass.setBindGroup(2, canvasSizeUniformBindGroup);
      deferredRenderingPass.draw(6);
      deferredRenderingPass.end();
    }
  }
  device.queue.submit([commandEncoder.finish()]);

  // fragment output
  struct GBufferOutput {
    @location(0) position : vec4<f32>;
    @location(1) normal : vec4<f32>;
    // Textures: diffuse color, specular color, smoothness, emissive etc. could go here
    @location(2) albedo : vec4<f32>;
  };
*/
