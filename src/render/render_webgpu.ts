import { mat4, vec3, quat } from "../gl-matrix.js";
import {
  createMeshPool_WebGPU,
  Mesh,
  MeshHandle,
  MeshPoolOpts,
  MeshPool_WebGPU,
  SceneUniform,
  Vertex,
} from "./mesh-pool.js";
import { RenderableConstruct, Renderer } from "./renderer.js";
import {
  line_fragShader,
  line_vertShader,
  MeshUniformMod,
  obj_fragShader,
  obj_vertShader,
} from "./shader_obj.js";

// const PIXEL_PER_PX: number | null = 0.5;
// const PIXEL_PER_PX: number | null = 0.2;
const PIXEL_PER_PX: number | null = 1.0;
// const PIXEL_PER_PX: number | null = null;

// TODO: some state lives in global variables when it should live on the Renderer object

// shaders

export const shaderSceneStruct = () => `
    struct Scene {
        ${SceneUniform.generateWGSLUniformStruct()}
    };
`;

// render pipeline parameters
const antiAliasSampleCount = 4;
const depthStencilFormat = "depth24plus-stencil8";

// export interface MeshObj {
//   id: number;
//   meshHandle: MeshHandle;
//   transform: mat4;
//   renderable: Renderable;
// }

export class Renderer_WebGPU implements Renderer {
  public drawLines = true;
  public drawTris = true;

  public backgroundColor: vec3 = [0.6, 0.63, 0.6];

  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private context: GPUPresentationContext;
  private adapter: GPUAdapter;
  private presentationFormat: GPUTextureFormat;

  private sceneUniformBuffer: GPUBuffer;

  // private handles: MeshObj[] = {};

  private pool: MeshPool_WebGPU;
  private sceneData: SceneUniform.Data;

  private renderBundle: GPURenderBundle;

  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private colorTexture: GPUTexture | null = null;
  private colorTextureView: GPUTextureView | null = null;
  private lastWidth = 0;
  private lastHeight = 0;

  private gpuBufferWriteAllMeshUniforms(handles: MeshHandle[]) {
    // TODO(@darzu): make this update all meshes at once
    for (let m of handles) {
      this.pool.updateUniform(m);
    }
  }

  // recomputes textures, widths, and aspect ratio on canvas resize
  private checkCanvasResize() {
    const devicePixelRatio = PIXEL_PER_PX
      ? PIXEL_PER_PX
      : window.devicePixelRatio || 1;
    const newWidth = this.canvas.clientWidth * devicePixelRatio;
    const newHeight = this.canvas.clientHeight * devicePixelRatio;
    if (this.lastWidth === newWidth && this.lastHeight === newHeight) return;

    console.log(`devicePixelRatio: ${devicePixelRatio}`);

    if (this.depthTexture) this.depthTexture.destroy();
    if (this.colorTexture) this.colorTexture.destroy();

    const newSize = [newWidth, newHeight] as const;

    this.context.configure({
      device: this.device,
      format: this.presentationFormat, // this.presentationFormat
      size: newSize,
      // TODO(@darzu): support transparency?
      compositingAlphaMode: "opaque",
    });

    this.depthTexture = this.device.createTexture({
      size: newSize,
      format: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTextureView = this.depthTexture.createView();

    this.colorTexture = this.device.createTexture({
      size: newSize,
      sampleCount: antiAliasSampleCount,
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.colorTextureView = this.colorTexture.createView();

    this.lastWidth = newWidth;
    this.lastHeight = newHeight;
  }

  /*
    Adds an object to be rendered. Currently expects the GPU's buffers to be memory-mapped.
                  
    TODO: support adding objects when buffers aren't memory-mapped using device.queue
  */
  public addMesh(m: Mesh): MeshHandle {
    const handle: MeshHandle = this.pool.addMesh(m);

    // TODO(@darzu): determine rebundle
    // this.needsRebundle = true;
    return handle;
  }
  public addMeshInstance(oldHandle: MeshHandle): MeshHandle {
    // console.log(`Adding (instanced) object`);

    const d = MeshUniformMod.CloneData(oldHandle.shaderData);
    const newHandle = this.pool.addMeshInstance(oldHandle, d);

    // handles[o.id] = res;

    // TODO(@darzu): determine rebundle
    // this.needsRebundle = true;
    return newHandle;
  }
  public updateMesh(handle: MeshHandle, newMeshData: Mesh) {
    this.pool.updateMeshVertices(handle, newMeshData);
  }

  removeMesh(h: MeshHandle) {
    // TODO(@darzu): we need to free up vertices
    //delete handles[o.id];
    // TODO(@darzu): determine rebundle a different way
    this.needsRebundle = true;
    console.warn(`TODO: impl removeMesh`);
  }

  bundledMIds = new Set<number>();
  needsRebundle = false;
  lastWireMode: [boolean, boolean] = [this.drawLines, this.drawTris];

  private createRenderBundle(handles: MeshHandle[]) {
    this.needsRebundle = false; // TODO(@darzu): hack?

    this.bundledMIds.clear();
    handles.forEach((h) => this.bundledMIds.add(h.mId));

    this.lastWireMode = [this.drawLines, this.drawTris];
    const modelUniBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform",
            hasDynamicOffset: true,
            minBindingSize: MeshUniformMod.byteSizeAligned,
          },
        },
      ],
    });
    const modelUniBindGroup = this.device.createBindGroup({
      layout: modelUniBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.pool.uniformBuffer,
            size: MeshUniformMod.byteSizeAligned,
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
    const renderSceneUniBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const renderSceneUniBindGroup = this.device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
    });

