import { align } from "../math.js";
import { assert } from "../test.js";
import { isNumber } from "../util.js";
import {
  CyStructDesc,
  CyStruct,
  CyToTS,
  texTypeIsStencil,
  texTypeToBytes,
} from "./gpu-struct.js";
import {
  CyTexturePtr,
  CyDepthTexturePtr,
  CyCompPipelinePtr,
  CyRenderPipelinePtr,
  CySamplerPtr,
  PtrKind,
  PtrKindToPtrType,
  CyAttachment,
  isRenderPipelinePtr,
} from "./gpu-registry.js";
import { MeshPool } from "./mesh-pool.js";
import { BLACK } from "../game/assets.js";
import { vec2, vec3, vec4 } from "../gl-matrix.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";

export interface CyBuffer<O extends CyStructDesc> {
  struct: CyStruct<O>;
  // webgpu
  // TODO(@darzu): generalize to non-webgpu?
  // TODO(@darzu): don't like this param
  binding(idx: number, plurality: "one" | "many"): GPUBindGroupEntry;
  buffer: GPUBuffer;
}

// TODO(@darzu): rename "one" to "singleton", "many" to "array" ?
export interface CySingleton<O extends CyStructDesc> extends CyBuffer<O> {
  lastData: CyToTS<O> | undefined;
  queueUpdate: (data: CyToTS<O>) => void;
}
export interface CyArray<O extends CyStructDesc> extends CyBuffer<O> {
  length: number;
  queueUpdate: (data: CyToTS<O>, idx: number) => void;
  queueUpdates: (data: CyToTS<O>[], idx: number) => void;
}

export interface CyIdxBuffer {
  length: number;
  size: number;
  buffer: GPUBuffer;
  queueUpdate: (data: Uint16Array, startIdx: number) => void;
}

// TODO(@darzu): texture
export interface CyTexture {
  ptr: CyTexturePtr;
  size: [number, number];
  texture: GPUTexture;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  // TODO(@darzu): support partial texture update?
  queueUpdate: (data: Float32Array) => void;
  resize: (width: number, height: number) => void;
  attachment: (opts?: {
    doClear?: boolean;
    defaultColor?: vec2 | vec3 | vec4;
    viewOverride?: GPUTextureView;
  }) => GPURenderPassColorAttachment;
}
export interface CyDepthTexture extends Omit<CyTexture, "ptr"> {
  ptr: CyDepthTexturePtr;
  depthAttachment: (clear: boolean) => GPURenderPassDepthStencilAttachment;
}

export type PtrKindToResourceType = {
  array: CyArray<any>;
  singleton: CySingleton<any>;
  idxBuffer: CyIdxBuffer;
  texture: CyTexture;
  depthTexture: CyDepthTexture;
  compPipeline: CyCompPipeline;
  renderPipeline: CyRenderPipeline;
  meshPool: MeshPool<any, any>;
  sampler: CySampler;
};
type Assert_ResourceTypePtrTypeMatch =
  PtrKindToPtrType[keyof PtrKindToResourceType] &
    PtrKindToResourceType[keyof PtrKindToPtrType];

// type PtrDesc<K extends PtrKind> = Omit<
//   Omit<PtrKindToPtrType[K], "name">,
//   "kind"
// >;
type ResourceType = PtrKindToResourceType[PtrKind];

export interface CyCompPipeline {
  ptr: CyCompPipelinePtr;
  // resourceLayouts: CyBufferPtrLayout<CyStructDesc>[];
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
  workgroupCounts: [number, number, number];
}

export type CyPipeline = CyCompPipeline | CyRenderPipeline;

export function isRenderPipeline(p: CyPipeline): p is CyRenderPipeline {
  return isRenderPipelinePtr(p.ptr);
}

// TODO(@darzu): instead of just mushing together with the desc, have desc compose in
export interface CyRenderPipeline {
  ptr: CyRenderPipelinePtr;
  // resourceLayouts: CyBufferPtrLayout<any>[];
  vertexBuf?: CyArray<any>;
  indexBuf?: CyIdxBuffer;
  instanceBuf?: CyArray<any>;
  pool?: MeshPool<any, any>;
  pipeline: GPURenderPipeline;
  bindGroupLayouts: GPUBindGroupLayout[];
  output: CyAttachment[];
}

