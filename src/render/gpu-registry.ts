import { ComponentDef } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { assert } from "../util.js";
import {
  CyCompPipeline,
  CyRenderPipeline,
  PtrKindToResourceType,
} from "./data-webgpu.js";
import {
  CyStructDesc,
  CyStruct,
  CyToTS,
  texTypeIsDepth,
} from "./gpu-struct.js";
import { Mesh } from "./mesh.js";
import { ShaderName, ShaderSet } from "./shader-loader.js";

// NOTE: this file is supposed to be WebGPU and WebGL agnostic.

// render pipeline parameters
// TODO(@darzu): ENABLE AA
// export const antiAliasSampleCount = 4;

export interface CyResourcePtr<K extends PtrKind = PtrKind> {
  kind: K;
  name: string;
}

// BUFFERS
export interface CyIdxBufferPtr extends CyResourcePtr {
  kind: "idxBuffer";
  init: (() => Uint16Array) | number;
}

export interface CyArrayPtr<O extends CyStructDesc> extends CyResourcePtr {
  kind: "array";
  struct: CyStruct<O>;
  init: (() => CyToTS<O>[]) | number;
  // TODO(@darzu): HACK. we try to infer usage flags and this is our escape hatch
  forceUsage?: GPUBufferUsageFlags;
}
export interface CySingletonPtr<O extends CyStructDesc> extends CyResourcePtr {
  kind: "singleton";
  struct: CyStruct<O>;
  init?: () => CyToTS<O>;
}
export type CyBufferPtr<O extends CyStructDesc> =
  | CyArrayPtr<O>
  | CySingletonPtr<O>;

// TEXUTRES

export interface CyTexturePtr extends CyResourcePtr {
  kind: "texture";
  // TODO(@darzu): collapse size and onCanvasResize as XOR
  size: [number, number];
  onCanvasResize?: (
    canvasWidth: number,
    canvasHeight: number
  ) => [number, number];
  format: GPUTextureFormat;
  // TODO(@darzu): is this where we want to expose this?
  // TODO(@darzu): we need agreement with the pipeline
  sampleCount?: number;
  attachToCanvas?: boolean;
  // TODO(@darzu): make optional:
  init?: () => Float32Array; // TODO(@darzu): | TexTypeAsTSType<F>[]
}

export interface CyDepthTexturePtr extends Omit<CyTexturePtr, "kind"> {
  kind: "depthTexture";
  format: keyof typeof texTypeIsDepth;
  // TODO(@darzu): other depth properties?
}

export const linearSamplerPtr = {
  kind: "sampler",
  name: "linearSampler",
} as const;
// // TODO(@darzu): not the right way to specify samplers!
// // TODO(@darzu): wait, unfiltering sampler might make zero sense....
// export const linearUnfilterSamplerPtr = {
//   kind: "sampler",
//   name: "linearUnfilterSampler",
// } as const;
export const nearestSamplerPtr = {
  kind: "sampler",
  name: "nearestSampler",
} as const;
export const comparisonSamplerPtr = {
  kind: "sampler",
  name: "comparison",
} as const;

export type CySamplerPtr =
  | typeof linearSamplerPtr
  | typeof nearestSamplerPtr
  | typeof comparisonSamplerPtr;
// | typeof linearUnfilterSamplerPtr;

// NOTE: the return value's length can extend beyond "count"! That's b/c ur being handed a shared, temp array. Only
//    read up until count and don't hold onto the result.
// TODO(@darzu): Is there a cleaner way to handle this and be performant?
export type ComputeVertsDataFn<V extends CyStructDesc> = (
  m: Mesh,
  startIdx: number,
  count: number
) => CyToTS<V>[];

// MESH POOL
export interface CyMeshPoolPtr<
  V extends CyStructDesc = CyStructDesc,
  U extends CyStructDesc = CyStructDesc
> extends CyResourcePtr {
  kind: "meshPool";
  // TODO(@darzu): remove id and name, this doesn't need to be inited directly
  computeVertsData: ComputeVertsDataFn<V>;
  computeUniData: (m: Mesh) => CyToTS<U>;
  vertsStruct: CyStruct<V>;
  unisStruct: CyStruct<U>;
  // TODO(@darzu): do we need these max's? maybe we make them optional
  maxMeshes: number;
  maxSets: number;
  setMaxTris: number;
  setMaxLines: number;
  setMaxVerts: number;
  // TODO(@darzu): really unsure how I feel about having an EM component here in CY
  dataDef: ComponentDef<string, CyToTS<U>, [CyToTS<U>]>;
}

