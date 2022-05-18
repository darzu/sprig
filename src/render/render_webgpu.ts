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
  createCyTexture,
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
  // obj_vertShader,
  // obj_fragShader,
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

export interface CyManyBufferPtr<O extends CyStructDesc> extends CyResourcePtr {
  kind: "manyBuffer";
  struct: CyStruct<O>;
  init: () => CyToTS<O>[] | number;
}
export interface CyOneBufferPtr<O extends CyStructDesc> extends CyResourcePtr {
  kind: "oneBuffer";
  struct: CyStruct<O>;
  init: () => CyToTS<O>;
}
export type CyBufferPtr<O extends CyStructDesc> =
  | CyManyBufferPtr<O>
  | CyOneBufferPtr<O>;

// TODO(@darzu): this is a wierd one. another way to do this?
// interface CyBufferPtrLayout<O extends CyStructDesc> {
//   bufPtr: CyBufferPtr<O>;
//   usage: GPUBufferBindingType;
//   parity: "one" | "many";
// }

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
  vertsPtr: CyManyBufferPtr<V>;
  unisPtr: CyManyBufferPtr<U>;
  triIndsPtr: CyIdxBufferPtr;
  lineIndsPtr: CyIdxBufferPtr;
}

// PIPELINES

// TODO(@darzu): support more access modes?
// TODO(@darzu): like buffer access modes, is this possibly inferable?
export type CyTexUsage = { ptr: CyTexturePtr; access: "read" | "write" };

export interface CyCompPipelinePtr<RS extends CyBufferPtr<CyStructDesc>[]>
  extends CyResourcePtr {
  kind: "compPipeline";
  resources: [...RS]; // TODO(@darzu): rename "resources" to "globals"?
  textures?: CyTexUsage[];
  shader: () => string;
  shaderComputeEntry: string;
}

export interface CyCompPipeline<RS extends CyBufferPtr<CyStructDesc>[]> {
  ptr: CyCompPipelinePtr<RS>;
  // resourceLayouts: CyBufferPtrLayout<CyStructDesc>[];
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  texBindGroup?: GPUBindGroup;
}

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

export interface CyRndrPipelinePtr<RS extends CyBufferPtr<any>[]>
  extends CyResourcePtr {
  kind: "renderPipeline";
  resources: [...RS];
  textures?: CyTexUsage[];
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
  // resourceLayouts: CyBufferPtrLayout<any>[];
  vertexBuf: CyMany<any>;
  indexBuf: CyIdxBuffer;
  instanceBuf?: CyMany<any>;
  pool?: MeshPool<any, any>;
  pipeline: GPURenderPipeline;
  bindGroups: GPUBindGroup[];
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
  manyBuffer: CyManyBufferPtr<any>;
  oneBuffer: CyOneBufferPtr<any>;
  idxBuffer: CyIdxBufferPtr;
  texture: CyTexturePtr;
  compPipeline: CyCompPipelinePtr<CyBufferPtr<any>[]>;
  renderPipeline: CyRndrPipelinePtr<CyBufferPtr<any>[]>;
  meshPool: CyMeshPoolPtr<any, any>;
};
type PtrKindToResourceType = {
  manyBuffer: CyMany<any>;
  oneBuffer: CyOne<any>;
  idxBuffer: CyIdxBuffer;
  texture: CyTexture;
  compPipeline: CyCompPipeline<CyBufferPtr<any>[]>;
  renderPipeline: CyRndrPipeline<CyBufferPtr<any>[]>;
  meshPool: MeshPool<any, any>;
};
type Assert_ResourceTypePtrTypeMatch =
  PtrKindToPtrType[keyof PtrKindToResourceType] &
    PtrKindToResourceType[keyof PtrKindToPtrType];
type PtrKind = keyof PtrKindToPtrType;
type PtrType = PtrKindToPtrType[PtrKind];
// type PtrDesc<K extends PtrKind> = Omit<
//   Omit<PtrKindToPtrType[K], "name">,
//   "kind"
// >;
type ResourceType = PtrKindToResourceType[PtrKind];