export interface CySampler {
  ptr: CySamplerPtr;
  sampler: GPUSampler;
}

export function createCySingleton<O extends CyStructDesc>(
  device: GPUDevice,
  struct: CyStruct<O>,
  usage: GPUBufferUsageFlags,
  initData?: CyToTS<O>
): CySingleton<O> {
  assert(struct.opts?.isUniform, "CyOne struct must be created with isUniform");

  const _buf = device.createBuffer({
    size: struct.size,
    // TODO(@darzu): parameterize these
    // TODO(@darzu): be precise
    usage,
    mappedAtCreation: !!initData,
  });

  const buf: CySingleton<O> = {
    struct,
    buffer: _buf,
    lastData: undefined,
    queueUpdate,
    binding,
  };

  if (initData) {
    buf.lastData = initData;
    const mappedBuf = new Uint8Array(_buf.getMappedRange());
    const d = struct.serialize(initData);
    mappedBuf.set(d, 0);
    _buf.unmap();
  }

  function queueUpdate(data: CyToTS<O>): void {
    // TODO(@darzu): measure perf. we probably want to allow hand written serializers
    buf.lastData = data;
    const b = struct.serialize(data);
    // assert(b.length % 4 === 0, `buf write must be 4 byte aligned: ${b.length}`);
    device.queue.writeBuffer(_buf, 0, b);
  }

  function binding(idx: number, plurality: "one" | "many"): GPUBindGroupEntry {
    // TODO(@darzu): more binding options?
    return {
      binding: idx,
      // TODO(@darzu): is explicit size good?
      resource: { buffer: _buf, size: struct.size },
    };
  }

  return buf;
}

export function createCyArray<O extends CyStructDesc>(
  device: GPUDevice,
  struct: CyStruct<O>,
  usage: GPUBufferUsageFlags,
  lenOrData: number | CyToTS<O>[]
): CyArray<O> {
  const hasInitData = typeof lenOrData !== "number";
  const length = hasInitData ? lenOrData.length : lenOrData;

  // if ((usage & GPUBufferUsage.UNIFORM) !== 0) {
  //   // TODO(@darzu): is this true for arrays where the whole array might be a uniform?
  //   assert(
  //     struct.size % 256 === 0,
  //     "CyArray with UNIFORM usage must be 256 aligned"
  //   );
  // }

  const _buf = device.createBuffer({
    size: struct.size * length,
    // TODO(@darzu): parameterize these
    usage,
    mappedAtCreation: hasInitData,
  });

  const buf: CyArray<O> = {
    struct,
    buffer: _buf,
    length,
    queueUpdate,
    queueUpdates,
    binding,
  };

  const stride = struct.size;

  if (hasInitData) {
    const data = lenOrData;
    const mappedBuf = new Uint8Array(_buf.getMappedRange());
    for (let i = 0; i < data.length; i++) {
      const d = struct.serialize(data[i]);
      mappedBuf.set(d, i * stride);
    }
    _buf.unmap();
  }

  function queueUpdate(data: CyToTS<O>, index: number): void {
    const b = struct.serialize(data);
    // TODO(@darzu): disable for perf?
    // assert(b.length % 4 === 0);
    device.queue.writeBuffer(_buf, index * stride, b);
  }
  function queueUpdates(data: CyToTS<O>[], index: number): void {
    const serialized = new Uint8Array(stride * data.length);
    data.forEach((d, i) => {
      serialized.set(struct.serialize(d), stride * i);
    });
    // assert(serialized.length % 4 === 0);
    device.queue.writeBuffer(_buf, index * stride, serialized);
  }

  function binding(idx: number, plurality: "one" | "many"): GPUBindGroupEntry {
    const size = plurality === "one" ? struct.size : length * struct.size;
    return {
      binding: idx,
      resource: { buffer: _buf, size },
    };
  }

  return buf;
}

