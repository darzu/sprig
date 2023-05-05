import { PERF_DBG_GPU, VERBOSE_LOG } from "../flags.js";
import { ControllableDef } from "../games/controllable.js";
import { vec4, V } from "../sprig-matrix.js";
import { assert } from "../utils/util.js";
import {
  never,
  capitalize,
  pluralize,
  uncapitalize,
  isString,
  isFunction,
  dbgLogOnce,
} from "../utils/util.js";
import {
  PtrKindToResourceType,
  createCyArray,
  createCySingleton,
  createCyIdxBuf,
  createCyTexture,
  createCyDepthTexture,
  CyRenderPipeline,
  CyCompPipeline,
  CySampler,
  CyPipeline,
  isRenderPipeline,
} from "./data-webgpu.js";
import {
  PtrKind,
  CyRegistry,
  isResourcePtr,
  isRenderPipelinePtr,
  CyGlobalUsage,
  CyGlobal,
  CyArrayPtr,
  CyGlobalParam,
  CyColorAttachment,
  CyAttachment,
  CyBufferPtr,
  CySamplerPtr,
  CyPipelinePtr,
} from "./gpu-registry.js";
import {
  CyStruct,
  GPUBufferBindingTypeToWgslVar,
  texTypeToSampleType,
} from "./gpu-struct.js";
import { createMeshPool, MeshHandle, MeshPool } from "./mesh-pool.js";
import { DEFAULT_MASK } from "./pipeline-masks.js";
import { oceanPoolPtr } from "./pipelines/std-ocean.js";
import { canvasFormat } from "./pipelines/std-scene.js";
import { ShaderSet } from "./shader-loader.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";

// TODO(@darzu): instantiator refactor goals:
// [ ] better usage inference so we don't need "hackArray", "forceUsage", etc.
// [ ] multi-flight instantiation so we can e.g. define and create ocean resources
//     only if ocean init is run and needed.
// [x] support multiple vertex & index buffers in mesh pools, maybe by creating
//     them in future flights
// [ ] support indirect-draw / GPU-based rendering; unknown what needs to change here
// [ ] support typed & named collections of instantiated GPU resources, e.g. OceanRes
//      would have .gerstnerWaves: CyArray

// TODO(@darzu): visibility restrictions:
/*
If entry.visibility includes VERTEX:
  entry.buffer?.type must not be "storage".
  entry.storageTexture?.access must not be "write-only".
*/

const prim_lines: GPUPrimitiveState = {
  topology: "line-list",
};

