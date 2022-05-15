import { mat4 } from "../gl-matrix.js";
import { assert } from "../test.js";
import {
  capitalize,
  isArray,
  isNumber,
  never,
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
  createMeshPool,
  MeshHandle,
  MeshPool,
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
  VertexTS,
  MeshUniformTS,
  computeUniData,
  computeVertsData,
  MeshHandleStd,
  meshPoolPtr,
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

interface CyResourcePtr {
  kind: PtrKind;
  name: string;
}

// BUFFERS
export interface CyIdxBufferPtr extends CyResourcePtr {
  kind: "idxBuffer";
  init: () => Uint16Array | number;
}

export interface CyBufferPtr<O extends CyStructDesc> extends CyResourcePtr {
  kind: "structBuffer";
  struct: CyStruct<O>;
  init: () => CyToTS<O> | CyToTS<O>[] | number;
}

// TODO(@darzu): this is a wierd one. another way to do this?
export interface CyBufferPtrLayout<O extends CyStructDesc> {
  bufPtr: CyBufferPtr<O>;
  usage: GPUBufferBindingType;
  parity: "one" | "many";
}

// TEXUTRES

export interface CyTexturePtr extends CyResourcePtr {
  kind: "texture";
  size: [number, number];
  format: GPUTextureFormat;
  init: () => Float32Array | undefined; // TODO(@darzu): | TexTypeAsTSType<F>[]
}

// MESH POOL
export interface CyMeshPoolPtr<V extends CyStructDesc, U extends CyStructDesc>
  extends CyResourcePtr {
  kind: "meshPool";
  // TODO(@darzu): remove id and name, this doesn't need to be inited directly
  computeVertsData: (m: Mesh) => CyToTS<V>[];
  computeUniData: (m: Mesh) => CyToTS<U>;
  vertsPtr: CyBufferPtr<V>;
  unisPtr: CyBufferPtr<U>;
  triIndsPtr: CyIdxBufferPtr;
  lineIndsPtr: CyIdxBufferPtr;
}

// COMP PIPELINE
export interface CyCompPipelinePtr<RS extends CyBufferPtr<CyStructDesc>[]>
  extends CyResourcePtr {
  kind: "compPipeline";
  resources: [...RS];
  shader: () => string;
  shaderComputeEntry: string;
}

export interface CyCompPipeline<RS extends CyBufferPtr<CyStructDesc>[]> {
  ptr: CyCompPipelinePtr<RS>;
  resourceLayouts: CyBufferPtrLayout<CyStructDesc>[];
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
}

// RENDER PIPELINE
type CyMeshOpt =
  | {
      pool: CyMeshPoolPtr<any, any>;
      stepMode: "per-mesh-handle";
    }
  | {
      vertex: CyBufferPtr<any>;
      instance: CyBufferPtr<any>;
      index: CyIdxBufferPtr;
      stepMode: "per-instance";
    };

export interface CyRndrPipelinePtr<RS extends CyBufferPtr<any>[]> {
  kind: "renderPipeline";
  resources: [...RS];
  shader: () => string;
  shaderVertexEntry: string;
  shaderFragmentEntry: string;
  meshOpt: CyMeshOpt;
}

// TODO(@darzu):
// export interface CyRndrMeshPipelineOpts {
//   id: number;
//   resources: [sceneBufPtr];
//   pool: meshPoolPtr;
//   shader: mesh_shader;
//   shaderVertexEntry: "vert_main";
//   shaderFragmentEntry: "frag_main";
//   stepMode: "per-mesh-instance";
// }

// TODO(@darzu): instead of just mushing together with the desc, have desc compose in
export interface CyRndrPipeline<RS extends CyBufferPtr<any>[]> {
  ptr: CyRndrPipelinePtr<RS>;
  resourceLayouts: CyBufferPtrLayout<any>[];
  vertexBuf: CyMany<any>;
  indexBuf: CyIdxBuffer;
  instanceBuf?: CyMany<any>;
  pool?: MeshPool<any, any>;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
}

// HELPERS

function isRenderPipelinePtr(
  p: CyRndrPipelinePtr<any> | CyCompPipelinePtr<any>
): p is CyRndrPipelinePtr<any> {
  const k: keyof CyRndrPipelinePtr<any> = "meshOpt";
  return k in p;
}

// REGISTERS

// export type ResourcePtr =
//   | CyBufferPtr<any>
//   | CyIdxBufferPtr
//   | CyTexturePtr
//   | CyMeshPoolDesc<any, any>
//   | CyCompPipelinePtr<any>
//   | CyRndrPipelinePtr<any>;

type PtrKindToPtrType = {
  structBuffer: CyBufferPtr<any>;
  idxBuffer: CyIdxBufferPtr;
  texture: CyTexturePtr;
  compPipeline: CyCompPipelinePtr<any>;
  renderPipeline: CyRndrPipelinePtr<any>;
  meshPool: CyMeshPoolPtr<any, any>;
};
type PtrKind = keyof PtrKindToPtrType;
type PtrType = PtrKindToPtrType[PtrKind];
// type PtrDesc<K extends PtrKind> = Omit<
//   Omit<PtrKindToPtrType[K], "name">,
//   "kind"
// >;

let _cyNameToPtr: { [name: string]: CyResourcePtr } = {};
let _cyKindToPtrs: { [K in PtrKind]: PtrKindToPtrType[K][] } = {
  structBuffer: [],
  idxBuffer: [],
  texture: [],
  compPipeline: [],
  renderPipeline: [],
  meshPool: [],
};
function registerCyResource<R extends CyResourcePtr>(ptr: R): R {
  assert(
    !_cyNameToPtr[ptr.name],
    `already registered Cy resource with name: ${ptr.name}`
  );
  _cyNameToPtr[ptr.name] = ptr;
  _cyKindToPtrs[ptr.kind].push(ptr as any);
  return ptr;
}

type Omit_kind_name<T> = Omit<Omit<T, "kind">, "name">;

export function registerBufPtr<O extends CyStructDesc>(
  name: string,
  desc: Omit_kind_name<CyBufferPtr<O>>
): CyBufferPtr<O> {
  return registerCyResource({
    ...desc,
    kind: "structBuffer",
    name,
  });
}
export function registerIdxBufPtr(
  name: string,
  desc: Omit_kind_name<CyIdxBufferPtr>
): CyIdxBufferPtr {
  return registerCyResource({
    ...desc,
    kind: "idxBuffer",
    name,
  });
}
export function registerTexPtr(
  name: string,
  desc: Omit_kind_name<CyTexturePtr>
): CyTexturePtr {
  return registerCyResource({
    ...desc,
    kind: "texture",
    name,
  });
}
export function registerCompPipeline<RS extends CyBufferPtr<any>[]>(
  name: string,
  desc: Omit_kind_name<CyCompPipelinePtr<RS>>
): CyCompPipelinePtr<RS> {
  return registerCyResource({
    ...desc,
    kind: "compPipeline",
    name,
  });
}
export function registerRenderPipeline<RS extends CyBufferPtr<any>[]>(
  name: string,
  desc: Omit_kind_name<CyRndrPipelinePtr<RS>>
): CyRndrPipelinePtr<RS> {
  return registerCyResource({
    ...desc,
    kind: "renderPipeline",
    name,
  });
}
export function registerMeshPoolPtr<
  V extends CyStructDesc,
  U extends CyStructDesc
>(
  name: string,
  desc: Omit_kind_name<CyMeshPoolPtr<V, U>>
): CyMeshPoolPtr<V, U> {
  return registerCyResource({
    ...desc,
    kind: "meshPool",
    name,
  });
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
  adapter: GPUAdapter
): Renderer {
  let renderer: Renderer = {
    drawLines: true,
    drawTris: true,
    backgroundColor: [0.6, 0.63, 0.6],

    addMesh,
    addMeshInstance,
    updateMesh,
    renderFrame,
  };

  let clothReadIdx = 1;

  // let sceneUni = createCyOne(device, SceneStruct, setupScene());
  let canvasFormat = context.getPreferredFormat(adapter);

  // generic compute pipelines
  // TODO(@darzu): IMPL
  const cyOnes: Map<string, CyOne<any>> = new Map();
  const cyManys: Map<string, CyMany<any>> = new Map();
  const cyIdxs: Map<string, CyIdxBuffer> = new Map();
  const cyTexs: Map<string, CyTexture> = new Map();
  const cyPools: Map<string, MeshPool<any, any>> = new Map();
  const cyCompPipelines: CyCompPipeline<any>[] = [];
  const cyRndrPipelines: CyRndrPipeline<any>[] = [];

  function initCyResources() {
    // TODO(@darzu):
  }

  // init mesh pools
  for (let desc of _cyKindToPtrs["meshPool"]) {
    // TODO(@darzu): all this createCy* stuff should be done jointly
    if (!cyManys.has(desc.vertsPtr.name)) {
      const dataOrLen = desc.vertsPtr.init();
      assert(isNumber(dataOrLen), `mesh pool verts must have len`);
      const verticesBuffer = createCyMany(
        device,
        desc.vertsPtr.struct,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        dataOrLen
      );
      cyManys.set(desc.vertsPtr.name, verticesBuffer);
    }
    if (!cyIdxs.has(desc.triIndsPtr.name)) {
      const dataOrLen = desc.triIndsPtr.init();
      assert(isNumber(dataOrLen), `mesh pool tri inds must have len`);
      const buf = createCyIdxBuf(device, dataOrLen);
      cyIdxs.set(desc.triIndsPtr.name, buf);
    }
    if (!cyIdxs.has(desc.lineIndsPtr.name)) {
      const dataOrLen = desc.lineIndsPtr.init();
      assert(isNumber(dataOrLen), `mesh pool line inds must have len`);
      const buf = createCyIdxBuf(device, dataOrLen);
      cyIdxs.set(desc.lineIndsPtr.name, buf);
    }
    if (!cyManys.has(desc.unisPtr.name)) {
      const dataOrLen = desc.unisPtr.init();
      assert(isNumber(dataOrLen), `mesh pool unis must have len`);
      const buf = createCyMany(
        device,
        desc.unisPtr.struct,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        dataOrLen
      );
      cyManys.set(desc.unisPtr.name, buf);
    }

    const pool = createMeshPool({
      computeVertsData: desc.computeVertsData,
      computeUniData: desc.computeUniData,
      verts: cyManys.get(desc.vertsPtr.name)!,
      unis: cyManys.get(desc.unisPtr.name)!,
      triInds: cyIdxs.get(desc.triIndsPtr.name)!,
      lineInds: cyIdxs.get(desc.lineIndsPtr.name)!,
      // TODO(@darzu): support more?
      shiftMeshIndices: false,
    });

    cyPools.set(desc.name, pool);
  }

  // TODO(@darzu): pass in elsewhere?
  const pool = cyPools.get(meshPoolPtr.name)!;

  // init textures
  // TODO(@darzu): Do this pipeline driven
  for (let desc of _cyKindToPtrs["texture"]) {
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
    cyTexs.set(desc.name, cyTex);
  }
  // init pipelines
  for (let p of [
    ..._cyKindToPtrs["compPipeline"],
    ..._cyKindToPtrs["renderPipeline"],
  ]) {
    // init global resources
    for (let r of p.resources) {
      if (!cyOnes.has(r.name) && !cyManys.has(r.name)) {
        let initDataOrLen = r.init();
        if (isArray(initDataOrLen) || isNumber(initDataOrLen)) {
          // TODO(@darzu): accurately determine usage by inspecting pipelines
          let usage = GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX;
          let cyMany = createCyMany(device, r.struct, usage, initDataOrLen);
          cyManys.set(r.name, cyMany);

          console.log(`creating resource many buf: ${r.name}`);
        } else {
          let cyOne = createCyOne(device, r.struct, initDataOrLen);
          cyOnes.set(r.name, cyOne);

          console.log(`creating resource one buf: ${r.name}`);
        }
      }
    }

    // global resource layout
    const resourceLayouts: CyBufferPtrLayout<any>[] = p.resources.map(
      (r, i) => {
        const parity = cyOnes.has(r.name) ? "one" : "many";
        return {
          bufPtr: r,
          // TODO(@darzu): determine binding types
          usage: r.struct.opts?.isUniform ? "uniform" : "storage",
          parity,
        };
      }
    );

    const bindGroupLayoutDesc: GPUBindGroupLayoutDescriptor = {
      entries: resourceLayouts.map((r, i) =>
        r.bufPtr.struct.layout(
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
        let buf = cyOnes.get(r.bufPtr.name) ?? cyManys.get(r.bufPtr.name);
        assert(!!buf, `Missing resource buffer: ${r.bufPtr.name}`);
        return buf.binding(i);
      }),
    });

    // shader resource setup
    const shaderResStructs = resourceLayouts.map((r) => {
      const structStr = `struct ${capitalize(r.bufPtr.name)} {
        ${r.bufPtr.struct.wgsl(true)}
      };`;
      if (r.parity === "one") {
        return structStr;
      } else {
        return `${structStr}
        struct ${pluralize(capitalize(r.bufPtr.name))} {
          ${pluralize(uncapitalize(r.bufPtr.name))} : array<${capitalize(
          r.bufPtr.name
        )}>,
        };`;
      }
    });
    const shaderResVars = resourceLayouts.map((r, i) => {
      const varPrefix = GPUBufferBindingTypeToWgslVar[r.usage];
      const varName =
        r.parity === "one"
          ? uncapitalize(r.bufPtr.name)
          : pluralize(uncapitalize(r.bufPtr.name));
      const varType = capitalize(varName);
      // TODO(@darzu): support multiple groups?
      return `@group(0) @binding(${i}) ${varPrefix} ${varName} : ${varType};`;
    });

    if (isRenderPipelinePtr(p)) {
      if (p.meshOpt.stepMode === "per-instance") {
        // vertex buffer init
        let vertBuf = cyManys.get(p.meshOpt.vertex.name);
        if (!vertBuf) {
          let initData = p.meshOpt.vertex.init();
          assert(
            isArray(initData),
            `Vertex buffer must by inited with array ${p.meshOpt.vertex.name}`
          );
          console.log(`creating vert buf: ${p.meshOpt.vertex.name}`);
          vertBuf = createCyMany(
            device,
            p.meshOpt.vertex.struct,
            GPUBufferUsage.VERTEX,
            initData
          );
          cyManys.set(p.meshOpt.vertex.name, vertBuf);
        }

        // instance buffer init
        let instBuf = cyManys.get(p.meshOpt.instance.name);
        if (!instBuf) {
          let initData = p.meshOpt.instance.init();
          assert(
            isArray(initData),
            `Instance buffer must by inited with array ${p.meshOpt.instance.name}`
          );
          console.log(`creating instance buf: ${p.meshOpt.instance.name}`);
          instBuf = createCyMany(
            device,
            p.meshOpt.instance.struct,
            // TODO(@darzu): collect all possible usages before creating these buffers
            GPUBufferUsage.VERTEX,
            initData
          );
          cyManys.set(p.meshOpt.instance.name, instBuf);
        }

        // index buffer init
        let idxBuffer = cyIdxs.get(p.meshOpt.index.name);
        if (!idxBuffer) {
          let dataOrLen = p.meshOpt.index.init();
          console.log(`idx buffer init: `);
          console.dir(dataOrLen);
          idxBuffer = createCyIdxBuf(device, dataOrLen);
          cyIdxs.set(p.meshOpt.index.name, idxBuffer);
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
              instBuf.struct.vertexLayout(
                "instance",
                vertBuf.struct.memberCount
              ),
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
      } else if (p.meshOpt.stepMode === "per-mesh-handle") {
        throw `TODO ${p.meshOpt.stepMode}`;
      } else {
        never(p.meshOpt, `Unimplemented step kind`);
      }
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
    cyTexs.get("clothTex0")!.texture,
    cyTexs.get("clothTex1")!.texture,
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

  function gpuBufferWriteAllMeshUniforms(handles: MeshHandleStd[]) {
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

  function addMesh(m: Mesh): MeshHandleStd {
    const handle: MeshHandleStd = pool.addMesh(m);
    return handle;
  }
  function addMeshInstance(oldHandle: MeshHandleStd): MeshHandleStd {
    const d = MeshUniformStruct.clone(oldHandle.shaderData);
    const newHandle = pool.addMeshInstance(oldHandle, d);
    return newHandle;
  }
  function updateMesh(handle: MeshHandleStd, newMeshData: Mesh) {
    pool.updateMeshVertices(handle, newMeshData);
  }

  function updateRenderBundle(handles: MeshHandleStd[]) {
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
            buffer: pool.opts.unis.buffer,
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
    bundleEnc.setVertexBuffer(0, pool.opts.verts.buffer);

    // render triangles first
    if (renderer.drawTris) {
      bundleEnc.setPipeline(renderPipeline_tris);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.opts.triInds.buffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [
          m.uniIdx * MeshUniformStruct.size,
        ]);
        bundleEnc.drawIndexed(m.triNum * 3, undefined, m.triIdx * 3, m.vertIdx);
      }
    }

    // then render lines
    if (renderer.drawLines) {
      bundleEnc.setPipeline(renderPipeline_lines);
      // TODO(@darzu): the uint16 vs uint32 needs to be in the mesh pool
      bundleEnc.setIndexBuffer(pool.opts.lineInds.buffer, "uint16");
      for (let m of Object.values(handles)) {
        bundleEnc.setBindGroup(1, modelUniBindGroup, [
          m.uniIdx * MeshUniformStruct.size,
        ]);
        bundleEnc.drawIndexed(
          m.lineNum * 2,
          undefined,
          m.lineIdx * 2,
          m.vertIdx
        );
      }
    }

    // TODO(@darzu): IMPL
    for (let p of cyRndrPipelines) {
      assert(
        p.ptr.meshOpt.stepMode === "per-instance",
        "Need to implement step mode: " + p.ptr.meshOpt.stepMode
      );
      bundleEnc.setPipeline(p.pipeline);
      bundleEnc.setBindGroup(0, p.bindGroup);
      bundleEnc.setIndexBuffer(p.indexBuf.buffer, "uint16");
      bundleEnc.setVertexBuffer(0, p.vertexBuf.buffer);
      // TODO(@darzu): instance buffer
      bundleEnc.setVertexBuffer(1, p.instanceBuf!.buffer);
      // TODO(@darzu): support other step modes
      // console.log(`drawing ${p.indexBuf.length} ${p.instanceBuf.length}`);
      bundleEnc.drawIndexed(p.indexBuf.length, p.instanceBuf!.length, 0, 0);
    }

    renderBundle = bundleEnc.finish();
    return renderBundle;
  }

  function renderFrame(viewProj: mat4, handles: MeshHandleStd[]): void {
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
