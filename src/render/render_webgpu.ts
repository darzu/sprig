import { mat4 } from "../gl-matrix.js";
import { assert } from "../test.js";
import {
  capitalize,
  isArray,
  isNumber,
  pluralize,
  uncapitalize,
} from "../util.js";
import {
  createCyIdxBuf,
  createCyMany,
  createCyOne,
  CyIdxBuffer,
  CyMany,
  CyOne,
  CyStruct,
  CyStructDesc,
  CyTexture,
  CyToTS,
  GPUBufferBindingTypeToWgslVar,
  TexTypeAsTSType,
  texTypeToBytes,
  TexTypeToTSType,
} from "./data.js";
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
  setupScene,
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

// BUFFERS

export interface CyIdxBufferPtrDesc {
  name: string;
  init: () => Uint16Array | number;
}
export interface CyIdxBufferPtr extends CyIdxBufferPtrDesc {
  id: number;
}

export interface CyBufferPtrDesc<O extends CyStructDesc> {
  name: string;
  struct: CyStruct<O>;
  init: () => CyToTS<O> | CyToTS<O>[] | number;
}
export interface CyBufferPtr<O extends CyStructDesc>
  extends CyBufferPtrDesc<O> {
  id: number;
}

export interface CyBufferPtrLayout<O extends CyStructDesc>
  extends CyBufferPtr<O> {
  usage: GPUBufferBindingType;
  parity: "one" | "many";
}

// TEXUTRES

export interface CyTexturePtr {
  id: number;
  name: string;
  size: [number, number];
  format: GPUTextureFormat;
  init: () => Float32Array | undefined; // TODO(@darzu): | TexTypeAsTSType<F>[]
}

// COMP PIPELINE
export interface CyCompPipelinePtr<RS extends CyBufferPtr<any>[]> {
  id: number;
  resources: [...RS];
  shader: () => string;
  shaderComputeEntry: string;
}

export interface CyCompPipeline<RS extends CyBufferPtr<any>[]> {
  ptr: CyCompPipelinePtr<RS>;
  resourceLayouts: CyBufferPtrLayout<any>[];
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
}

// RENDER PIPELINE
export interface CyRndrPipelinePtr<RS extends CyBufferPtr<any>[]> {
  id: number;
  resources: [...RS];
  shader: () => string;
  vertex: CyBufferPtr<any>;
  instance: CyBufferPtr<any>;
  index: CyIdxBufferPtr;
  shaderVertexEntry: string;
  shaderFragmentEntry: string;
  // TODO(@darzu): support other ways e.g. mesh buffer
  stepMode: "per-instance";
}

// TODO(@darzu): instead of just mushing together with the desc, have desc compose in
export interface CyRndrPipeline<RS extends CyBufferPtr<any>[]> {
  ptr: CyRndrPipelinePtr<RS>;
  resourceLayouts: CyBufferPtrLayout<any>[];
  vertexBuf: CyMany<any>;
  indexBuf: CyIdxBuffer;
  instanceBuf: CyMany<any>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
}

// HELPERS

function isRenderPipelinePtr(
  p: CyRndrPipelinePtr<any> | CyCompPipelinePtr<any>
): p is CyRndrPipelinePtr<any> {
  return "vertex" in p;
}

// REGISTERS

let _bufPtrs: CyBufferPtr<any>[] = [];
export function registerBufPtr<O extends CyStructDesc>(
  desc: CyBufferPtrDesc<O>
): CyBufferPtr<O> {
  const r = {
    ...desc,
    id: _bufPtrs.length,
  };
  _bufPtrs.push(r);
  return r;
}

let _idxBufPtrs: CyIdxBufferPtrDesc[] = [];
export function registerIdxBufPtr(desc: CyIdxBufferPtrDesc): CyIdxBufferPtr {
  const r = {
    ...desc,
    id: _idxBufPtrs.length,
  };
  _idxBufPtrs.push(r);
  return r;
}

let _texPtrs: CyTexturePtr[] = [];
export function registerTexPtr(desc: Omit<CyTexturePtr, "id">): CyTexturePtr {
  const r = {
    ...desc,
    id: _texPtrs.length,
  };
  _texPtrs.push(r);
  return r;
}