type CyKindToNameToRes = {
  [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
};

export type CyResources = {
  kindToNameToRes: CyKindToNameToRes;
};

export type CyBufferUsages = { [name: string]: GPUBufferUsageFlags };

function collectBufferUsages(cy: CyRegistry): CyBufferUsages {
  // determine resource usage modes
  // TODO(@darzu): determine texture usage modes
  const bufferUsages: CyBufferUsages = {};
  // all buffers are updatable via queue
  // TODO(@darzu): option for some to opt out? for perf?
  [...cy.kindToPtrs.array, ...cy.kindToPtrs.singleton].forEach((r) => {
    bufferUsages[r.name] |= GPUBufferUsage.COPY_DST;
  });
  // all singleton buffers are probably used as uniforms
  cy.kindToPtrs.singleton.forEach((p) => {
    bufferUsages[p.name] |= GPUBufferUsage.UNIFORM;
  });
  // all pipeline global resources are storage or uniform
  // TODO(@darzu): be more precise?
  [...cy.kindToPtrs.compPipeline, ...cy.kindToPtrs.renderPipeline].forEach(
    (p) =>
      p.globals.forEach((r) => {
        if (isResourcePtr(r)) {
          if (r.kind === "singleton" || r.kind === "array")
            bufferUsages[r.name] |= GPUBufferUsage.STORAGE;
        } else {
          if (r.ptr.kind === "singleton" || r.ptr.kind === "array")
            bufferUsages[r.ptr.name] |= GPUBufferUsage.STORAGE;
        }
      })
  );
  // render pipelines have vertex buffers and mesh pools have uniform buffers
  cy.kindToPtrs.renderPipeline.forEach((p) => {
    if (p.meshOpt.stepMode === "per-instance") {
      bufferUsages[p.meshOpt.instance.name] |= GPUBufferUsage.VERTEX;
      bufferUsages[p.meshOpt.vertex.name] |= GPUBufferUsage.VERTEX;
    } else if (p.meshOpt.stepMode === "per-mesh-handle") {
      // NOTE: mesh pools own and create their own dynamic number of vertex + index buffers
    } else if (p.meshOpt.stepMode === "single-draw") {
      // TODO(@darzu): any buffers?
    } else {
      never(p.meshOpt);
    }
  });
  // mesh pools have vert and uniform buffers
  cy.kindToPtrs.meshPool.forEach((p) => {
    // NOTE: mesh pools own and create their own dynamic number of vertex + index buffers
  });
  // apply forced usages
  // TODO(@darzu): ideally, we would understand the scenarios where we need this
  //    and infer it properly
  cy.kindToPtrs.array.forEach((b) => {
    if (b.forceUsage) bufferUsages[b.name] = b.forceUsage;
  });

  return bufferUsages;
}

type CyTextureUsages = { [name: string]: GPUTextureUsageFlags };

function collectTextureUsages(cy: CyRegistry): CyTextureUsages {
  // determine texture usages
  const texUsages: CyTextureUsages = {};
  // let usage = GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
  // if (sampleCount && sampleCount > 1)
  //   usage |= GPUTextureUsage.RENDER_ATTACHMENT;
  // else usage |= GPUTextureUsage.STORAGE_BINDING;
  [...cy.kindToPtrs.texture, ...cy.kindToPtrs.depthTexture].forEach((p) => {
    // default usages
    // TODO(@darzu): BE MORE PRECISE! We'll probably get better perf that way
    texUsages[p.name] |=
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC;
  });
  cy.kindToPtrs.renderPipeline.forEach((p) => {
    p.output.forEach((o) => {
      const name = isResourcePtr(o) ? o.name : o.ptr.name;
      texUsages[name] |= GPUTextureUsage.RENDER_ATTACHMENT;
    });
    if (p.depthStencil) {
      const depthPtr = isResourcePtr(p.depthStencil)
        ? p.depthStencil
        : p.depthStencil.ptr;
      texUsages[depthPtr.name] |= GPUTextureUsage.RENDER_ATTACHMENT;
    }
  });
  [...cy.kindToPtrs.renderPipeline, ...cy.kindToPtrs.compPipeline].forEach(
    (p) => {
      p.globals.forEach((r) => {
        if (isResourcePtr(r)) {
          // nothing?
        } else {
          if (r.ptr.kind === "texture") {
            if (r.access === "write" /*|| r.access === "read_write"*/) {
              texUsages[r.ptr.name] |= GPUTextureUsage.STORAGE_BINDING;
            }
          }
        }
      });
    }
  );
  return texUsages;
}

function createCySampler(
  device: GPUDevice,
  name: string,
  s: CySamplerPtr
): CySampler {
  // TODO(@darzu): other sampler features?
  let desc: GPUSamplerDescriptor;
  if (
    s.name === "linearSampler"
    // || s.name === "linearUnfilterSampler"
  ) {
    desc = {
      label: s.name,
      minFilter: "linear",
      magFilter: "linear",
    };
  } else if (s.name === "nearestSampler") {
    desc = {
      label: s.name,
      minFilter: "nearest",
      magFilter: "nearest",
    };
  } else if (s.name === "comparison") {
    desc = {
      label: s.name,
      compare: "less",
    };
  } else never(s, "todo");
  return {
    ptr: s,
    sampler: device.createSampler(desc),
  };
}

export function createCyResources(
  cy: CyRegistry,
  shaders: ShaderSet,
  device: GPUDevice
): CyResources {
  const start = performance.now();

  const bufferUsages = collectBufferUsages(cy);
  const textureUsages = collectTextureUsages(cy);

  // create resources
  const kindToNameToRes: CyKindToNameToRes = {
    array: {},
    singleton: {},
    idxBuffer: {},
    texture: {},
    depthTexture: {},
    compPipeline: {},
    renderPipeline: {},
    meshPool: {},
    sampler: {},
  };

  // create singleton resources
  for (let s of cy.kindToPtrs.sampler) {
    kindToNameToRes.sampler[s.name] = createCySampler(device, s.name, s);
  }

  // create many-buffers
  cy.kindToPtrs.array.forEach((r) => {
    const usage = bufferUsages[r.name]!;
    const lengthOrData = typeof r.init === "number" ? r.init : r.init();
    const buf = createCyArray(device, r.name, r.struct, usage, lengthOrData);
    kindToNameToRes.array[r.name] = buf;
  });

  // create one-buffers
  cy.kindToPtrs.singleton.forEach((r) => {
    const usage = bufferUsages[r.name]!;
    const buf = createCySingleton(
      device,
      r.name,
      r.struct,
      usage,
      r.init ? r.init() : undefined
    );
    kindToNameToRes.singleton[r.name] = buf;
  });

  // create idx-buffers
  cy.kindToPtrs.idxBuffer.forEach((r) => {
    const data = typeof r.init === "function" ? r.init() : undefined;
    const length: number = data ? data.length : (r.init as number);
    const buf = createCyIdxBuf(device, r.name, length, data);
    kindToNameToRes.idxBuffer[r.name] = buf;
  });

  // create mesh pools
  cy.kindToPtrs.meshPool.forEach((r) => {
    const pool = createMeshPool(device, { kindToNameToRes }, r);
    kindToNameToRes.meshPool[r.name] = pool;
  });

  // create textures
  cy.kindToPtrs.texture.forEach((r) => {
    const usage = textureUsages[r.name];
    const t = createCyTexture(device, r, usage);
    kindToNameToRes.texture[r.name] = t;
  });

  // create depth textures
  cy.kindToPtrs.depthTexture.forEach((r) => {
    const usage = textureUsages[r.name];
    const t = createCyDepthTexture(device, r, usage);
    kindToNameToRes.depthTexture[r.name] = t;
  });

  // create pipelines
  for (let p of [
    ...cy.kindToPtrs["compPipeline"],
    ...cy.kindToPtrs["renderPipeline"],
  ]) {
    const pipeline = createCyPipeline(p, device, shaders, kindToNameToRes);
    if (isRenderPipeline(pipeline))
      kindToNameToRes.renderPipeline[p.name] = pipeline;
    else kindToNameToRes.compPipeline[p.name] = pipeline;
  }

  if (VERBOSE_LOG)
    console.log(
      `createCyResources took: ${(performance.now() - start).toFixed(1)}ms`
    );

  return {
    kindToNameToRes,
  };
}

function createCyPipeline(
  p: CyPipelinePtr,
  device: GPUDevice,
  shaders: ShaderSet,
  kindToNameToRes: CyKindToNameToRes
): CyPipeline {
  const shaderStage = isRenderPipelinePtr(p)
    ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
    : GPUShaderStage.COMPUTE;

  // normalize global format
  const globalUsages = normalizeGlobals(p.globals);

  // resources layout and bindings
  // TODO(@darzu): don't like this dynamic layout var
  const resBindGroupLayout = mkBindGroupLayout(globalUsages, false);
  // TODO(@darzu): wait, plurality many isn't right
  // const resBindGroup = mkBindGroup(resBindGroupLayout, resUsages, "many");

  // shader resource setup
  const shaderResStructs = globalUsages.map((r) => {
    // TODO(@darzu): HACK
    const plurality = r.ptr.kind === "singleton" ? "one" : "many";
    return globalToWgslDefs(r, plurality);
  });
  const shaderResVars = globalUsages.map((r, i) => {
    const plurality = r.ptr.kind === "singleton" ? "one" : "many";
    return globalToWgslVars(r, plurality, 0, i, shaderStage);
  });

  const shaderCore = isString(p.shader)
    ? shaders[p.shader].code
    : p.shader(shaders);

  if (isRenderPipelinePtr(p)) {
    const output = normalizeColorAttachments(p.output);

    const targets: GPUColorTargetState[] = output.map((o) => {
      // TODO(@darzu): support configuring blend modes!
      //   // TODO(@darzu): this is a stub. Needs cooperation w/ depth buffer.
      //   //   see: https://gpuweb.github.io/gpuweb/#blend-state
      return {
        format: o.ptr.format,
        blend: o.blend,
      };
    });

    let depthStencilOpts: GPUDepthStencilState | undefined = undefined;
    if (p.depthStencil) {
      // TODO(@darzu): parameterize
      // TODO(@darzu): hack
      // const depthWriteEnabled = p.name === "renderStars" ? false : true;
      let depthWriteEnabled = !p.depthReadonly;
      const depthPtr = isResourcePtr(p.depthStencil)
        ? p.depthStencil
        : p.depthStencil.ptr;
      depthStencilOpts = {
        depthWriteEnabled,
        depthCompare: p.depthCompare ?? "less",
        format: depthPtr.format,
      };
    }

    const primitive: GPUPrimitiveState = {
      topology: "triangle-list",
      cullMode: p.cullMode ?? "back",
      frontFace: p.frontFace ?? "ccw",
    };

    if (p.meshOpt.stepMode === "per-instance") {
      const vertBuf = kindToNameToRes.array[p.meshOpt.vertex.name];
      const instBuf = kindToNameToRes.array[p.meshOpt.instance.name];
      const idxBuffer = kindToNameToRes.idxBuffer[p.meshOpt.index.name];

      const vertexInputStruct =
        `struct VertexInput {\n` + `${vertBuf.struct.wgsl(false, 0)}\n` + `}\n`;
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
        `${shaderCore}\n`;

      // render pipeline
      const shader = device.createShaderModule({
        label: `${p.name}_shader`,
        code: shaderStr,
      });
      const rndrPipelineDesc: GPURenderPipelineDescriptor = {
        label: `${p.name}_pipeDesc`,
        // TODO(@darzu): allow this to be parameterized
        primitive,
        depthStencil: depthStencilOpts,
        // TODO(@darzu): ANTI-ALIAS
        // multisample: {
        //   count: antiAliasSampleCount,
        // },
        layout: device.createPipelineLayout({
          label: `${p.name}_pipeLayout`,
          bindGroupLayouts: [resBindGroupLayout],
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
          targets,
        },
      };
      // console.dir(rndrPipelineDesc);
      const rndrPipeline = device.createRenderPipeline(rndrPipelineDesc);
      const cyPipeline: CyRenderPipeline = {
        ptr: p,
        indexBuf: idxBuffer,
        vertexBuf: vertBuf,
        instanceBuf: instBuf,
        pipeline: rndrPipeline,
        bindGroupLayouts: [resBindGroupLayout],
        output,
      };
      return cyPipeline;
    } else if (p.meshOpt.stepMode === "per-mesh-handle") {
      // TODO(@darzu): de-duplicate with above?
      const pool: MeshPool<any, any> =
        kindToNameToRes.meshPool[p.meshOpt.pool.name];

      // TODO(@darzu): we shouldn't need the uni ptr here, just the struct
      const uniUsage: CyGlobalUsage<CyArrayPtr<any>> = {
        ptr: pool.unisPtr,
        access: "read",
        // TODO(@darzu): use different aliases?
        alias: "meshUni",
      };
      const uniBGLayout = mkBindGroupLayout([uniUsage], true);
      // const uniBGLayout = device.createBindGroupLayout({
      //   entries: [pool.ptr.unisStruct.layout(0, shaderStage, "uniform", true)],
      // });

      const uniStruct = globalToWgslDefs(uniUsage, "one");
      const uniVar = globalToWgslVars(uniUsage, "one", 1, 0, shaderStage);

      const vertexInputStruct =
        `struct VertexInput {\n` +
        `${pool.ptr.vertsStruct.wgsl(false, 0)}\n` +
        `}\n`;

      // render shader
      // TODO(@darzu): pass vertex buffer and instance buffer into shader
      const shaderStr =
        `${shaderResStructs.join("\n")}\n` +
        `${shaderResVars.join("\n")}\n` +
        `${uniStruct}\n` +
        `${uniVar}\n` +
        `${vertexInputStruct}\n` +
        `${shaderCore}\n`;

      // render pipeline
      const shader = device.createShaderModule({
        label: `${p.name}_shader`,
        code: shaderStr,
      });
      const rndrPipelineDesc: GPURenderPipelineDescriptor = {
        label: `${p.name}_pipeDesc`,
        primitive,
        depthStencil: depthStencilOpts,
        // TODO(@darzu): ANTI-ALIAS
        // multisample: {
        //   count: antiAliasSampleCount,
        // },
        layout: device.createPipelineLayout({
          label: `${p.name}_pipeLayout`,
          bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
        }),
        vertex: {
          module: shader,
          entryPoint: p.shaderVertexEntry,
          buffers: [pool.ptr.vertsStruct.vertexLayout("vertex", 0)],
        },
        fragment: {
          module: shader,
          entryPoint: p.shaderFragmentEntry,
          targets,
        },
      };
      // console.dir(rndrPipelineDesc);
      const rndrPipeline = device.createRenderPipeline(rndrPipelineDesc);
      const cyPipeline: CyRenderPipeline = {
        ptr: p,
        pipeline: rndrPipeline,
        pool,
        bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
        output,
      };
      return cyPipeline;
    } else if (p.meshOpt.stepMode === "single-draw") {
      // render shader
      // TODO(@darzu): pass vertex buffer and instance buffer into shader
      const shaderStr =
        `${shaderResStructs.join("\n")}\n` +
        `${shaderResVars.join("\n")}\n` +
        `${shaderCore}\n`;

      // render pipeline
      const shader = device.createShaderModule({
        label: `${p.name}_shader`,
        code: shaderStr,
      });
      const rndrPipelineDesc: GPURenderPipelineDescriptor = {
        label: `${p.name}_pipeDesc`,
        // TODO(@darzu): do we want depth stencil and multisample for this??
        primitive,
        // TODO(@darzu): depth stencil should be optional?
        depthStencil: depthStencilOpts,
        // TODO(@darzu): ANTI-ALIAS
        // multisample: {
        //   count: antiAliasSampleCount,
        // },
        layout: device.createPipelineLayout({
          label: `${p.name}_pipeLayout`,
          bindGroupLayouts: [resBindGroupLayout],
        }),
        vertex: {
          module: shader,
          entryPoint: p.shaderVertexEntry,
          // TODO(@darzu): constants
          constants: p.vertOverrides,
        },
        fragment: {
          module: shader,
          entryPoint: p.shaderFragmentEntry,
          targets,
          // TODO(@darzu): constants
          constants: p.fragOverrides,
        },
      };
      const rndrPipeline = device.createRenderPipeline(rndrPipelineDesc);
      const cyPipeline: CyRenderPipeline = {
        ptr: p,
        pipeline: rndrPipeline,
        bindGroupLayouts: [resBindGroupLayout],
        output,
      };
      return cyPipeline;
    } else {
      never(p.meshOpt, `Unimplemented step kind`);
    }
  } else {
    const shaderStr =
      `${shaderResStructs.join("\n")}\n` +
      `${shaderResVars.join("\n")}\n` +
      `${shaderCore}\n`;

    let compPipeline = device.createComputePipeline({
      label: `${p.name}_computePipeline`,
      layout: device.createPipelineLayout({
        label: `${p.name}_pipeLayout`,
        bindGroupLayouts: [resBindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          label: `${p.name}_shader`,
          code: shaderStr,
        }),
        entryPoint: p.shaderComputeEntry ?? "main",
        constants: p.overrides,
      },
    });
    const cyPipeline: CyCompPipeline = {
      ptr: p,
      pipeline: compPipeline,
      bindGroupLayout: resBindGroupLayout,
      workgroupCounts: isFunction(p.workgroupCounts)
        ? p.workgroupCounts([100, 100])
        : p.workgroupCounts,
    };
    return cyPipeline;
  }

  // TODO(@darzu): not very elegant
  function getBufferBindingType(
    ptr: CyBufferPtr<any>,
    shaderStage: GPUShaderStageFlags
  ): GPUBufferBindingType {
    // TODO(@darzu): more precise?
    let bindingType: GPUBufferBindingType = "storage";
    if (ptr.struct.opts?.isUniform) bindingType = "uniform";
    else if ((shaderStage & GPUShaderStage.VERTEX) !== 0)
      // NOTE: writable storage is not allowed in the vertex stage
      // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbindgrouplayout
      // TODO(@darzu): clean up this logic?
      bindingType = "read-only-storage";
    return bindingType;
  }
  // TODO(@darzu): move helpers elsewhere?
  // TODO(@darzu): dynamic is wierd to pass here
  function mkGlobalLayoutEntry(
    idx: number,
    r: CyGlobalUsage<CyGlobal>,
    dynamic: boolean
  ): GPUBindGroupLayoutEntry {
    if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
      let bindingType = getBufferBindingType(r.ptr, shaderStage);
      return r.ptr.struct.layout(idx, shaderStage, bindingType, dynamic);
    } else if (r.ptr.kind === "texture" || r.ptr.kind === "depthTexture") {
      if (!r.access || r.access === "read") {
        // TODO(@darzu): is this a reasonable way to determine sample type?
        //    what does sample type even mean in this context :(
        let sampleType: GPUTextureSampleType;
        if (r.ptr.kind === "depthTexture") {
          sampleType = "depth";
        } else if (r.ptr.format.endsWith("uint")) {
          sampleType = "uint";
        } else if (r.ptr.format.endsWith("sint")) {
          sampleType = "sint";
        } else {
          // TODO(@darzu): better sample type selection?
          sampleType = (texTypeToSampleType[r.ptr.format] ?? ["float"])[0];
        }
        return {
          binding: idx,
          visibility: shaderStage,
          // TODO(@darzu): need a mapping of format -> sample type?
          // texture: { sampleType: "float" },
          // texture: { sampleType: "depth" },
          texture: {
            sampleType: sampleType,
            viewDimension: r.ptr.count ? "2d-array" : "2d",
          },
        };
      } else {
        // Note: writable storage textures aren't allowed in the vertex stage
        let visibility = shaderStage & ~GPUShaderStage.VERTEX;
        return {
          binding: idx,
          visibility,
          storageTexture: { format: r.ptr.format, access: "write-only" },
        };
      }
    } else if (r.ptr.kind === "sampler") {
      if (r.ptr.name === "comparison") {
        return {
          binding: idx,
          visibility: shaderStage,
          sampler: { type: "comparison" },
        };
        // } else if (r.ptr.name === "linearUnfilterSampler") {
        //   // TODO(@darzu): this definitely feels awkward
        //   return {
        //     binding: idx,
        //     visibility: shaderStage,
        //     sampler: { type: "non-filtering" },
        //   };
      } else {
        return {
          binding: idx,
          visibility: shaderStage,
          // TODO(@darzu): support non-filtering?
          sampler: { type: "filtering" },
        };
      }
    } else {
      never(r.ptr, "UNIMPLEMENTED");
    }
  }
  function mkBindGroupLayout(
    ptrs: CyGlobalUsage<CyGlobal>[],
    dynamic: boolean
  ) {
    const bindGroupLayoutDesc: GPUBindGroupLayoutDescriptor = {
      label: `${p.name}_bindGLD`,
      entries: ptrs.map((r, i) => {
        const res = mkGlobalLayoutEntry(i, r, dynamic);
        return res;
      }),
    };
    return device.createBindGroupLayout(bindGroupLayoutDesc);
  }

  function globalToWgslDefs(
    r: CyGlobalUsage<CyGlobal>,
    plurality: "one" | "many"
  ) {
    if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
      const structStr =
        `struct ${capitalize(r.ptr.name)} {\n` +
        r.ptr.struct.wgsl(true) +
        `\n };\n`;
      if (plurality === "one") {
        return structStr;
      } else {
        // TODO: can technically support fixed-size arrays even when initial data is passed
        const fixedSize =
          typeof r.ptr.init === "number" ? `, ${r.ptr.init}` : "";
        return (
          structStr +
          `struct ${pluralize(capitalize(r.ptr.name))} {\n` +
          `ms : array<${capitalize(r.ptr.name)}${fixedSize}>,\n` +
          `};\n`
        );
      }
    } else if (r.ptr.kind === "texture" || r.ptr.kind === "depthTexture") {
      // nothing to do for textures
      return ``;
    } else if (r.ptr.kind === "sampler") {
      // nothing to do for samplers
      return ``;
    } else {
      never(r.ptr, "unimplemented");
    }
  }
  function globalToWgslVars(
    r: CyGlobalUsage<CyGlobal>,
    plurality: "one" | "many",
    groupIdx: number,
    bindingIdx: number,
    stage: GPUShaderStageFlags
  ) {
    if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
      const usage = getBufferBindingType(r.ptr, stage);
      const varPrefix = GPUBufferBindingTypeToWgslVar[usage];
      const varName =
        r.alias ??
        (plurality === "one"
          ? uncapitalize(r.ptr.name)
          : pluralize(uncapitalize(r.ptr.name)));
      // console.log(varName); // TODO(@darzu):
      const varType =
        plurality === "one"
          ? capitalize(r.ptr.name)
          : pluralize(capitalize(r.ptr.name));
      // TODO(@darzu): support multiple groups?
      return `@group(${groupIdx}) @binding(${bindingIdx}) ${varPrefix} ${varName} : ${varType};`;
    } else if (r.ptr.kind === "texture" || r.ptr.kind === "depthTexture") {
      const varName = r.alias ?? uncapitalize(r.ptr.name);
      if (!r.access || r.access === "read") {
        // TODO(@darzu): handle other formats?
        // TODO(@darzu): needs a D.R.Y. pass
        if (r.ptr.kind === "depthTexture") {
          if (r.ptr.count && r.ptr.count > 1) {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_depth_2d_array;`;
          } else {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_depth_2d;`;
          }
        } else if (r.ptr.format.endsWith("uint")) {
          assert(!r.ptr.count, `TODO IMPL!`);
          return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<u32>;`;
        } else {
          if (r.ptr.count && r.ptr.count > 1) {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d_array<f32>;`;
          } else {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<f32>;`;
          }
        }
      } else
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_storage_2d<${r.ptr.format}, ${r.access}>;`;
    } else if (r.ptr.kind === "sampler") {
      const varName = r.alias ?? uncapitalize(r.ptr.name);
      if (r.ptr.name === "comparison")
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : sampler_comparison;`;
      else
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : sampler;`;
    } else {
      never(r.ptr, "unimpl");
    }
  }
}

function normalizeColorAttachments(atts: CyColorAttachment[]): CyAttachment[] {
  return atts.map((a) => {
    if (isResourcePtr(a)) {
      return {
        ptr: a,
        clear: "once",
      };
    } else {
      return a;
    }
  });
}

function normalizeGlobals(globals: CyGlobalParam[]): CyGlobalUsage<CyGlobal>[] {
  const resUsages = globals.map((r, i) => {
    let usage: CyGlobalUsage<CyGlobal>;
    if (isResourcePtr(r)) {
      usage = {
        ptr: r,
        // TODO(@darzu): what is the right default access? per resource type?
        access: "read",
      };
    } else {
      usage = r;
    }
    return usage;
  });
  return resUsages;
}

export function bundleRenderPipelines(
  device: GPUDevice,
  resources: CyResources,
  renderPipelines: CyRenderPipeline[],
  meshHandleIds: Set<MeshHandle["mId"]>
): GPURenderBundle[] {
  const bundles: GPURenderBundle[] = [];
  let dbgNumTris = 0;
  // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
  // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
  for (let p of renderPipelines) {
    // TODO(@darzu): OUTPUT, pipeline.output;
    //    just airty and color here
    //    need bundle per-pipeline, or per same output
    const colorFormats: GPUTextureFormat[] = p.output.map((o) => {
      return o.ptr.format;
    });
    // TODO(@darzu): create once?
    const depthStencilPtr = isResourcePtr(p.ptr.depthStencil)
      ? p.ptr.depthStencil
      : p.ptr.depthStencil?.ptr;
    const bundleEnc = device.createRenderBundleEncoder({
      label: `${p.ptr.name}_bundleEnc`,
      colorFormats,
      depthStencilFormat: depthStencilPtr?.format,
      depthReadOnly: p.ptr.depthReadonly,
      // TODO(@darzu): seperate stencil vs depth readonly
      stencilReadOnly: p.ptr.depthReadonly,
      // TODO(@darzu): ANTI-ALIAS
      // sampleCount: antiAliasSampleCount,
    });

    bundleEnc.setPipeline(p.pipeline);

    // bind group 0 is always the global resources
    // TODO(@darzu): this seems a bit hacky
    if (p.bindGroupLayouts.length) {
      const resBindGroupLayout = p.bindGroupLayouts[0];
      const globalUsages = normalizeGlobals(p.ptr.globals);
      const resBindGroup = mkBindGroup(
        device,
        resources,
        resBindGroupLayout,
        globalUsages,
        "many"
      );
      bundleEnc.setBindGroup(0, resBindGroup);
    }

    if (p.ptr.meshOpt.stepMode === "per-instance") {
      assert(!!p.instanceBuf && !!p.indexBuf);
      bundleEnc.setIndexBuffer(p.indexBuf.buffer, "uint16");
      if (p.vertexBuf) bundleEnc.setVertexBuffer(0, p.vertexBuf.buffer);
      bundleEnc.setVertexBuffer(1, p.instanceBuf.buffer);
      bundleEnc.drawIndexed(p.indexBuf.length, p.instanceBuf.length, 0, 0);
      dbgNumTris += p.instanceBuf.length * (p.indexBuf.length / 3);
    } else if (p.ptr.meshOpt.stepMode === "per-mesh-handle") {
      assert(!!p.pool && p.bindGroupLayouts.length >= 2);
      assert(p.pool.ptr === p.ptr.meshOpt.pool);
      const uniBGLayout = p.bindGroupLayouts[1]; // TODO(@darzu): hacky convention?
      const uniUsage: CyGlobalUsage<CyArrayPtr<any>> = {
        ptr: p.pool.unisPtr,
        access: "read",
      };
      const uniBG = mkBindGroup(
        device,
        resources,
        uniBGLayout,
        [uniUsage],
        "one"
      );
      for (let set of p.pool.sets) {
        bundleEnc.setIndexBuffer(set.inds.buffer, "uint16");
        bundleEnc.setVertexBuffer(0, set.verts.buffer);
        // TODO(@darzu): filter meshes?
        for (let m of set.meshes) {
          // TODO(@darzu): DBG
          // if (p.pool.opts.computeVertsData === oceanPoolPtr.computeVertsData) {
          // console.log(`OCEAN MESH: ${m.mId} has: ${meshHandleIds.has(m.mId)}`);
          // }
          if (!meshHandleIds.has(m.mId)) continue;
          let mask = p.ptr.meshOpt.meshMask ?? DEFAULT_MASK;
          if ((mask & m.mask) === 0) continue;
          bundleEnc.setBindGroup(1, uniBG, [
            m.uniIdx * p.pool.unis.struct.size,
          ]);
          // TODO(@darzu): do we always want to draw max or do we want to rebundle?
          let numTri = m.reserved?.maxTriNum ?? m.triNum;
          bundleEnc.drawIndexed(numTri * 3, undefined, m.triIdx * 3, m.vertIdx);
          dbgNumTris += m.triNum * 3;
        }
      }
    } else if (p.ptr.meshOpt.stepMode === "single-draw") {
      bundleEnc.draw(p.ptr.meshOpt.vertexCount, 1, 0, 0);
      dbgNumTris += p.ptr.meshOpt.vertexCount;
    } else {
      never(p.ptr.meshOpt, `Unimplemented mesh step mode`);
    }

    let renderBundle = bundleEnc.finish();
    bundles.push(renderBundle);
  }

  // TODO(@darzu): DBG ing
  // TODO(@darzu): we're bundling too often
  // console.log(`bundled ${dbgNumTris} triangles`);

  return bundles;
}

function mkBindGroupEntry(
  device: GPUDevice,
  resources: CyResources,
  idx: number,
  r: CyGlobalUsage<CyGlobal>,
  bufPlurality: "one" | "many"
): GPUBindGroupEntry {
  const kindToNameToRes = resources.kindToNameToRes;
  if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
    const buf =
      r.ptr.kind === "singleton"
        ? kindToNameToRes.singleton[r.ptr.name]
        : kindToNameToRes.array[r.ptr.name];
    assert(!!buf, `Missing resource buffer: ${r.ptr.name}`);
    // TODO(@darzu): not super happy with how plurality is handled
    return buf.binding(idx, bufPlurality);
  } else if (r.ptr.kind === "texture" || r.ptr.kind === "depthTexture") {
    const tex = kindToNameToRes[r.ptr.kind][r.ptr.name]!;
    // assert(!tex.ptr.count, `TODO: impl mkBindGroupEntry for coutn`);
    const res: GPUBindGroupEntry = {
      binding: idx,
      // TODO(@darzu): does this view need to be updated on resize?
      resource: tex.texture.createView({
        label: `${r.ptr.name}_viewForBGE`,
        dimension: tex.ptr.count && tex.ptr.count > 1 ? "2d-array" : "2d",
        arrayLayerCount: tex.ptr.count ?? 1,
      }),
    };
    // TODO(@darzu): SHADOWS DON"T WORK
    // if (tex.ptr.count) {
    //   console.log(`binding ${tex.ptr.name} at idx: ${idx}`);
    //   console.dir(res);
    //   // (window as any).myTex = tex.texture;
    // }
    return res;
  } else if (r.ptr.kind === "sampler") {
    const sampler = kindToNameToRes.sampler[r.ptr.name];
    return {
      binding: idx,
      resource: sampler.sampler,
    };
  } else {
    never(r.ptr, "unimplemented");
  }
}
export function mkBindGroup(
  device: GPUDevice,
  resources: CyResources,
  layout: GPUBindGroupLayout,
  ptrs: CyGlobalUsage<CyGlobal>[],
  // TODO(@darzu): this is a hack.....
  bufPlurality: "one" | "many"
) {
  const bindGroup = device.createBindGroup({
    label: `${ptrs.map((p) => p.ptr.name).join("-")}_bindGroup`,
    layout: layout,
    entries: ptrs.map((r, i) => {
      return mkBindGroupEntry(device, resources, i, r, bufPlurality);
    }),
  });
  return bindGroup;
}