// PIPELINES

// TODO(@darzu): support more access modes?
// TODO(@darzu): like buffer access modes, is this possibly inferable?
export interface CyGlobalUsage<G extends CyResourcePtr> {
  ptr: G;
  // TODO(@darzu): access doesn't make sense for all globals, like samplers
  access?: "read" | "write";
  // TODO(@darzu): Support read_write eventually, currently:
  // "Tint WGSL reader failure: :5:36 error: storage textures currently only support 'write' access control"
  // | "read_write";
  alias?: string;
}

// TODO(@darzu): i know there is some fancy type way to construct this but i
//    can't figure it out.
export type CyGlobal =
  | CyTexturePtr
  | CyDepthTexturePtr
  | CyBufferPtr<any>
  | CySamplerPtr;
export type CyGlobalParam =
  | CyGlobal
  | CyGlobalUsage<CyTexturePtr>
  | CyGlobalUsage<CyDepthTexturePtr>
  | CyGlobalUsage<CyBufferPtr<any>>
  | CyGlobalUsage<CySamplerPtr>;

export interface CyAttachment {
  ptr: CyTexturePtr;
  defaultColor?: vec2 | vec3 | vec4;
  clear: "always" | "never" | "once";
  blend?: GPUBlendState;
  // TODO(@darzu): potential properties:
  // depthWriteEnabled: true,
  // depthCompare: "less",
  // TODO(@darzu): actually, depth and stencil need different clear and op values
}

export function isResourcePtr(p: any): p is CyResourcePtr {
  return !!(p as CyResourcePtr).kind;
}

export interface CyCompPipelinePtr extends CyResourcePtr {
  kind: "compPipeline";
  globals: CyGlobalParam[];
  overrides?: Record<string, GPUPipelineConstantValue>;
  // TODO(@darzu): dynamic workgroup counts feels hacky?
  workgroupCounts:
    | [number, number, number]
    | ((canvasSize: [number, number]) => [number, number, number]);
  shaderComputeEntry: string;
  // TODO(@darzu): get access to shader set
  shader: ((shaderSet: ShaderSet) => string) | ShaderName;
}

type CyMeshOpt =
  | {
      pool: CyMeshPoolPtr<any, any>;
      meshMask?: number;
      stepMode: "per-mesh-handle";
    }
  | {
      vertex: CyBufferPtr<any>;
      instance: CyBufferPtr<any>;
      index: CyIdxBufferPtr;
      stepMode: "per-instance";
    }
  | {
      // TODO(@darzu): or just support
      vertexCount: number;
      stepMode: "single-draw";
    };

export type CyColorAttachment = CyTexturePtr | CyAttachment;

export function getTexFromAttachment(t: CyColorAttachment): CyTexturePtr {
  return isResourcePtr(t) ? t : t.ptr;
}

export interface CyRenderPipelinePtr extends CyResourcePtr {
  kind: "renderPipeline";
  globals: CyGlobalParam[];
  overrides?: Record<string, GPUPipelineConstantValue>;
  shader: ((shaders: ShaderSet) => string) | ShaderName;
  shaderVertexEntry: string;
  shaderFragmentEntry: string;
  cullMode?: GPUCullMode;
  frontFace?: GPUFrontFace;
  // TODO(@darzu): move vertexBuf into mesh opt?
  meshOpt: CyMeshOpt;
  // TODO(@darzu): really need to allow changing attachments at runtime. Useful
  //   for tutorial animations at a minimum
  output: CyColorAttachment[];
  depthStencil?: CyDepthTexturePtr;
  depthReadonly?: boolean;
}

export type CyPipelinePtr = CyCompPipelinePtr | CyRenderPipelinePtr;

// HELPERS

export function isRenderPipelinePtr(
  p: CyRenderPipelinePtr | CyCompPipelinePtr
): p is CyRenderPipelinePtr {
  return p.kind === "renderPipeline";
}

// REGISTERS