let _cyNameToPtr: { [name: string]: CyResourcePtr } = {};
let _cyKindToPtrs: { [K in PtrKind]: PtrKindToPtrType[K][] } = {
  manyBuffer: [],
  oneBuffer: [],
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

export function registerOneBufPtr<O extends CyStructDesc>(
  name: string,
  desc: Omit_kind_name<CyOneBufferPtr<O>>
): CyOneBufferPtr<O> {
  return registerCyResource({
    ...desc,
    kind: "oneBuffer",
    name,
  });
}
export function registerManyBufPtr<O extends CyStructDesc>(
  name: string,
  desc: Omit_kind_name<CyManyBufferPtr<O>>
): CyManyBufferPtr<O> {
  return registerCyResource({
    ...desc,
    kind: "manyBuffer",
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

const depthStencilOpts: GPUDepthStencilState = {
  depthWriteEnabled: true,
  depthCompare: "less",
  format: depthStencilFormat,
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

  // let clothReadIdx = 1;

  // let sceneUni = createCyOne(device, SceneStruct, setupScene());
  let canvasFormat = context.getPreferredFormat(adapter);

  // determine resource usage modes
  // TODO(@darzu): determine texture usage modes
  const cyNameToBufferUsage: { [name: string]: GPUBufferUsageFlags } = {};
  // all buffers are updatable via queue
  // TODO(@darzu): option for some to opt out? for perf?
  [..._cyKindToPtrs.manyBuffer, ..._cyKindToPtrs.oneBuffer].forEach(
    (r) => (cyNameToBufferUsage[r.name] |= GPUBufferUsage.COPY_DST)
  );
  // all singleton buffers are probably used as uniforms
  _cyKindToPtrs.oneBuffer.forEach(
    (p) => (cyNameToBufferUsage[p.name] |= GPUBufferUsage.UNIFORM)
  );
  // all pipeline global resources are storage or uniform
  // TODO(@darzu): be more precise?
  [..._cyKindToPtrs.compPipeline, ..._cyKindToPtrs.renderPipeline].forEach(
    (p) =>
      p.resources.forEach(
        (r) => (cyNameToBufferUsage[r.name] |= GPUBufferUsage.STORAGE)
      )
  );
  // render pipelines have vertex buffers and mesh pools have uniform buffers
  _cyKindToPtrs.renderPipeline.forEach((p) => {
    if (p.meshOpt.stepMode === "per-instance") {
      cyNameToBufferUsage[p.meshOpt.instance.name] |= GPUBufferUsage.VERTEX;
      cyNameToBufferUsage[p.meshOpt.vertex.name] |= GPUBufferUsage.VERTEX;
    } else if (p.meshOpt.stepMode === "per-mesh-handle") {
      cyNameToBufferUsage[p.meshOpt.pool.vertsPtr.name] |=
        GPUBufferUsage.VERTEX;
      cyNameToBufferUsage[p.meshOpt.pool.unisPtr.name] |=
        GPUBufferUsage.UNIFORM;
    } else {
      never(p.meshOpt);
    }
  });
  // mesh pools have vert and uniform buffers
  _cyKindToPtrs.meshPool.forEach((p) => {
    cyNameToBufferUsage[p.vertsPtr.name] |= GPUBufferUsage.VERTEX;
    cyNameToBufferUsage[p.unisPtr.name] |= GPUBufferUsage.UNIFORM;
  });

  // create resources
  // TODO(@darzu): IMPL
  const cyKindToNameToRes: {
    [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
  } = {
    manyBuffer: {},
    oneBuffer: {},
    idxBuffer: {},
    texture: {},
    compPipeline: {},
    renderPipeline: {},
    meshPool: {},
  };

  // create many-buffers
  _cyKindToPtrs.manyBuffer.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCyMany(device, r.struct, usage, r.init());
    cyKindToNameToRes.manyBuffer[r.name] = buf;
  });
  // create one-buffers
  _cyKindToPtrs.oneBuffer.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCyOne(device, r.struct, usage, r.init());
    cyKindToNameToRes.oneBuffer[r.name] = buf;
  });
  // create idx-buffers
  _cyKindToPtrs.idxBuffer.forEach((r) => {
    const buf = createCyIdxBuf(device, r.init());
    cyKindToNameToRes.idxBuffer[r.name] = buf;
  });
  // create mesh pools
  _cyKindToPtrs.meshPool.forEach((r) => {
    const verts = cyKindToNameToRes.manyBuffer[r.vertsPtr.name];
    const unis = cyKindToNameToRes.manyBuffer[r.unisPtr.name];
    const triInds = cyKindToNameToRes.idxBuffer[r.triIndsPtr.name];
    const lineInds = cyKindToNameToRes.idxBuffer[r.lineIndsPtr.name];
    assert(
      verts && unis && triInds && lineInds,
      `Missing buffer for mesh pool ${r.name}`
    );
    const pool = createMeshPool({
      computeVertsData: r.computeVertsData,
      computeUniData: r.computeUniData,
      verts,
      unis,
      triInds,
      lineInds,
      // TODO(@darzu): support more?
      shiftMeshIndices: false,
    });
    cyKindToNameToRes.meshPool[r.name] = pool;
  });
  // create texture
  _cyKindToPtrs.texture.forEach((r) => {
    const t = createCyTexture(device, r.size, r.format, r.init);
    cyKindToNameToRes.texture[r.name] = t;
  });
  // create pipelines
  for (let p of [
    ..._cyKindToPtrs["compPipeline"],
    ..._cyKindToPtrs["renderPipeline"],
  ]) {
    const shaderStage = isRenderPipelinePtr(p)
      ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
      : GPUShaderStage.COMPUTE;
    // TODO(@darzu): move helpers elsewhere?
    // TODO(@darzu): dynamic is wierd to pass here
    function mkBindGroupLayout(ptrs: CyBufferPtr<any>[], dynamic: boolean) {
      const bindGroupLayoutDesc: GPUBindGroupLayoutDescriptor = {
        entries: ptrs.map((r, i) =>
          r.struct.layout(
            i,
            // TODO(@darzu): more precise
            shaderStage,
            // TODO(@darzu): more precise?
            r.struct.opts?.isUniform ? "uniform" : "storage",
            dynamic
          )
        ),
      };
      return device.createBindGroupLayout(bindGroupLayoutDesc);
    }
    function mkTexBindGroupLayout(ptrs: CyTexUsage[]) {
      const bindGroupLayoutDesc: GPUBindGroupLayoutDescriptor = {
        entries: ptrs.map((r, i) => {
          if (r.access === "read") {
            return {
              binding: i,
              visibility: shaderStage,
              // TODO(@darzu): need a mapping of format -> sample type?
              texture: { sampleType: "unfilterable-float" },
            };
          } else {
            return {
              binding: i,
              visibility: shaderStage,
              storageTexture: { format: r.ptr.format, access: "write-only" },
            };
          }
        }),
      };
      return device.createBindGroupLayout(bindGroupLayoutDesc);
    }
    function mkBindGroup(
      layout: GPUBindGroupLayout,
      ptrs: CyBufferPtr<any>[],
      plurality: "one" | "many"
    ) {
      const bindGroup = device.createBindGroup({
        layout: layout,
        entries: ptrs.map((r, i) => {
          let buf =
            r.kind === "oneBuffer"
              ? cyKindToNameToRes.oneBuffer[r.name]
              : cyKindToNameToRes.manyBuffer[r.name];
          assert(!!buf, `Missing resource buffer: ${r.name}`);
          // TODO(@darzu): not super happy with how plurality is handled
          return buf.binding(i, plurality);
        }),
      });
      return bindGroup;
    }
    function mkTexBindGroup(layout: GPUBindGroupLayout, ptrs: CyTexUsage[]) {
      const bindGroup = device.createBindGroup({
        layout: layout,
        entries: ptrs.map((r, i) => {
          const tex = cyKindToNameToRes.texture[r.ptr.name]!;
          return {
            binding: i,
            // TODO(@darzu): does this view need to be updated on resize?
            resource: tex.texture.createView(),
          };
        }),
      });
      return bindGroup;
    }
    function bufPtrToWgslStructs(
      r: CyBufferPtr<CyStructDesc>,
      plurality: "one" | "many"
    ) {
      const structStr = `struct ${capitalize(r.name)} {
        ${r.struct.wgsl(true)}
      };`;
      if (plurality === "one") {
        return structStr;
      } else {
        return `${structStr}
        struct ${pluralize(capitalize(r.name))} {
          ${pluralize(uncapitalize(r.name))} : array<${capitalize(r.name)}>,
        };`;
      }
    }
    function bufPtrToWgslVars(
      r: CyBufferPtr<CyStructDesc>,
      plurality: "one" | "many",
      groupIdx: number,
      bindingIdx: number
    ) {
      const usage = r.struct.opts?.isUniform ? "uniform" : "storage";
      const varPrefix = GPUBufferBindingTypeToWgslVar[usage];
      const varName =
        plurality === "one"
          ? uncapitalize(r.name)
          : pluralize(uncapitalize(r.name));
      const varType = capitalize(varName);
      // TODO(@darzu): support multiple groups?
      return `@group(${groupIdx}) @binding(${bindingIdx}) ${varPrefix} ${varName} : ${varType};`;
    }
    function texPtrToWgslVars(
      r: CyTexUsage,
      groupIdx: number,
      bindingIdx: number
    ) {
      const varName = uncapitalize(r.ptr.name);
      if (r.access === "read")
        // TODO(@darzu): handle other formats?
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<f32>;`;
      else
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_storage_2d<${r.ptr.format}, write>;`;
    }

    // resources layout and bindings
    // TODO(@darzu): don't like this dynamic layout var
    const resBindGroupLayout = mkBindGroupLayout(p.resources, false);
    // TODO(@darzu): wait, plurality many isn't right
    const resBindGroup = mkBindGroup(resBindGroupLayout, p.resources, "many");

    // texture layout and bindings
    const texBindGroupLayout = mkTexBindGroupLayout(p.textures ?? []);
    const texBindGroup = mkTexBindGroup(texBindGroupLayout, p.textures ?? []);

    // shader resource setup
    const shaderResStructs = p.resources.map((r) => {
      return bufPtrToWgslStructs(r, r.kind === "oneBuffer" ? "one" : "many");
    });
    const shaderResVars = p.resources.map((r, i) => {
      return bufPtrToWgslVars(r, r.kind === "oneBuffer" ? "one" : "many", 0, i);
    });
    const shaderTexVars = (p.textures ?? []).map((r, i) => {
      // TODO(@darzu): textures always group 1?
      return texPtrToWgslVars(r, 1, i);
    });

    if (isRenderPipelinePtr(p)) {
      if (p.meshOpt.stepMode === "per-instance") {
        const vertBuf = cyKindToNameToRes.manyBuffer[p.meshOpt.vertex.name];
        const instBuf = cyKindToNameToRes.manyBuffer[p.meshOpt.instance.name];
        const idxBuffer = cyKindToNameToRes.idxBuffer[p.meshOpt.index.name];

        const vertexInputStruct =
          `struct VertexInput {\n` +
          `${vertBuf.struct.wgsl(false, 0)}\n` +
          `}\n`;
        const instanceInputStruct =
          `struct InstanceInput {\n` +
          `${instBuf.struct.wgsl(false, vertBuf.struct.memberCount)}\n` +
          `}\n`;

        // render shader
        // TODO(@darzu): pass vertex buffer and instance buffer into shader
        const shaderStr =
          `${shaderResStructs.join("\n")}\n` +
          `${shaderResVars.join("\n")}\n` +
          `${vertexInputStruct}\n` +
          `${instanceInputStruct}\n` +
          `${p.shader()}\n`;

        // render pipeline
        const shader = device.createShaderModule({
          code: shaderStr,
        });
        const rndrPipelineDesc: GPURenderPipelineDescriptor = {
          // TODO(@darzu): allow this to be parameterized
          primitive: prim_tris,
          depthStencil: depthStencilOpts,
          multisample: {
            count: antiAliasSampleCount,
          },
          layout: device.createPipelineLayout({
            bindGroupLayouts: [resBindGroupLayout],
            // TODO(@darzu): need bind group layout for mesh pool uniform
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
        const cyPipeline: CyRndrPipeline<any> = {
          ptr: p,
          indexBuf: idxBuffer,
          vertexBuf: vertBuf,
          instanceBuf: instBuf,
          pipeline: rndrPipeline,
          // resourceLayouts,
          bindGroups: [resBindGroup],
        };
        cyKindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else if (p.meshOpt.stepMode === "per-mesh-handle") {
        // TODO(@darzu): de-duplicate with above?
        const vertBuf =
          cyKindToNameToRes.manyBuffer[p.meshOpt.pool.vertsPtr.name];
        const idxBuffer =
          cyKindToNameToRes.idxBuffer[p.meshOpt.pool.triIndsPtr.name];
        const uniBuf =
          cyKindToNameToRes.manyBuffer[p.meshOpt.pool.unisPtr.name];
        const pool = cyKindToNameToRes.meshPool[p.meshOpt.pool.name];

        const uniBGLayout = mkBindGroupLayout([p.meshOpt.pool.unisPtr], true);
        const uniBG = mkBindGroup(uniBGLayout, [p.meshOpt.pool.unisPtr], "one");

        const uniStruct = bufPtrToWgslStructs(p.meshOpt.pool.unisPtr, "one");
        const uniVar = bufPtrToWgslVars(p.meshOpt.pool.unisPtr, "one", 1, 0);

        const vertexInputStruct =
          `struct VertexInput {\n` +
          `${vertBuf.struct.wgsl(false, 0)}\n` +
          `}\n`;

        // render shader
        // TODO(@darzu): pass vertex buffer and instance buffer into shader
        const shaderStr =
          `${shaderResStructs.join("\n")}\n` +
          `${shaderResVars.join("\n")}\n` +
          `${uniStruct}\n` +
          `${uniVar}\n` +
          `${shaderTexVars.join("\n")}\n` +
          `${vertexInputStruct}\n` +
          `${p.shader()}\n`;

        // TODO(@darzu): need uni bind group layout

        // render pipeline
        const shader = device.createShaderModule({
          code: shaderStr,
        });
        const rndrPipelineDesc: GPURenderPipelineDescriptor = {
          // TODO(@darzu): allow this to be parameterized
          primitive: prim_tris,
          depthStencil: depthStencilOpts,
          multisample: {
            count: antiAliasSampleCount,
          },
          layout: device.createPipelineLayout({
            bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
            // TODO(@darzu): need bind group layout for mesh pool uniform
          }),
          vertex: {
            module: shader,
            entryPoint: p.shaderVertexEntry,
            buffers: [vertBuf.struct.vertexLayout("vertex", 0)],
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
        const cyPipeline: CyRndrPipeline<any> = {
          ptr: p,
          indexBuf: idxBuffer,
          vertexBuf: vertBuf,
          pipeline: rndrPipeline,
          pool,
          // resourceLayouts,
          bindGroups: [resBindGroup, uniBG],
        };
        cyKindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else {
        never(p.meshOpt, `Unimplemented step kind`);
      }
    } else {
      const shaderStr =
        `${shaderResStructs.join("\n")}\n` +
        `${shaderResVars.join("\n")}\n` +
        `${shaderTexVars.join("\n")}\n` +
        `${p.shader()}\n`;

      const emptyLayout = device.createBindGroupLayout({
        entries: [],
      });

      let compPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [
            resBindGroupLayout,
            // emptyLayout,
            texBindGroupLayout,
          ],
        }),
        compute: {
          module: device.createShaderModule({
            code: shaderStr,
          }),
          entryPoint: p.shaderComputeEntry ?? "main",
        },
      });
      const cyPipeline: CyCompPipeline<any> = {
        ptr: p,
        pipeline: compPipeline,
        bindGroup: resBindGroup,
        texBindGroup: texBindGroup,
      };
      cyKindToNameToRes.compPipeline[p.name] = cyPipeline;
    }
  }

  // TODO(@darzu): pass in elsewhere?
  const pool: MeshPool<
    typeof VertexStruct.desc,
    typeof MeshUniformStruct.desc
  > = cyKindToNameToRes.meshPool["meshPool"]!;

  // TODO(@darzu): hacky grab
  let sceneUni: CyOne<typeof SceneStruct.desc> =
    cyKindToNameToRes.oneBuffer["scene"]!;

  // // cloth data
  // let clothTextures = [
  //   // TODO(@darzu): hacky grab
  //   cyKindToNameToRes.texture["clothTex0"]!.texture,
  //   cyKindToNameToRes.texture["clothTex1"]!.texture,
  // ];

  // let cmpClothBindGroupLayout = device.createBindGroupLayout({
  //   entries: [
  //     {
  //       binding: 1,
  //       visibility: GPUShaderStage.COMPUTE,
  //       texture: { sampleType: "unfilterable-float" },
  //     },
  //     {
  //       binding: 2,
  //       visibility: GPUShaderStage.COMPUTE,
  //       storageTexture: { format: "rgba32float", access: "write-only" },
  //     },
  //   ],
  // });
  // let cmpClothPipeline = device.createComputePipeline({
  //   layout: device.createPipelineLayout({
  //     bindGroupLayouts: [cmpClothBindGroupLayout],
  //   }),
  //   compute: {
  //     module: device.createShaderModule({
  //       code: cloth_shader(),
  //     }),
  //     entryPoint: "main",
  //   },
  // });

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

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    // TODO(@darzu): handle attachements via pipelines.ts
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats: [canvasFormat],
      depthStencilFormat: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
    });

    for (let p of Object.values(cyKindToNameToRes.renderPipeline)) {
      bundleEnc.setPipeline(p.pipeline);
      if (p.bindGroups.length)
        // bind group 0 is always the global resources
        // TODO(@darzu): this seems a bit hacky
        bundleEnc.setBindGroup(0, p.bindGroups[0]);
      bundleEnc.setIndexBuffer(p.indexBuf.buffer, "uint16");
      bundleEnc.setVertexBuffer(0, p.vertexBuf.buffer);
      if (p.ptr.meshOpt.stepMode === "per-instance") {
        assert(!!p.instanceBuf);
        bundleEnc.setVertexBuffer(1, p.instanceBuf.buffer);
        bundleEnc.drawIndexed(p.indexBuf.length, p.instanceBuf.length, 0, 0);
      } else if (p.ptr.meshOpt.stepMode === "per-mesh-handle") {
        assert(!!p.pool && p.bindGroups.length >= 2);
        const uniBG = p.bindGroups[1]; // TODO(@darzu): hacky convention?
        // TODO(@darzu): filter meshes?
        for (let m of p.pool.allMeshes) {
          // TODO(@darzu): HACK
          if (handles.indexOf(m) < 0) continue;
          bundleEnc.setBindGroup(1, uniBG, [
            m.uniIdx * p.pool.opts.unis.struct.size,
          ]);
          bundleEnc.drawIndexed(
            m.triNum * 3,
            undefined,
            m.triIdx * 3,
            m.vertIdx
          );
        }
      } else {
        never(p.ptr.meshOpt, `Unimplemented mesh step mode`);
      }
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

    // // run compute tasks
    // const clothWriteIdx = clothReadIdx;
    // clothReadIdx = (clothReadIdx + 1) % 2;
    // const cmpClothBindGroup = device.createBindGroup({
    //   layout: cmpClothPipeline.getBindGroupLayout(0),
    //   entries: [
    //     {
    //       binding: 1,
    //       resource: clothTextures[clothReadIdx].createView(),
    //     },
    //     {
    //       binding: 2,
    //       resource: clothTextures[clothWriteIdx].createView(),
    //     },
    //   ],
    // });

    // const cmpClothPassEncoder = commandEncoder.beginComputePass();
    // cmpClothPassEncoder.setPipeline(cmpClothPipeline);
    // cmpClothPassEncoder.setBindGroup(0, cmpClothBindGroup);
    // cmpClothPassEncoder.dispatchWorkgroups(1);
    // cmpClothPassEncoder.end();

    // TODO(@darzu): IMPL
    for (let p of Object.values(cyKindToNameToRes.compPipeline)) {
      const compPassEncoder = commandEncoder.beginComputePass();
      compPassEncoder.setPipeline(p.pipeline);
      compPassEncoder.setBindGroup(0, p.bindGroup);
      if (p.texBindGroup) {
        // TODO(@darzu): textures hard coded to group 1
        compPassEncoder.setBindGroup(1, p.texBindGroup);
      }
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