let _compPipelines: CyCompPipelinePtr<CyBufferPtr<any>[]>[] = [];
export function registerCompPipeline<RS extends CyBufferPtr<any>[]>(
  desc: Omit<CyCompPipelinePtr<RS>, "id">
): CyCompPipelinePtr<RS> {
  const r = {
    ...desc,
    id: _compPipelines.length,
  };
  _compPipelines.push(r);
  return r;
}

let _rndrPipelines: CyRndrPipelinePtr<CyBufferPtr<any>[]>[] = [];
export function registerRenderPipeline<RS extends CyBufferPtr<any>[]>(
  desc: Omit<CyRndrPipelinePtr<RS>, "id">
): CyRndrPipelinePtr<RS> {
  const r = {
    ...desc,
    id: _rndrPipelines.length,
  };
  _rndrPipelines.push(r);
  return r;
}

const prim_tris: GPUPrimitiveState = {
  topology: "triangle-list",
  cullMode: "back",
  frontFace: "ccw",
};
const prim_lines: GPUPrimitiveState = {
  topology: "line-list",
};

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
  // let sceneUni = createCyOne(device, SceneStruct, setupScene());
  let canvasFormat = context.getPreferredFormat(adapter);

  // generic compute pipelines
  // TODO(@darzu): IMPL
  const cyOnes: Map<number, CyOne<any>> = new Map();
  const cyManys: Map<number, CyMany<any>> = new Map();
  const cyIdxs: Map<number, CyIdxBuffer> = new Map();
  const cyTexs: Map<number, CyTexture> = new Map();
  const cyCompPipelines: CyCompPipeline<any>[] = [];
  const cyRndrPipelines: CyRndrPipeline<any>[] = [];
  // init textures
  // TODO(@darzu): Do this pipeline driven
  for (let desc of _texPtrs) {
    // TODO(@darzu): move to createCyTexture
    const tex = device.createTexture({
      size: desc.size,
      format: desc.format,
      dimension: "2d",
      // TODO(@darzu): be more precise
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    const bytesPerVal = texTypeToBytes[desc.format];
    assert(bytesPerVal, `Unimplemented format: ${desc.format}`);
    const queueUpdate = (data: Float32Array) => {
      device.queue.writeTexture(
        { texture: tex },
        data,
        {
          offset: 0,
          bytesPerRow: desc.size[0] * bytesPerVal,
          rowsPerImage: desc.size[1],
        },
        {
          width: desc.size[0],
          height: desc.size[1],
          // TODO(@darzu): what does this mean?
          depthOrArrayLayers: 1,
        }
      );
    };
    const initVal = desc.init();
    if (initVal) {
      queueUpdate(initVal);
    }
    const cyTex: CyTexture = {
      size: desc.size,
      format: desc.format,
      texture: tex,
      queueUpdate,
    };
    cyTexs.set(desc.id, cyTex);
  }
  // init pipelines
  for (let p of [..._compPipelines, ..._rndrPipelines]) {
    // init global resources
    for (let r of p.resources) {
      if (!cyOnes.has(r.id) && !cyManys.has(r.id)) {
        let initDataOrLen = r.init();
        if (isArray(initDataOrLen) || isNumber(initDataOrLen)) {
          // TODO(@darzu): accurately determine usage by inspecting pipelines
          let usage = GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX;
          let cyMany = createCyMany(device, r.struct, usage, initDataOrLen);
          cyManys.set(r.id, cyMany);

          console.log(`creating resource many buf: ${r.name}`);
        } else {
          let cyOne = createCyOne(device, r.struct, initDataOrLen);
          cyOnes.set(r.id, cyOne);

          console.log(`creating resource one buf: ${r.name}`);
        }
      }
    }

    // global resource layout
    const resourceLayouts: CyBufferPtrLayout<any>[] = p.resources.map(
      (r, i) => {
        const parity = cyOnes.has(r.id) ? "one" : "many";
        return {
          ...r,
          // TODO(@darzu): determine binding types
          usage: r.struct.opts?.isUniform ? "uniform" : "storage",
          parity,
        };
      }
    );

    const bindGroupLayoutDesc: GPUBindGroupLayoutDescriptor = {
      entries: resourceLayouts.map((r, i) =>
        r.struct.layout(
          i,
          // TODO(@darzu): more precise
          isRenderPipelinePtr(p)
            ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
            : GPUShaderStage.COMPUTE,
          r.usage
        )
      ),
    };
    const bindGroupLayout = device.createBindGroupLayout(bindGroupLayoutDesc);

    // resources bind group
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: resourceLayouts.map((r, i) => {
        let buf = cyOnes.get(r.id) ?? cyManys.get(r.id);
        assert(!!buf, `Missing resource buffer: ${r.name}`);
        return buf.binding(i);
      }),
    });

    // shader resource setup
    const shaderResStructs = resourceLayouts.map((r) => {
      const structStr = `struct ${capitalize(r.name)} {
        ${r.struct.wgsl(true)}
      };`;
      if (r.parity === "one") {
        return structStr;
      } else {
        return `${structStr}
        struct ${pluralize(capitalize(r.name))} {
          ${pluralize(uncapitalize(r.name))} : array<${capitalize(r.name)}>,
        };`;
      }
    });
    const shaderResVars = resourceLayouts.map((r, i) => {
      const varPrefix = GPUBufferBindingTypeToWgslVar[r.usage];
      const varName =
        r.parity === "one"
          ? uncapitalize(r.name)
          : pluralize(uncapitalize(r.name));
      const varType = capitalize(varName);
      // TODO(@darzu): support multiple groups?
      return `@group(0) @binding(${i}) ${varPrefix} ${varName} : ${varType};`;
    });

    if (isRenderPipelinePtr(p)) {
      // vertex buffer init
      let vertBuf = cyManys.get(p.vertex.id);
      if (!vertBuf) {
        let initData = p.vertex.init();
        assert(
          isArray(initData),
          `Vertex buffer must by inited with array ${p.vertex.name}`
        );
        console.log(`creating vert buf: ${p.vertex.name}`);
        vertBuf = createCyMany(
          device,
          p.vertex.struct,
          GPUBufferUsage.VERTEX,
          initData
        );
        cyManys.set(p.vertex.id, vertBuf);
      }

      // instance buffer init
      let instBuf = cyManys.get(p.instance.id);
      if (!instBuf) {
        let initData = p.instance.init();
        assert(
          isArray(initData),
          `Instance buffer must by inited with array ${p.instance.name}`
        );
        console.log(`creating instance buf: ${p.instance.name}`);
        instBuf = createCyMany(
          device,
          p.instance.struct,
          // TODO(@darzu): collect all possible usages before creating these buffers
          GPUBufferUsage.VERTEX,
          initData
        );
        cyManys.set(p.instance.id, instBuf);
      }

      // index buffer init
      let idxBuffer = cyIdxs.get(p.index.id);
      if (!idxBuffer) {
        let dataOrLen = p.index.init();
        console.log(`idx buffer init: `);
        console.dir(dataOrLen);
        idxBuffer = createCyIdxBuf(device, dataOrLen);
        cyIdxs.set(p.index.id, idxBuffer);
      }

      // TODO(@darzu): instance buffer init

      // render shader
      // TODO(@darzu): pass vertex buffer and instance buffer into shader
      const shaderStr = `
      ${shaderResStructs.join("\n")}
      ${shaderResVars.join("\n")}
      ${p.shader()}
      `;

      // render pipeline
      const shader = device.createShaderModule({
        code: shaderStr,
      });
      const rndrPipelineDesc: GPURenderPipelineDescriptor = {
        // TODO(@darzu): allow this to be parameterized
        primitive: prim_tris,
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: depthStencilFormat,
        },
        multisample: {
          count: antiAliasSampleCount,
        },
        layout: device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: shader,
          entryPoint: p.shaderVertexEntry,
          buffers: [
            vertBuf.struct.vertexLayout("vertex", 0),
            instBuf.struct.vertexLayout("instance", vertBuf.struct.memberCount),
          ],
        },
        fragment: {
          module: shader,
          entryPoint: p.shaderFragmentEntry,
          targets: [
            // TODO(@darzu): parameterize output targets
            {
              format: canvasFormat,
            },
          ],
        },
      };
      // console.dir(rndrPipelineDesc);
      const rndrPipeline = device.createRenderPipeline(rndrPipelineDesc);
      cyRndrPipelines.push({
        ptr: p,
        indexBuf: idxBuffer,
        vertexBuf: vertBuf,
        instanceBuf: instBuf,
        pipeline: rndrPipeline,
        resourceLayouts,
        bindGroup,
      });
    } else {
      const shaderStr = `
      ${shaderResStructs.join("\n")}
      ${shaderResVars.join("\n")}
      ${p.shader()}
      `;

      let compPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        compute: {
          module: device.createShaderModule({
            code: shaderStr,
          }),
          entryPoint: p.shaderComputeEntry ?? "main",
        },
      });
      cyCompPipelines.push({
        ptr: p,
        pipeline: compPipeline,
        resourceLayouts,
        bindGroup,
      });
    }
  }

  // TODO(@darzu): hacky grab
  let sceneUni: CyOne<typeof SceneStruct.desc> = [...cyOnes.values()].filter(
    (r) => r.struct === SceneStruct
  )[0];

  // cloth data
  let clothTextures = [
    // TODO(@darzu): hacky grab
    cyTexs.get(_texPtrs.filter((t) => t.name === "clothTex0")[0].id)?.texture!,
    cyTexs.get(_texPtrs.filter((t) => t.name === "clothTex1")[0].id)?.texture!,
  ];

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
            buffer: pool.uniformBuffer.buffer,
            size: MeshUniformStruct.size,
          },
        },
      ],
    });

    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        SceneStruct.layout(
          0,
          GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "uniform"
        ),
        // {
        //   binding: 1,
        //   visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        //   sampler: { type: "filtering" }, // TODO(@darzu): what kind?
        // },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" }, // TODO(@darzu): what type?
        },
      ],
    });
    const renderSceneUniBindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        SceneStruct.layout(
          0,
          GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "uniform"
        ),
      ],
    });

    const renderSceneUniBindGroup = device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [
        sceneUni.binding(0),
        // TODO(@darzu): DISP
        // {
        //   binding: 1,
        //   resource: clothSampler,
        // },
        {
          binding: 2,
          resource: clothTextures[clothReadIdx].createView(),
        },
      ],
    });

    // TODO(@darzu): AXE
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
      bundleEnc.setIndexBuffer(pool.triIndicesBuffer.buffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [
          m.poolIdx.modelUniNumOffset * MeshUniformStruct.size,
        ]);
        bundleEnc.drawIndexed(
          m.numTris * 3,
          undefined,
          m.poolIdx.triIndicesNumOffset,
          m.poolIdx.vertNumOffset
        );
      }
    }

    // then render lines
    if (renderer.drawLines) {
      bundleEnc.setPipeline(renderPipeline_lines);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.lineIndicesBuffer.buffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [
          m.poolIdx.modelUniNumOffset * MeshUniformStruct.size,
        ]);
        bundleEnc.drawIndexed(
          m.numLines * 2,
          undefined,
          m.poolIdx.lineIndicesNumOffset,
          m.poolIdx.vertNumOffset
        );
      }
    }

    // TODO(@darzu): IMPL
    for (let p of cyRndrPipelines) {
      assert(
        p.ptr.stepMode === "per-instance",
        "Need to implement step mode: " + p.ptr.stepMode
      );
      bundleEnc.setPipeline(p.pipeline);
      bundleEnc.setBindGroup(0, p.bindGroup);
      bundleEnc.setIndexBuffer(p.indexBuf.buffer, "uint16");
      bundleEnc.setVertexBuffer(0, p.vertexBuf.buffer);
      // TODO(@darzu): instance buffer
      bundleEnc.setVertexBuffer(1, p.instanceBuf.buffer);
      // TODO(@darzu): support other step modes
      console.log(`drawing ${p.indexBuf.length} ${p.instanceBuf.length}`);
      bundleEnc.drawIndexed(p.indexBuf.length, p.instanceBuf.length, 0, 0);
    }

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

    // TODO(@darzu): IMPL
    for (let p of cyCompPipelines) {
      const compPassEncoder = commandEncoder.beginComputePass();
      compPassEncoder.setPipeline(p.pipeline);
      compPassEncoder.setBindGroup(0, p.bindGroup);
      // TODO(@darzu): parameterize workgroup count
      compPassEncoder.dispatchWorkgroups(1);
      compPassEncoder.end();
    }

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