// TODO(@darzu): The abstraction here feels off. We probably want a way to
//  capture pipeline+bundle, and also the various attachment states shouldn't
//  be dependant on prev-next pipelines. Do we need a "pass" abstraction?
export interface BundleRenderer {
  render: (pipeline: CyRenderPipeline, bundle: GPURenderBundle) => void;
}
export function startBundleRenderer(
  context: GPUCanvasContext,
  commandEncoder: GPUCommandEncoder,
  resources: CyResources
): BundleRenderer {
  // render bundles
  // TODO(@darzu): ordering needs to be set by outside config
  // TODO(@darzu): same attachments need to be shared
  let lastPipeline: CyRenderPipeline | undefined;
  let renderPassEncoder: GPURenderPassEncoder | undefined;
  let seenTextures: Set<string> = new Set();
  let seenDepthTextures: Set<string> = new Set();

  const black4 = V(0, 0, 0, 1);

  function render(p: CyRenderPipeline, bundle: GPURenderBundle) {
    let colorAttachments: GPURenderPassColorAttachment[] = p.output.map((o) => {
      const isFirst = !seenTextures.has(o.ptr.name);
      seenTextures.add(o.ptr.name);
      let tex = resources.kindToNameToRes.texture[o.ptr.name]!;
      const doClear = isFirst ? o.clear === "once" : o.clear === "always";
      const defaultColor = o.defaultColor ?? black4;
      assert(!tex.ptr.count, `TODO: impl array texture for render()`);
      const viewOverride = o.ptr.attachToCanvas
        ? context.getCurrentTexture().createView()
        : undefined;
      return tex.attachment({ doClear, defaultColor, viewOverride });
    });
    let depthAtt: GPURenderPassDepthStencilAttachment | undefined = undefined;
    if (p.ptr.depthStencil) {
      const depthPtr = isResourcePtr(p.ptr.depthStencil)
        ? p.ptr.depthStencil
        : p.ptr.depthStencil.ptr;
      const layerIdx = isResourcePtr(p.ptr.depthStencil)
        ? 0
        : p.ptr.depthStencil.idx;
      const attKey = `${depthPtr.name}_${layerIdx}`;
      const isFirst = !seenDepthTextures.has(attKey);
      seenDepthTextures.add(attKey);
      const depthTex = resources.kindToNameToRes.depthTexture[depthPtr.name];
      // TODO(@darzu): parameterize doClear like we do textures above
      const doClear = isFirst ? true : false;
      depthAtt = depthTex.depthAttachment(doClear, layerIdx);
    }

    renderPassEncoder = commandEncoder.beginRenderPass({
      label: `${p.ptr.name}_renderPass`,
      // TODO(@darzu): OUTPUT, different render targets
      //    need different pass per different output; start with one bundle per pipeline
      colorAttachments,
      // TODO(@darzu): parameterize depth attachment?
      depthStencilAttachment: depthAtt,
    });
    renderPassEncoder.setBlendConstant([1, 1, 1, 1]); // TODO(@darzu): hack? settable?

    renderPassEncoder.executeBundles([bundle]);
    renderPassEncoder.end();

    lastPipeline = p;
  }

  // TODO(@darzu): support multi-output
  // function isOutputEq(a: CyRenderPipeline, b: CyRenderPipeline) {
  //   return (
  //     a.output.length === b.output.length &&
  //     a.output.every((a, i) => a.ptr.name === b.output[i].ptr.name) &&
  //     a.ptr.depthStencil?.name === b.ptr.depthStencil?.name
  //   );
  // }

  return { render };
}

