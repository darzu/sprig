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

import { CyBuffer, CyStruct, createCyOne, createCyMany } from "./data.js";

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
