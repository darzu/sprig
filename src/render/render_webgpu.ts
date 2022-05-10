import { mat4, vec3 } from "../gl-matrix.js";
import { createCyMany, createCyOne, createCyStruct, CyToTS } from "./data.js";
import {
  createMeshPool_WebGPU,
  MeshHandle,
  MeshPoolOpts,
} from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import {
  SceneStruct,
  RopeStickTS,
  CLOTH_W,
  RopeStickStruct,
  RopePointStruct,
  cloth_shader,
  rope_shader,
  MeshUniformStruct,
  obj_vertShader,
  VertexStruct,
  obj_fragShader,
  particle_shader,
  RopePointTS,
  SceneTS,
} from "./pipelines.js";
import { Renderer } from "./renderer.js";

const PIXEL_PER_PX: number | null = null; // 0.5;

// TODO: some state lives in global variables when it should live on the Renderer object

// shaders

// render pipeline parameters
const antiAliasSampleCount = 4;
const depthStencilFormat = "depth24plus-stencil8";

// export interface MeshObj {
//   id: number;
//   meshHandle: MeshHandle;
//   transform: mat4;
//   renderable: Renderable;
// }

const CLOTH_SIZE = 10; // TODO(@darzu):

export interface Renderer_WebGPU extends Renderer {}

