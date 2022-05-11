import { mat4 } from "../gl-matrix.js";
import { createCyMany, createCyOne } from "./data.js";
import {
  createMeshPool_WebGPU,
  MeshHandle,
  MeshPoolOpts,
} from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import {
  SceneStruct,
  RopeStickStruct,
  RopePointStruct,
  MeshUniformStruct,
  VertexStruct,
  generateRopeGrid,
  setupScene,
  ClothTexDesc,
  ClothSamplerDesc,
  initClothTex,
} from "./pipelines.js";
import { Renderer } from "./renderer.js";
import {
  cloth_shader,
  rope_shader,
  obj_vertShader,
  obj_fragShader,
  particle_shader,
} from "./shaders.js";

const PIXEL_PER_PX: number | null = null; // 0.5;

// render pipeline parameters
const antiAliasSampleCount = 4;
const depthStencilFormat = "depth24plus-stencil8";

export interface Renderer_WebGPU extends Renderer {}

// TODO(@darzu): use ECS?
interface CyCompPipeline {
  // TODO(@darzu):
}
let compPipelines = [];
export function registerCompPipeline(pipeline: CyCompPipeline) {
  // TODO(@darzu):
  // do we want an entirely descriptive pipeline thing?
  // or we could register with access to ECS resources
}