    // setup our second phase pipeline which renders meshes to the canvas
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
        buffers: [
          {
            arrayStride: Vertex.ByteSize,
            attributes: Vertex.WebGPUFormat,
          },
        ],
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
    const renderPipeline_tris = this.device.createRenderPipeline(
      renderPipelineDesc_tris
    );
    const renderPipelineDesc_lines: GPURenderPipelineDescriptor = {
      ...renderPipelineDesc_tris,
      vertex: {
        module: this.device.createShaderModule({ code: line_vertShader() }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: Vertex.ByteSize,
            attributes: Vertex.WebGPUFormat,
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: line_fragShader() }),
        entryPoint: "main",
        targets: [{ format: this.presentationFormat }],
      },
      primitive: prim_lines,
    };
    const renderPipeline_lines = this.device.createRenderPipeline(
      renderPipelineDesc_lines
    );

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const bundleEnc = this.device.createRenderBundleEncoder({
      colorFormats: [this.presentationFormat],
      depthStencilFormat: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
    });

    // render triangles and lines
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setVertexBuffer(0, this.pool.verticesBuffer);

    // render triangles first
    if (this.drawTris) {
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
    }

    // then render lines
    if (this.drawLines) {
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
    }

    this.renderBundle = bundleEnc.finish();
    return this.renderBundle;
  }

  constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUPresentationContext,
    adapter: GPUAdapter,
    maxMeshes: number,
    maxVertices: number
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.adapter = adapter;
    this.presentationFormat = context.getPreferredFormat(this.adapter);

    const opts: MeshPoolOpts = {
      maxMeshes,
      maxTris: maxVertices,
      maxVerts: maxVertices,
      maxLines: maxVertices * 2,
      shiftMeshIndices: false,
    };

    this.pool = createMeshPool_WebGPU(device, opts);

    this.sceneUniformBuffer = device.createBuffer({
      size: SceneUniform.ByteSizeAligned,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });

    // setup scene data:
    this.sceneData = setupScene();

    this.renderBundle = this.createRenderBundle([]);
  }

  private scratchMIDs = new Set<number>();

  private scratchSceneUni = new Uint8Array(SceneUniform.ByteSizeAligned);
  public renderFrame(viewProj: mat4, handles: MeshHandle[]): void {
    this.checkCanvasResize();

    this.sceneData.cameraViewProjMatrix = viewProj;

    SceneUniform.serialize(this.scratchSceneUni, 0, this.sceneData);
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      0,
      this.scratchSceneUni.buffer
    );

    // update all mesh transforms
    this.gpuBufferWriteAllMeshUniforms(handles);

    // TODO(@darzu): more fine grain
    this.needsRebundle =
      this.needsRebundle ||
      this.bundledMIds.size !== handles.length ||
      this.drawLines !== this.lastWireMode[0] ||
      this.drawTris !== this.lastWireMode[1];
    if (!this.needsRebundle) {
      for (let mId of handles.map((o) => o.mId)) {
        if (!this.bundledMIds.has(mId)) {
          this.needsRebundle = true;
          break;
        }
      }
      // this.scratchMIDs.clear();
      // // console.log(`r mId 24: ${!!m24.length}`);
      // // console.log(`webgpu rendering boat mId: ${this.bundledMIds.has(24)}`);
      // for (let mId of handles.map((o) => o.mId)) {
      //   this.scratchMIDs.add(mId);
      // }

      // for (let mId of this.scratchMIDs.values()) {
      //   if (!this.bundledMIds.has(mId)) {
      //     this.needsRebundle = true;
      //     break;
      //   }
      // }
      // for (let mId of this.bundledMIds.values()) {
      //   if (!this.scratchMIDs.has(mId)) {
      //     this.needsRebundle = true;
      //     break;
      //   }
      // }
    }
    if (this.needsRebundle) {
      // console.log("rebundeling");
      this.createRenderBundle(handles);
    }

    // start collecting our render commands for this frame
    const commandEncoder = this.device.createCommandEncoder();

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.colorTextureView!,
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: {
            r: this.backgroundColor[0],
            g: this.backgroundColor[1],
            b: this.backgroundColor[2],
            a: 1,
          },
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthLoadOp: "clear",
        depthClearValue: 1.0,
        depthStoreOp: "store",
        stencilLoadOp: "clear",
        stencilClearValue: 0,
        stencilStoreOp: "store",
      },
    });
    renderPassEncoder.executeBundles([this.renderBundle]);
    renderPassEncoder.end();

    // submit render passes to GPU
    this.device.queue.submit([commandEncoder.finish()]);
  }
}

// TODO(@darzu): move somewhere else
export function setupScene(): SceneUniform.Data {
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
    time: 0, // updated later
    playerPos: [0, 0], // updated later
    cameraPos: vec3.create(), // updated later
  };
}