// TODO(@darzu): what is beginPipelineStatisticsQuery
// TODO(@darzu): Doug is probably implementing this
// let querySet: GPUQuerySet | undefined = undefined;

export function doCompute(
  device: GPUDevice,
  resources: CyResources,
  commandEncoder: GPUCommandEncoder,
  pipeline: CyCompPipeline
) {
  // if (!querySet) {
  //   querySet = device.createQuerySet({
  //     type: "timestamp",
  //     count: 10,
  //   });
  // }

  const compPassEncoder = commandEncoder.beginComputePass();
  // compPassEncoder.writeTimestamp(querySet, 0);
  compPassEncoder.setPipeline(pipeline.pipeline);

  // TODO(@darzu): de-dupe?
  const resBindGroupLayout = pipeline.bindGroupLayout;
  const globalUsages = normalizeGlobals(pipeline.ptr.globals);
  const resBindGroup = mkBindGroup(
    device,
    resources,
    resBindGroupLayout,
    globalUsages,
    "many"
  );

  compPassEncoder.setBindGroup(0, resBindGroup);
  compPassEncoder.dispatchWorkgroups(...pipeline.workgroupCounts);
  // compPassEncoder.writeTimestamp(querySet, 1);

  compPassEncoder.end();
}

export function onCanvasResizeAll(
  device: GPUDevice,
  context: GPUCanvasContext,
  resources: CyResources,
  canvasSize: [number, number]
) {
  // TODO(@darzu): this call shouldn't be necessary anymore
  context.configure({
    device: device,
    format: canvasFormat, // presentationFormat
    // TODO(@darzu): support transparency?
    // alphaMode: "premultiplied",
    alphaMode: "opaque",
    colorSpace: "srgb",
  });

  for (let tex of [
    ...Object.values(resources.kindToNameToRes.texture),
    ...Object.values(resources.kindToNameToRes.depthTexture),
  ]) {
    if (tex.ptr.onCanvasResize) {
      const newSize = tex.ptr.onCanvasResize(canvasSize[0], canvasSize[1]);
      tex.resize(newSize[0], newSize[1]);
    }
  }

  for (let comp of Object.values(resources.kindToNameToRes.compPipeline)) {
    if (isFunction(comp.ptr.workgroupCounts)) {
      comp.workgroupCounts = comp.ptr.workgroupCounts(canvasSize);
    }
  }
}