export function createCyIdxBuf(
  device: GPUDevice,
  lenOrData: number | Uint16Array
): CyIdxBuffer {
  const hasInitData = !isNumber(lenOrData);
  const length = hasInitData ? lenOrData.length : lenOrData;

  const size = align(length * Uint16Array.BYTES_PER_ELEMENT, 4);
  // console.log(`idx size: ${size}`);

  const _buf = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: hasInitData,
  });

  const buf: CyIdxBuffer = {
    buffer: _buf,
    length,
    size,
    queueUpdate,
  };

  if (hasInitData) {
    const data = lenOrData;
    const mappedBuf = new Uint16Array(_buf.getMappedRange());
    assert(mappedBuf.length >= data.length, "mappedBuf.length >= data.length");
    mappedBuf.set(data);
    _buf.unmap();
  }

  function queueUpdate(data: Uint16Array, startIdx: number): void {
    const startByte = startIdx * Uint16Array.BYTES_PER_ELEMENT;
    // const byteView = new Uint8Array(data);
    // assert(data.length % 2 === 0);
    device.queue.writeBuffer(_buf, startByte, data);
  }

  return buf;
}

// TODO(@darzu): these paramters should just be CyTexturePtr
export function createCyTexture(
  device: GPUDevice,
  ptr: CyTexturePtr,
  usage: GPUTextureUsageFlags
): CyTexture {
  const { size, format, init, sampleCount } = ptr;
  // TODO(@darzu): parameterize
  // TODO(@darzu): be more precise
  const bytesPerVal = texTypeToBytes[format]!;
  assert(bytesPerVal, `TODO format: ${format}`);

  const cyTex: CyTexture = {
    ptr,
    size,
    usage,
    format,
    texture: undefined as any as GPUTexture, // pretty hacky...
    queueUpdate,
    resize,
    attachment,
  };

  resize(size[0], size[1]);

  if (init) {
    queueUpdate(init());
  }

  const black: vec4 = [0, 0, 0, 1];

  return cyTex;

  function resize(width: number, height: number) {
    cyTex.size[0] = width;
    cyTex.size[1] = height;
    // TODO(@darzu): feels wierd to mutate the descriptor...
    ptr.size[0] = width;
    ptr.size[1] = height;
    (cyTex.texture as GPUTexture | undefined)?.destroy();
    cyTex.texture = device.createTexture({
      size: cyTex.size,
      format: format,
      dimension: "2d",
      sampleCount,
      usage,
    });
  }

  // const queueUpdate = (data: Float32Array) => {
  function queueUpdate(data: Float32Array) {
    device.queue.writeTexture(
      { texture: cyTex.texture },
      data,
      {
        offset: 0,
        bytesPerRow: cyTex.size[0] * bytesPerVal,
        rowsPerImage: cyTex.size[1],
      },
      {
        width: cyTex.size[0],
        height: cyTex.size[1],
        // TODO(@darzu): what does this mean?
        depthOrArrayLayers: 1,
      }
    );
  }

  function attachment(opts?: {
    doClear?: boolean;
    defaultColor?: vec2 | vec3 | vec4;
    viewOverride?: GPUTextureView;
  }): GPURenderPassColorAttachment {
    const loadOp: GPULoadOp = opts?.doClear ? "clear" : "load";

    const backgroundColor = opts?.defaultColor ?? black;
    return {
      view: opts?.viewOverride ?? cyTex.texture.createView(),
      loadOp,
      clearValue: backgroundColor,
      storeOp: "store",
    };
  }
}

export function createCyDepthTexture(
  device: GPUDevice,
  ptr: CyDepthTexturePtr,
  usage: GPUTextureUsageFlags
): CyDepthTexture {
  const tex = createCyTexture(device, ptr as unknown as CyTexturePtr, usage);

  const hasStencil = ptr.format in texTypeIsStencil;

  return Object.assign(tex, {
    kind: "depthTexture",
    ptr,
    depthAttachment,
  });

  function depthAttachment(
    clear: boolean
  ): GPURenderPassDepthStencilAttachment {
    return {
      // TODO(@darzu): create these less often??
      view: tex.texture.createView(),
      depthLoadOp: clear ? "clear" : "load",
      depthClearValue: 1.0,
      depthStoreOp: "store",
      stencilLoadOp: hasStencil ? "clear" : undefined,
      stencilClearValue: hasStencil ? 0 : undefined,
      stencilStoreOp: hasStencil ? "store" : undefined,
    };
  }
}