export type PtrKindToPtrType = {
  array: CyArrayPtr<any>;
  singleton: CySingletonPtr<any>;
  idxBuffer: CyIdxBufferPtr;
  texture: CyTexturePtr;
  depthTexture: CyDepthTexturePtr;
  compPipeline: CyCompPipelinePtr;
  renderPipeline: CyRenderPipelinePtr;
  meshPool: CyMeshPoolPtr<any, any>;
  sampler: CySamplerPtr;
};
export type PtrKind = keyof PtrKindToPtrType;
export type PtrType = PtrKindToPtrType[PtrKind];

type Omit_kind_name<T> = Omit<Omit<T, "kind">, "name">;

export type CyRegistry = ReturnType<typeof createCyRegistry>;

export const CY: CyRegistry = createCyRegistry();

// TODO(@darzu): kinda hacky?
CY.kindToPtrs.sampler.push(linearSamplerPtr);
CY.kindToPtrs.sampler.push(nearestSamplerPtr);
CY.kindToPtrs.sampler.push(comparisonSamplerPtr);

export type CyKindToPtrSet = { [K in PtrKind]: PtrKindToPtrType[K][] };

function emptyCyKindToPtrSet(): CyKindToPtrSet {
  return {
    array: [],
    singleton: [],
    idxBuffer: [],
    texture: [],
    depthTexture: [],
    compPipeline: [],
    renderPipeline: [],
    meshPool: [],
    sampler: [],
  };
}

export function createCyRegistry() {
  let nameToPtr: { [name: string]: CyResourcePtr } = {};

  // TODO(@darzu): impl multi-flight registry & instantiation; see createCyResources comments
  // // TODO(@darzu): IMPL fill from instantiator
  // let kindToNameToRes: {
  //   [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
  // };
  // let flight = 1; // TODO(@darzu): IMPL!

  let nextFlightPtrs = emptyCyKindToPtrSet();

  function registerCyResource<R extends CyResourcePtr>(ptr: R): R {
    assert(
      !nameToPtr[ptr.name],
      `already registered Cy resource with name: ${ptr.name}`
    );
    nameToPtr[ptr.name] = ptr;
    nextFlightPtrs[ptr.kind].push(ptr as any);
    return ptr;
  }

  // Note: we define individual register functions instead of a generic like
  //   register.kind() because some descriptions have custom type parameters
  //   we want to provide good typing for.

  // TODO(@darzu): rename all "createX" to "mkX" for brevity?
  return {
    nameToPtr,
    kindToPtrs: nextFlightPtrs,
    createSingleton: <O extends CyStructDesc>(
      name: string,
      desc: Omit_kind_name<CySingletonPtr<O>>
    ): CySingletonPtr<O> => {
      return registerCyResource({
        ...desc,
        kind: "singleton",
        name,
      });
    },
    createArray: <O extends CyStructDesc>(
      name: string,
      desc: Omit_kind_name<CyArrayPtr<O>>
    ): CyArrayPtr<O> => {
      return registerCyResource({
        ...desc,
        kind: "array",
        name,
      });
    },
    createIdxBuf: (
      name: string,
      desc: Omit_kind_name<CyIdxBufferPtr>
    ): CyIdxBufferPtr => {
      return registerCyResource({
        ...desc,
        kind: "idxBuffer",
        name,
      });
    },
    createTexture: (
      name: string,
      desc: Omit_kind_name<CyTexturePtr>
    ): CyTexturePtr => {
      return registerCyResource({
        ...desc,
        kind: "texture",
        name,
      });
    },
    createDepthTexture: (
      name: string,
      desc: Omit_kind_name<CyDepthTexturePtr>
    ): CyDepthTexturePtr => {
      return registerCyResource({
        ...desc,
        kind: "depthTexture",
        name,
      });
    },
    createComputePipeline: (
      name: string,
      desc: Omit_kind_name<CyCompPipelinePtr>
    ): CyCompPipelinePtr => {
      return registerCyResource({
        ...desc,
        kind: "compPipeline",
        name,
      });
    },
    createRenderPipeline: (
      name: string,
      desc: Omit_kind_name<CyRenderPipelinePtr>
    ): CyRenderPipelinePtr => {
      return registerCyResource({
        ...desc,
        kind: "renderPipeline",
        name,
      });
    },
    createMeshPool: <V extends CyStructDesc, U extends CyStructDesc>(
      name: string,
      desc: Omit_kind_name<CyMeshPoolPtr<V, U>>
    ): CyMeshPoolPtr<V, U> => {
      return registerCyResource({
        ...desc,
        kind: "meshPool",
        name,
      });
    },
  };
}