export function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext,
  adapter: GPUAdapter,
  maxMeshes: number,
  maxVertices: number
): Renderer_WebGPU {
  let renderer: Renderer_WebGPU = {
    drawLines: true,
    drawTris: true,
    backgroundColor: [0.6, 0.63, 0.6],

    addMesh,
    addMeshInstance,
    updateMesh,
    renderFrame,
  };

  let clothReadIdx = 1;

  const opts: MeshPoolOpts = {
    maxMeshes,
    maxTris: maxVertices,
    maxVerts: maxVertices,
    maxLines: maxVertices * 2,
    shiftMeshIndices: false,
  };

  let pool = createMeshPool_WebGPU(device, opts);
  let sceneUni = createCyOne(device, SceneStruct, setupScene());
  let canvasFormat = context.getPreferredFormat(adapter);

  // Rope data
  const { ropePointData, ropeStickData } = generateRopeGrid();
  let ropePointBuf = createCyMany(
    device,
    RopePointStruct,
    GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
    ropePointData
  );
  let ropeStickBuf = createCyMany(
    device,
    RopeStickStruct,
    GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
    ropeStickData
  );
  let cmpRopeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      SceneStruct.layout(0, GPUShaderStage.COMPUTE, "uniform"),
      RopePointStruct.layout(1, GPUShaderStage.COMPUTE, "storage"),
      RopeStickStruct.layout(2, GPUShaderStage.COMPUTE, "read-only-storage"),
    ],
  });
  let cmpRopePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cmpRopeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: rope_shader(),
      }),
      entryPoint: "main",
    },
  });

  // cloth data
  let clothTextures = [
    device.createTexture(ClothTexDesc),
    device.createTexture(ClothTexDesc),
  ];
  let clothSampler = device.createSampler(ClothSamplerDesc);
  initClothTex(device.queue, clothTextures[0]);

  let cmpClothBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "unfilterable-float" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { format: "rgba32float", access: "write-only" },
      },
    ],
  });
  let cmpClothPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [cmpClothBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: cloth_shader(),
      }),
      entryPoint: "main",
    },
  });

  // TODO(@darzu): ROPE
  // TODO(@darzu): Looks like there are alignment requirements even on
  //    the vertex buffer! https://www.w3.org/TR/WGSL/#alignment-and-size
  const particleVertexBufferData = new Float32Array([
    // 0, 1, 0, 0 /*alignment*/, -1, 0, -1, 0 /*alignment*/, 1, 0, -1,
    // 0 /*alignment*/, 0, 0, 1, 0 /*alignment*/,
    1, 1, 1, 0 /*alignment*/, 1, -1, -1, 0 /*alignment*/, -1, 1, -1,
    0 /*alignment*/, -1, -1, 1, 0 /*alignment*/,
  ]);
  let particleVertexBuffer = device.createBuffer({
    size: particleVertexBufferData.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(particleVertexBuffer.getMappedRange()).set(
    particleVertexBufferData
  );
  particleVertexBuffer.unmap();

  const particleIndexBufferData = new Uint16Array([
    2, 1, 0, 3, 2, 0, 1, 3, 0, 2, 3, 1,
  ]);
  let particleIndexBuffer = device.createBuffer({
    size: particleIndexBufferData.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint16Array(particleIndexBuffer.getMappedRange()).set(
    particleIndexBufferData
  );
  particleIndexBuffer.unmap();

  // render bundle
  let bundledMIds = new Set<number>();
  let needsRebundle = false;
  let lastWireMode: [boolean, boolean] = [
    renderer.drawLines,
    renderer.drawTris,
  ];
  let renderBundle: GPURenderBundle;
  updateRenderBundle([]);

  function gpuBufferWriteAllMeshUniforms(handles: MeshHandle[]) {
    // TODO(@darzu): make this update all meshes at once
    for (let m of handles) {
      pool.updateUniform(m);
    }
  }

  // recomputes textures, widths, and aspect ratio on canvas resize
  let depthTexture: GPUTexture | null = null;
  let depthTextureView: GPUTextureView | null = null;
  let canvasTexture: GPUTexture | null = null;
  let canvasTextureView: GPUTextureView | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  function checkCanvasResize() {
    const devicePixelRatio = PIXEL_PER_PX
      ? PIXEL_PER_PX
      : window.devicePixelRatio || 1;
    const newWidth = canvas.clientWidth * devicePixelRatio;
    const newHeight = canvas.clientHeight * devicePixelRatio;
    if (lastWidth === newWidth && lastHeight === newHeight) return;

    console.log(`devicePixelRatio: ${devicePixelRatio}`);

    if (depthTexture) depthTexture.destroy();
    if (canvasTexture) canvasTexture.destroy();

    const newSize = [newWidth, newHeight] as const;

    context.configure({
      device: device,
      format: canvasFormat, // presentationFormat
      size: newSize,
      // TODO(@darzu): support transparency?
      compositingAlphaMode: "opaque",
    });

    depthTexture = device.createTexture({
      size: newSize,
      format: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthTextureView = depthTexture.createView();

    canvasTexture = device.createTexture({
      size: newSize,
      sampleCount: antiAliasSampleCount,
      format: canvasFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    canvasTextureView = canvasTexture.createView();

    lastWidth = newWidth;
    lastHeight = newHeight;
  }

  function canvasAttachment(): GPURenderPassColorAttachment {
    return {
      view: canvasTextureView!,
      resolveTarget: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: {
        r: renderer.backgroundColor[0],
        g: renderer.backgroundColor[1],
        b: renderer.backgroundColor[2],
        a: 1,
      },
      storeOp: "store",
    };
  }

  function depthAttachment(): GPURenderPassDepthStencilAttachment {
    return {
      view: depthTextureView!,
      depthLoadOp: "clear",
      depthClearValue: 1.0,
      depthStoreOp: "store",
      stencilLoadOp: "clear",
      stencilClearValue: 0,
      stencilStoreOp: "store",
    };
  }

  function addMesh(m: Mesh): MeshHandle {
    const handle: MeshHandle = pool.addMesh(m);
    return handle;
  }
  function addMeshInstance(oldHandle: MeshHandle): MeshHandle {
    const d = MeshUniformStruct.clone(oldHandle.shaderData);
    const newHandle = pool.addMeshInstance(oldHandle, d);
    return newHandle;
  }
  function updateMesh(handle: MeshHandle, newMeshData: Mesh) {
    pool.updateMeshVertices(handle, newMeshData);
  }

  function updateRenderBundle(handles: MeshHandle[]) {
    needsRebundle = false; // TODO(@darzu): hack?

    bundledMIds.clear();
    handles.forEach((h) => bundledMIds.add(h.mId));

    lastWireMode = [renderer.drawLines, renderer.drawTris];
    const modelUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        // TODO(@darzu): use CyBuffers .binding and .layout
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform",
            hasDynamicOffset: true,
            minBindingSize: MeshUniformStruct.size,
          },
        },
      ],
    });
    const modelUniBindGroup = device.createBindGroup({
      layout: modelUniBindGroupLayout,
      entries: [
        // TODO(@darzu): use CyBuffers .binding and .layout
        {
          binding: 0,
          resource: {
            buffer: pool.uniformBuffer,
            size: MeshUniformStruct.size,
          },
        },
      ],
    });

    const prim_tris: GPUPrimitiveState = {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    };
    const prim_lines: GPUPrimitiveState = {
      topology: "line-list",
    };

    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        SceneStruct.layout(
          0,
          GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "uniform"
        ),
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

    const renderSceneUniBindGroup = device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [
        sceneUni.binding(0),
        // TODO(@darzu): DISP
        {
          binding: 1,
          resource: clothSampler,
        },
        {
          binding: 2,
          resource: clothTextures[clothReadIdx].createView(),
        },
      ],
    });

    // setup our second phase pipeline which renders meshes to the canvas
    const renderPipelineDesc_tris: GPURenderPipelineDescriptor = {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          renderSceneUniBindGroupLayout,
          modelUniBindGroupLayout,
        ],
      }),
      vertex: {
        module: device.createShaderModule({ code: obj_vertShader() }),
        entryPoint: "main",
        buffers: [VertexStruct.vertexLayout("vertex", 0)],
      },
      fragment: {
        module: device.createShaderModule({ code: obj_fragShader() }),
        entryPoint: "main",
        targets: [{ format: canvasFormat }],
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
    const renderPipeline_tris = device.createRenderPipeline(
      renderPipelineDesc_tris
    );
    const renderPipelineDesc_lines: GPURenderPipelineDescriptor = {
      ...renderPipelineDesc_tris,
      primitive: prim_lines,
    };
    const renderPipeline_lines = device.createRenderPipeline(
      renderPipelineDesc_lines
    );

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats: [canvasFormat],
      depthStencilFormat: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
    });

    // render triangles and lines
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setVertexBuffer(0, pool.verticesBuffer.buffer);

    // render triangles first
    if (renderer.drawTris) {
      bundleEnc.setPipeline(renderPipeline_tris);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.triIndicesBuffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        bundleEnc.drawIndexed(
          m.numTris * 3,
          undefined,
          m.triIndicesNumOffset,
          m.vertNumOffset
        );
      }
    }

    // then render lines
    if (renderer.drawLines) {
      bundleEnc.setPipeline(renderPipeline_lines);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.lineIndicesBuffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
        bundleEnc.drawIndexed(
          m.numLines * 2,
          undefined,
          m.lineIndicesNumOffset,
          m.vertNumOffset
        );
      }
    }

    // draw particles
    const particleShader = device.createShaderModule({
      code: particle_shader(),
    });
    const rndrRopePipeline = device.createRenderPipeline({
      primitive: renderPipelineDesc_tris.primitive,
      depthStencil: renderPipelineDesc_tris.depthStencil,
      multisample: renderPipelineDesc_tris.multisample,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [renderSceneUniBindGroupLayout],
      }),
      vertex: {
        module: particleShader,
        entryPoint: "vert_main",
        buffers: [
          {
            stepMode: "vertex",
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 4,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          RopePointStruct.vertexLayout("instance", 1),
        ],
      },
      fragment: {
        module: particleShader,
        entryPoint: "frag_main",
        targets: [
          {
            format: canvasFormat,
          },
        ],
      },
    });

    bundleEnc.setPipeline(rndrRopePipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setIndexBuffer(particleIndexBuffer, "uint16");
    bundleEnc.setVertexBuffer(0, particleVertexBuffer);
    bundleEnc.setVertexBuffer(1, ropePointBuf.buffer);
    bundleEnc.drawIndexed(12, ropePointBuf.length, 0, 0);

    renderBundle = bundleEnc.finish();
    return renderBundle;
  }

  function renderFrame(viewProj: mat4, handles: MeshHandle[]): void {
    checkCanvasResize();

    // update scene data
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      time: 1000 / 60,
      cameraViewProjMatrix: viewProj,
    });

    // update all mesh transforms
    gpuBufferWriteAllMeshUniforms(handles);

    // TODO(@darzu): more fine grain
    needsRebundle =
      needsRebundle ||
      bundledMIds.size !== handles.length ||
      renderer.drawLines !== lastWireMode[0] ||
      renderer.drawTris !== lastWireMode[1];
    if (!needsRebundle) {
      for (let mId of handles.map((o) => o.mId)) {
        if (!bundledMIds.has(mId)) {
          needsRebundle = true;
          break;
        }
      }
    }
    if (needsRebundle) {
      // console.log("rebundeling");
      updateRenderBundle(handles);
    }

    // start collecting our render commands for this frame
    const commandEncoder = device.createCommandEncoder();

    // run compute tasks
    const clothWriteIdx = clothReadIdx;
    clothReadIdx = (clothReadIdx + 1) % 2;
    const cmpClothBindGroup = device.createBindGroup({
      layout: cmpClothPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 1,
          resource: clothTextures[clothReadIdx].createView(),
        },
        {
          binding: 2,
          resource: clothTextures[clothWriteIdx].createView(),
        },
      ],
    });

    const cmpClothPassEncoder = commandEncoder.beginComputePass();
    cmpClothPassEncoder.setPipeline(cmpClothPipeline);
    cmpClothPassEncoder.setBindGroup(0, cmpClothBindGroup);
    cmpClothPassEncoder.dispatchWorkgroups(1);
    cmpClothPassEncoder.end();

    const cmpRopeBindGroup = device.createBindGroup({
      layout: cmpRopeBindGroupLayout,
      entries: [
        sceneUni.binding(0),
        ropePointBuf.binding(1),
        ropeStickBuf.binding(2),
      ],
    });
    const cmpRopePassEncoder = commandEncoder.beginComputePass();
    cmpRopePassEncoder.setPipeline(cmpRopePipeline);
    cmpRopePassEncoder.setBindGroup(0, cmpRopeBindGroup);
    cmpRopePassEncoder.dispatchWorkgroups(1);
    cmpRopePassEncoder.end();

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [canvasAttachment()],
      depthStencilAttachment: depthAttachment(),
    });

    renderPassEncoder.executeBundles([renderBundle]);
    renderPassEncoder.end();

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  return renderer;
}
