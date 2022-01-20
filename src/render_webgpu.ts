import { mat4, vec3, quat } from "./gl-matrix.js";
import {
  createMeshPoolBuilder_WebGPU,
  Mesh,
  MeshHandle,
  MeshPoolBuilder_WebGPU,
  MeshPoolOpts,
  MeshPool_WebGPU,
  MeshUniform,
  SceneUniform,
  Vertex,
} from "./mesh-pool.js";
import { Renderable } from "./renderer.js";
import { pitch } from "./utils-3d.js";

const PIXEL_PER_PX: number | null = null; // 0.5;

// TODO: some state lives in global variables when it should live on the Renderer object

// shaders

const shaderSceneStruct = `
    struct Scene {
        ${SceneUniform.GenerateWGSLUniformStruct()}
    };
`;
const vertexShader =
  shaderSceneStruct +
  `
    struct Model {
        ${MeshUniform.GenerateWGSLUniformStruct()}
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        ${Vertex.GenerateWGSLVertexInputStruct(",")}
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.transform * vec4<f32>(position, 1.0);
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.transform * vec4<f32>(normal, 0.0)).xyz;
        output.color = color + model.tint;
        return output;
    }
`;
const fragmentShader =
  shaderSceneStruct +
  `
    [[group(0), binding(0)]] var<uniform> scene : Scene;

    struct VertexOutput {
        [[location(0)]] [[interpolate(flat)]] normal : vec3<f32>;
        [[location(1)]] [[interpolate(flat)]] color : vec3<f32>;
    };

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

// render pipeline parameters
const antiAliasSampleCount = 4;
const depthStencilFormat = "depth24plus-stencil8";
const backgroundColor = { r: 0.6, g: 0.63, b: 0.6, a: 1.0 };

// export interface MeshObj {
//   id: number;
//   meshHandle: MeshHandle;
//   transform: mat4;
//   renderable: Renderable;
// }

export interface Renderer {
  drawLines: boolean;
  drawTris: boolean;
  finishInit(): void;
  addMesh(m: Mesh): MeshHandle;
  addMeshInstance(h: MeshHandle): MeshHandle;
  renderFrame(viewMatrix: mat4, handles: MeshHandle[]): void;
  removeMesh(h: MeshHandle): void;
  updateMesh(h: MeshHandle, m: Mesh): void;
}

export class Renderer_WebGPU implements Renderer {
  public drawLines = true;
  public drawTris = true;

  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private context: GPUPresentationContext;
  private adapter: GPUAdapter;
  private presentationFormat: GPUTextureFormat;

  private sceneUniformBuffer: GPUBuffer;

  // private handles: MeshObj[] = {};

  private initFinished: boolean = false;
  private builder: MeshPoolBuilder_WebGPU;
  private pool: MeshPool_WebGPU;
  private sceneData: SceneUniform.Data;

  private renderBundle: GPURenderBundle;

  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private colorTexture: GPUTexture | null = null;
  private colorTextureView: GPUTextureView | null = null;
  private lastWidth = 0;
  private lastHeight = 0;

  public finishInit() {
    if (this.initFinished) throw "finishInit called twice";
    this.builder.finish();
    this.initFinished = true;
  }

  private gpuBufferWriteAllMeshUniforms(handles: MeshHandle[]) {
    // TODO(@darzu): make this update all meshes at once
    for (let m of handles) {
      // TODO(@darzu): this is definitely weird. Need to think about this interaction better.
      // TODO(@darzu): ensure color is handled
      // if ((m.renderable as any).color)
      //   m.meshHandle.tint = (m.renderable as any).color;
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
    const handle: MeshHandle = this.initFinished
      ? this.pool.addMesh(m)
      : this.builder.addMesh(m);

    // TODO(@darzu): determine rebundle
    // this.needsRebundle = true;
    return handle;
  }
  public addMeshInstance(oldHandle: MeshHandle): MeshHandle {
    // console.log(`Adding (instanced) object`);

    const d = MeshUniform.CloneData(oldHandle);
    const newHandle = this.initFinished
      ? this.pool.addMeshInstance(oldHandle, d)
      : this.builder.addMeshInstance(oldHandle, d);

    // handles[o.id] = res;

    // TODO(@darzu): determine rebundle
    // this.needsRebundle = true;
    return newHandle;
  }

  removeMesh(h: MeshHandle) {
    // TODO(@darzu): we need to free up vertices
    //delete handles[o.id];
    // TODO(@darzu): determine rebundle a different way
    this.needsRebundle = true;
    console.warn(`TODO: impl removeMesh`);
  }

  public updateMesh(h: MeshHandle, m: Mesh) {
    if (!this.initFinished) {
      throw "updateMesh called before init finished";
    }
    this.pool.updateMesh(h, m);
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
            minBindingSize: MeshUniform.ByteSizeAligned,
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
            size: MeshUniform.ByteSizeAligned,
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
        module: this.device.createShaderModule({ code: vertexShader }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: Vertex.ByteSize,
            attributes: Vertex.WebGPUFormat,
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: fragmentShader }),
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

    this.builder = createMeshPoolBuilder_WebGPU(device, opts);

    this.pool = this.builder.poolHandle;

    this.sceneUniformBuffer = device.createBuffer({
      size: SceneUniform.ByteSizeAligned,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // setup scene data:
    this.sceneData = setupScene();

    this.renderBundle = this.createRenderBundle([]);
  }

  private scratchSceneUni = new Uint8Array(SceneUniform.ByteSizeAligned);
  public renderFrame(viewProj: mat4, handles: MeshHandle[]): void {
    this.checkCanvasResize();

    this.sceneData.cameraViewProjMatrix = viewProj;

    SceneUniform.Serialize(this.scratchSceneUni, 0, this.sceneData);
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      0,
      this.scratchSceneUni.buffer
    );

    // update all mesh transforms
    this.gpuBufferWriteAllMeshUniforms(handles);

    // TODO(@darzu): more fine grain
    this.needsRebundle =
      this.needsRebundle || handles.length !== this.bundledMIds.size;
    if (!this.needsRebundle) {
      for (let id of handles.map((o) => o.mId)) {
        if (!this.bundledMIds.has(id)) {
          this.needsRebundle = true;
          break;
        }
      }
    }
    if (
      this.needsRebundle ||
      this.drawLines !== this.lastWireMode[0] ||
      this.drawTris !== this.lastWireMode[1]
    )
      this.createRenderBundle(handles);

    // start collecting our render commands for this frame
    const commandEncoder = this.device.createCommandEncoder();

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.colorTextureView!,
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadValue: backgroundColor,
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthLoadValue: 1.0,
        depthStoreOp: "store",
        stencilLoadValue: 0,
        stencilStoreOp: "store",
      },
    });
    renderPassEncoder.executeBundles([this.renderBundle]);
    renderPassEncoder.endPass();

    // submit render passes to GPU
    this.device.queue.submit([commandEncoder.finish()]);
  }
}

// TODO(@darzu): move somewhere else
export function setupScene(): SceneUniform.Data {
  // create a directional light and compute it's projection (for shadows) and direction
  const worldOrigin = vec3.fromValues(0, 0, 0);
  const lightPosition = vec3.fromValues(50, 50, 0);
  const upVector = vec3.fromValues(0, 1, 0);
  const lightViewMatrix = mat4.lookAt(
    mat4.create(),
    lightPosition,
    worldOrigin,
    upVector
  );
  const lightProjectionMatrix = mat4.ortho(
    mat4.create(),
    -80,
    80,
    -80,
    80,
    -200,
    300
  );
  const lightViewProjMatrix = mat4.multiply(
    mat4.create(),
    lightProjectionMatrix,
    lightViewMatrix
  );
  const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
  vec3.normalize(lightDir, lightDir);

  return {
    cameraViewProjMatrix: mat4.create(), // updated later
    lightViewProjMatrix,
    lightDir,
    time: 0, // updated later
    playerPos: [0, 0], // updated later
    cameraPos: vec3.create(), // updated later
  };
}
