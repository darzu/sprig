import { assert } from "../test.js";
import {
  CyStructDesc,
  CyStruct,
  CyToTS,
  texTypeIsDepth,
} from "./gpu-struct.js";
import { Mesh } from "./mesh.js";

// NOTE: this file is supposed to be WebGPU and WebGL agnostic.

// render pipeline parameters
// TODO(@darzu): ENABLE AA
// export const antiAliasSampleCount = 4;

export interface CyResourcePtr {
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

// TEXUTRES

export interface CyTexturePtr extends CyResourcePtr {
  kind: "texture";
  size: [number, number];
  onCanvasResize?: (
    canvasWidth: number,
    canvasHeight: number
  ) => [number, number];
  format: GPUTextureFormat;
  // TODO(@darzu): is this where we want to expose this?
  // TODO(@darzu): we need agreement with the pipeline
  sampleCount?: number;
  init: () => Float32Array | undefined; // TODO(@darzu): | TexTypeAsTSType<F>[]
}

export interface CyDepthTexturePtr extends Omit<CyTexturePtr, "kind"> {
  kind: "depthTexture";
  format: keyof typeof texTypeIsDepth;
  // TODO(@darzu): other depth properties?
}

export const canvasTexturePtr = {
  kind: "canvasTexture",
  name: "canvas",
} as const;
export type CyCanvasTexturePtr = typeof canvasTexturePtr;

export const linearSamplerPtr = {
  kind: "sampler",
  name: "linearSampler",
} as const;
export const nearestSamplerPtr = {
  kind: "sampler",
  name: "nearestSampler",
} as const;

export type CySamplerPtr = typeof linearSamplerPtr | typeof nearestSamplerPtr;

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
export interface CyGlobalUsage<G extends CyResourcePtr> {
  ptr: G;
  // TODO(@darzu): access doesn't make sense for all globals, like samplers
  access?: "read" | "write";
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

export function isResourcePtr(p: any): p is CyResourcePtr {
  return !!(p as CyResourcePtr).kind;
}

export interface CyCompPipelinePtr extends CyResourcePtr {
  kind: "compPipeline";
  globals: CyGlobalParam[]; // TODO(@darzu): rename "resources" to "globals"?
  workgroupCounts?: [number, number, number];
  shaderComputeEntry: string;
  shader: () => string;
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
    }
  | {
      // TODO(@darzu): or just support
      vertexCount: number;
      stepMode: "single-draw";
    };

export interface CyRenderPipelinePtr extends CyResourcePtr {
  kind: "renderPipeline";
  globals: CyGlobalParam[];
  shader: () => string;
  shaderVertexEntry: string;
  shaderFragmentEntry: string;
  meshOpt: CyMeshOpt;
  output: CyTexturePtr | CyCanvasTexturePtr;
  depthStencil: CyDepthTexturePtr;
}

export type CyPipelinePtr = CyCompPipelinePtr | CyRenderPipelinePtr;

// HELPERS

export function isRenderPipelinePtr(
  p: CyRenderPipelinePtr | CyCompPipelinePtr
): p is CyRenderPipelinePtr {
  const k: keyof CyRenderPipelinePtr = "meshOpt";
  return k in p;
}

// REGISTERS

export type PtrKindToPtrType = {
  manyBuffer: CyManyBufferPtr<any>;
  oneBuffer: CyOneBufferPtr<any>;
  idxBuffer: CyIdxBufferPtr;
  texture: CyTexturePtr;
  depthTexture: CyDepthTexturePtr;
  compPipeline: CyCompPipelinePtr;
  renderPipeline: CyRenderPipelinePtr;
  meshPool: CyMeshPoolPtr<any, any>;
  canvasTexture: CyCanvasTexturePtr;
  sampler: CySamplerPtr;
};
export type PtrKind = keyof PtrKindToPtrType;
export type PtrType = PtrKindToPtrType[PtrKind];

type Omit_kind_name<T> = Omit<Omit<T, "kind">, "name">;

export type CyRegistry = ReturnType<typeof createCyRegistry>;

export const CY: CyRegistry = createCyRegistry();

export function createCyRegistry() {
  let nameToPtr: { [name: string]: CyResourcePtr } = {};
  let kindToPtrs: { [K in PtrKind]: PtrKindToPtrType[K][] } = {
    manyBuffer: [],
    oneBuffer: [],
    idxBuffer: [],
    texture: [],
    depthTexture: [],
    compPipeline: [],
    renderPipeline: [],
    meshPool: [],
    canvasTexture: [canvasTexturePtr],
    sampler: [linearSamplerPtr, nearestSamplerPtr],
  };

  function registerCyResource<R extends CyResourcePtr>(ptr: R): R {
    assert(
      !nameToPtr[ptr.name],
      `already registered Cy resource with name: ${ptr.name}`
    );
    nameToPtr[ptr.name] = ptr;
    kindToPtrs[ptr.kind].push(ptr as any);
    return ptr;
  }

  return {
    nameToPtr,
    kindToPtrs,
    registerOneBufPtr: <O extends CyStructDesc>(
      name: string,
      desc: Omit_kind_name<CyOneBufferPtr<O>>
    ): CyOneBufferPtr<O> => {
      return registerCyResource({
        ...desc,
        kind: "oneBuffer",
        name,
      });
    },
    registerManyBufPtr: <O extends CyStructDesc>(
      name: string,
      desc: Omit_kind_name<CyManyBufferPtr<O>>
    ): CyManyBufferPtr<O> => {
      return registerCyResource({
        ...desc,
        kind: "manyBuffer",
        name,
      });
    },
    registerIdxBufPtr: (
      name: string,
      desc: Omit_kind_name<CyIdxBufferPtr>
    ): CyIdxBufferPtr => {
      return registerCyResource({
        ...desc,
        kind: "idxBuffer",
        name,
      });
    },
    registerTexPtr: (
      name: string,
      desc: Omit_kind_name<CyTexturePtr>
    ): CyTexturePtr => {
      return registerCyResource({
        ...desc,
        kind: "texture",
        name,
      });
    },
    registerDepthTexPtr: (
      name: string,
      desc: Omit_kind_name<CyDepthTexturePtr>
    ): CyDepthTexturePtr => {
      return registerCyResource({
        ...desc,
        kind: "depthTexture",
        name,
      });
    },
    registerCompPipeline: (
      name: string,
      desc: Omit_kind_name<CyCompPipelinePtr>
    ): CyCompPipelinePtr => {
      return registerCyResource({
        ...desc,
        kind: "compPipeline",
        name,
      });
    },
    registerRenderPipeline: (
      name: string,
      desc: Omit_kind_name<CyRenderPipelinePtr>
    ): CyRenderPipelinePtr => {
      return registerCyResource({
        ...desc,
        kind: "renderPipeline",
        name,
      });
    },
    registerMeshPoolPtr: <V extends CyStructDesc, U extends CyStructDesc>(
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