export function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUPresentationContext,
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
    removeMesh,
  };

  let clothReadIdx = 1;

  let depthTexture: GPUTexture | null = null;
  let depthTextureView: GPUTextureView | null = null;
  let colorTexture: GPUTexture | null = null;
  let colorTextureView: GPUTextureView | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  let presentationFormat = context.getPreferredFormat(adapter);

  const opts: MeshPoolOpts = {
    maxMeshes,
    maxTris: maxVertices,
    maxVerts: maxVertices,
    maxLines: maxVertices * 2,
    shiftMeshIndices: false,
  };

  let pool = createMeshPool_WebGPU(device, opts);

  // sceneUniformBuffer = device.createBuffer({
  //   size: SceneUniform.ByteSizeAligned,
  //   usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  //   mappedAtCreation: false,
  // });
  let sceneUni = createCyOne(device, SceneStruct);

  // setup scene data:
  // TODO(@darzu): allow init to pass in above
  sceneUni.queueUpdate(setupScene());

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

  // Serialize rope data
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

  // Displacement map
  // TODO(@darzu): DISP
  const createClothTex = () =>
    device.createTexture({
      size: [CLOTH_SIZE, CLOTH_SIZE],
      format: "rgba32float", // TODO(@darzu): format?
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING,
    });
  let clothTextures = [createClothTex(), createClothTex()];
  let clothSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  // update cloth data
  // TODO(@darzu): DISP
  const clothData = new Float32Array(10 * 10 * 4);
  for (let x = 0; x < 10; x++) {
    for (let y = 0; y < 10; y++) {
      const i = (y + x * 10) * 3;
      clothData[i + 0] = i / clothData.length;
      clothData[i + 1] = i / clothData.length;
      clothData[i + 2] = i / clothData.length;
    }
  }
  // for (let i = 0; i < clothData.length; i++)
  //   clothData[i] = i * (1 / clothData.length);
  device.queue.writeTexture(
    { texture: clothTextures[0] },
    clothData,
    {
      offset: 0,
      bytesPerRow: 10 * Float32Array.BYTES_PER_ELEMENT * 4,
      rowsPerImage: 10,
    },
    {
      width: 10,
      height: 10,
      depthOrArrayLayers: 1,
    }
  );

  // TODO(@darzu): DISP
  let cmpClothPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: cloth_shader(),
      }),
      entryPoint: "main",
    },
  });

  // TODO(@darzu): ROPE
  let cmpRopeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // TODO(@darzu): move into CyBuffer system
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
          minBindingSize: ropePointBuf.struct.size,
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
          minBindingSize: ropeStickBuf.struct.size,
        },
      },
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

  let bundledMIds = new Set<number>();
  let needsRebundle = false;
  let lastWireMode: [boolean, boolean] = [
    renderer.drawLines,
    renderer.drawTris,
  ];
  let renderBundle: GPURenderBundle;

  // render everything else
  createRenderBundle([]);

  function gpuBufferWriteAllMeshUniforms(handles: MeshHandle[]) {
    // TODO(@darzu): make this update all meshes at once
    for (let m of handles) {
      pool.updateUniform(m);
    }
  }

  // recomputes textures, widths, and aspect ratio on canvas resize
  function checkCanvasResize() {
    const devicePixelRatio = PIXEL_PER_PX
      ? PIXEL_PER_PX
      : window.devicePixelRatio || 1;
    const newWidth = canvas.clientWidth * devicePixelRatio;
    const newHeight = canvas.clientHeight * devicePixelRatio;
    if (lastWidth === newWidth && lastHeight === newHeight) return;

    console.log(`devicePixelRatio: ${devicePixelRatio}`);

    if (depthTexture) depthTexture.destroy();
    if (colorTexture) colorTexture.destroy();

    const newSize = [newWidth, newHeight] as const;

    context.configure({
      device: device,
      format: presentationFormat, // presentationFormat
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

    colorTexture = device.createTexture({
      size: newSize,
      sampleCount: antiAliasSampleCount,
      format: presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    colorTextureView = colorTexture.createView();

    lastWidth = newWidth;
    lastHeight = newHeight;
  }

  /*
    Adds an object to be rendered. Currently expects the GPU's buffers to be memory-mapped.
                  
    TODO: support adding objects when buffers aren't memory-mapped using device.queue
  */
  function addMesh(m: Mesh): MeshHandle {
    const handle: MeshHandle = pool.addMesh(m);

    // TODO(@darzu): determine rebundle
    // needsRebundle = true;
    return handle;
  }
  function addMeshInstance(oldHandle: MeshHandle): MeshHandle {
    // console.log(`Adding (instanced) object`);

    const d = MeshUniformStruct.clone(oldHandle.shaderData);
    const newHandle = pool.addMeshInstance(oldHandle, d);

    // handles[o.id] = res;

    // TODO(@darzu): determine rebundle
    // needsRebundle = true;
    return newHandle;
  }
  function updateMesh(handle: MeshHandle, newMeshData: Mesh) {
    pool.updateMeshVertices(handle, newMeshData);
  }

  function removeMesh(h: MeshHandle) {
    // TODO(@darzu): we need to free up vertices
    //delete handles[o.id];
    // TODO(@darzu): determine rebundle a different way
    needsRebundle = true;
    console.warn(`TODO: impl removeMesh`);
  }

  function createRenderBundle(handles: MeshHandle[]) {
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

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const prim_tris: GPUPrimitiveState = {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    };
    const prim_lines: GPUPrimitiveState = {
      topology: "line-list",
    };

    // define the resource bindings for the mesh rendering pipeline
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        sceneUni.struct.layout(0),
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
        targets: [{ format: presentationFormat }],
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
      colorFormats: [presentationFormat],
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
    // TODO(@darzu): ROPE ?
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
          // {
          //   arrayStride: Vertex.ByteSize,
          //   attributes: Vertex.WebGPUFormat,
          // },
          {
            stepMode: "vertex",
            // arrayStride: Vertex.ByteSize,
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 4, // TODO(@darzu): alignment requirement?
            // arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
          ropePointBuf.struct.vertexLayout("instance", 1),
          // {
          //   stepMode: "instance",
          //   arrayStride: RopeStick.ByteSizeAligned,
          //   attributes: RopeStick.WebGPUFormat,
          // },
        ],
      },
      fragment: {
        module: particleShader,
        entryPoint: "frag_main",
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
    });
    bundleEnc.setPipeline(rndrRopePipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setIndexBuffer(particleIndexBuffer, "uint16");
    bundleEnc.setVertexBuffer(0, particleVertexBuffer);
    bundleEnc.setVertexBuffer(1, ropePointBuf.buffer);
    // bundleEnc.setVertexBuffer(2, ropeStickBuffer);
    bundleEnc.drawIndexed(12, ropePointBuf.length, 0, 0);
    // console.dir(rndrRopePipeline);
    // console.dir(particleIndexBuffer);
    // console.dir(particleVertexBuffer);
    // console.dir(ropeBuffer);
    // console.dir(ropeLen);
    // TODO(@darzu):

    renderBundle = bundleEnc.finish();
    return renderBundle;
  }

  // TODO(@darzu): DISP

  // let scratchSceneUni = new Uint8Array(SceneUniform.ByteSizeAligned);
  function renderFrame(viewProj: mat4, handles: MeshHandle[]): void {
    checkCanvasResize();

    // update scene data
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      time: 1000 / 60,
      cameraViewProjMatrix: viewProj,
    });
    // update rope data?
    // TODO(@darzu): ROPE
    // for (let i = 0; i < ropeLen; i++)
    //   RopePoint.serialize(
    //     scratchRopeData,
    //     i * RopePoint.ByteSizeAligned,
    //     ropeData[i]
    //   );
    // device.queue.writeBuffer(
    //   ropeBuffer,
    //   0,
    //   scratchRopeData.buffer
    // );
    // TODO(@darzu): how do we read out from a GPU buffer?

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
      createRenderBundle(handles);
    }

    // start collecting our render commands for this frame
    const commandEncoder = device.createCommandEncoder();

    // run compute tasks
    // TODO(@darzu): DISP
    const clothWriteIdx = clothReadIdx;
    clothReadIdx = (clothReadIdx + 1) % 2;
    const cmpClothBindGroup = device.createBindGroup({
      layout: cmpClothPipeline.getBindGroupLayout(0),
      entries: [
        // {
        //   binding: 0,
        //   resource: {
        //     buffer: simParamBuffer,
        //   },
        // },
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

    // TODO(@darzu): ROPE
    const cmpRopeBindGroup = device.createBindGroup({
      // layout: cmpRopePipeline.getBindGroupLayout(0),
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
      colorAttachments: [
        {
          view: colorTextureView!,
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: {
            r: renderer.backgroundColor[0],
            g: renderer.backgroundColor[1],
            b: renderer.backgroundColor[2],
            a: 1,
          },
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView!,
        depthLoadOp: "clear",
        depthClearValue: 1.0,
        depthStoreOp: "store",
        stencilLoadOp: "clear",
        stencilClearValue: 0,
        stencilStoreOp: "store",
      },
    });

    // TODO(@darzu): ROPE
    // render rope
    // {
    //   renderPassEncoder.setPipeline(renderPipeline);
    //   renderPassEncoder.setVertexBuffer(0, particleBuffers[(t + 1) % 2]);
    //   renderPassEncoder.setVertexBuffer(1, spriteVertexBuffer);
    //   renderPassEncoder.draw(3, numParticles, 0, 0);
    //   // renderPassEncoder.end();
    // }

    renderPassEncoder.executeBundles([renderBundle]);
    renderPassEncoder.end();

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  return renderer;
}

// TODO(@darzu): move somewhere else
export function setupScene(): SceneTS {
  // create a directional light and compute it's projection (for shadows) and direction
  const worldOrigin = vec3.fromValues(0, 0, 0);
  const D = 50;
  const light1Pos = vec3.fromValues(D, D * 2, D);
  const light2Pos = vec3.fromValues(-D, D * 1, D);
  const light3Pos = vec3.fromValues(0, D * 0.5, -D);
  const upVector = vec3.fromValues(0, 1, 0);
  // const lightViewMatrix = mat4.lookAt(
  //   mat4.create(),
  //   light1Pos,
  //   worldOrigin,
  //   upVector
  // );
  // const lightProjectionMatrix = mat4.ortho(
  //   mat4.create(),
  //   -80,
  //   80,
  //   -80,
  //   80,
  //   -200,
  //   300
  // );
  // const lightViewProjMatrix = mat4.multiply(
  //   mat4.create(),
  //   lightProjectionMatrix,
  //   lightViewMatrix
  // );
  const light1Dir = vec3.subtract(vec3.create(), worldOrigin, light1Pos);
  vec3.normalize(light1Dir, light1Dir);
  const light2Dir = vec3.subtract(vec3.create(), worldOrigin, light2Pos);
  vec3.normalize(light2Dir, light2Dir);
  const light3Dir = vec3.subtract(vec3.create(), worldOrigin, light3Pos);
  vec3.normalize(light3Dir, light3Dir);

  return {
    cameraViewProjMatrix: mat4.create(), // updated later
    // lightViewProjMatrix,
    light1Dir,
    light2Dir,
    light3Dir,
    cameraPos: vec3.create(), // updated later
    playerPos: [0, 0], // updated later
    time: 0, // updated later
  };
}
