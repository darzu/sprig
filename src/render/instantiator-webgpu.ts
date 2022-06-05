import { assert } from "../test.js";
import {
  never,
  capitalize,
  pluralize,
  uncapitalize,
  isString,
} from "../util.js";
import {
  PtrKindToResourceType,
  createCyArray,
  createCySingleton,
  createCyIdxBuf,
  createCyTexture,
  createCyDepthTexture,
  CyRenderPipeline,
  CyCompPipeline,
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
} from "./gpu-registry.js";
import { GPUBufferBindingTypeToWgslVar } from "./gpu-struct.js";
import { createMeshPool, MeshHandle } from "./mesh-pool.js";
import { ShaderSet } from "./shader-loader.js";

const prim_tris: GPUPrimitiveState = {
  topology: "triangle-list",
  cullMode: "back",
  frontFace: "ccw",
};
const prim_lines: GPUPrimitiveState = {
  topology: "line-list",
};

export type CyResources = {
  kindToNameToRes: {
    [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
  };
};

export function createCyResources(
  cy: CyRegistry,
  shaders: ShaderSet,
  device: GPUDevice
): CyResources {
  // determine resource usage modes
  // TODO(@darzu): determine texture usage modes
  const cyNameToBufferUsage: { [name: string]: GPUBufferUsageFlags } = {};
  // all buffers are updatable via queue
  // TODO(@darzu): option for some to opt out? for perf?
  [...cy.kindToPtrs.array, ...cy.kindToPtrs.singleton].forEach(
    (r) => (cyNameToBufferUsage[r.name] |= GPUBufferUsage.COPY_DST)
  );
  // all singleton buffers are probably used as uniforms
  cy.kindToPtrs.singleton.forEach(
    (p) => (cyNameToBufferUsage[p.name] |= GPUBufferUsage.UNIFORM)
  );
  // all pipeline global resources are storage or uniform
  // TODO(@darzu): be more precise?
  [...cy.kindToPtrs.compPipeline, ...cy.kindToPtrs.renderPipeline].forEach(
    (p) =>
      p.globals.forEach((r) => {
        if (isResourcePtr(r)) {
          if (r.kind === "singleton" || r.kind === "array")
            cyNameToBufferUsage[r.name] |= GPUBufferUsage.STORAGE;
        } else {
          if (r.ptr.kind === "singleton" || r.ptr.kind === "array")
            cyNameToBufferUsage[r.ptr.name] |= GPUBufferUsage.STORAGE;
        }
      })
  );
  // render pipelines have vertex buffers and mesh pools have uniform buffers
  cy.kindToPtrs.renderPipeline.forEach((p) => {
    if (p.meshOpt.stepMode === "per-instance") {
      cyNameToBufferUsage[p.meshOpt.instance.name] |= GPUBufferUsage.VERTEX;
      cyNameToBufferUsage[p.meshOpt.vertex.name] |= GPUBufferUsage.VERTEX;
    } else if (p.meshOpt.stepMode === "per-mesh-handle") {
      cyNameToBufferUsage[p.meshOpt.pool.vertsPtr.name] |=
        GPUBufferUsage.VERTEX;
      cyNameToBufferUsage[p.meshOpt.pool.unisPtr.name] |=
        GPUBufferUsage.UNIFORM;
    } else if (p.meshOpt.stepMode === "single-draw") {
      // TODO(@darzu): any buffers?
    } else {
      never(p.meshOpt);
    }
  });
  // mesh pools have vert and uniform buffers
  cy.kindToPtrs.meshPool.forEach((p) => {
    cyNameToBufferUsage[p.vertsPtr.name] |= GPUBufferUsage.VERTEX;
    cyNameToBufferUsage[p.unisPtr.name] |= GPUBufferUsage.UNIFORM;
  });
  // apply forced usages
  // TODO(@darzu): ideally, we would understand the scenarios where we need this
  //    and infer it properly
  cy.kindToPtrs.array.forEach((b) => {
    if (b.forceUsage) cyNameToBufferUsage[b.name] = b.forceUsage;
  });

  // determine texture usages
  const cyNameToTextureUsage: { [name: string]: GPUTextureUsageFlags } = {};
  // let usage = GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
  // if (sampleCount && sampleCount > 1)
  //   usage |= GPUTextureUsage.RENDER_ATTACHMENT;
  // else usage |= GPUTextureUsage.STORAGE_BINDING;
  [...cy.kindToPtrs.texture, ...cy.kindToPtrs.depthTexture].forEach((p) => {
    // default usages
    cyNameToTextureUsage[p.name] |=
      GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
  });
  cy.kindToPtrs.renderPipeline.forEach((p) => {
    p.output.forEach((o) => {
      const name = isResourcePtr(o) ? o.name : o.ptr.name;
      cyNameToTextureUsage[name] |= GPUTextureUsage.RENDER_ATTACHMENT;
    });
    if (p.depthStencil)
      cyNameToTextureUsage[p.depthStencil.name] |=
        GPUTextureUsage.RENDER_ATTACHMENT;
  });
  [...cy.kindToPtrs.renderPipeline, ...cy.kindToPtrs.compPipeline].forEach(
    (p) => {
      p.globals.forEach((r) => {
        if (isResourcePtr(r)) {
          // nothing?
        } else {
          if (r.ptr.kind === "texture") {
            if (r.access === "write") {
              cyNameToTextureUsage[r.ptr.name] |=
                GPUTextureUsage.STORAGE_BINDING;
            }
          }
        }
      });
    }
  );

  // create resources
  // TODO(@darzu): IMPL
  const kindToNameToRes: {
    [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
  } = {
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
    // TODO(@darzu): other sampler features?
    let desc: GPUSamplerDescriptor;
    if (s.name === "linearSampler") {
      desc = {
        minFilter: "linear",
        magFilter: "linear",
      };
    } else if (s.name === "nearestSampler") {
      desc = {
        minFilter: "nearest",
        magFilter: "nearest",
      };
    } else if (s.name === "comparison") {
      desc = {
        compare: "less",
      };
    } else never(s, "todo");
    kindToNameToRes.sampler[s.name] = {
      ptr: s,
      sampler: device.createSampler(desc),
    };
  }

  // create many-buffers
  cy.kindToPtrs.array.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCyArray(device, r.struct, usage, r.init());
    kindToNameToRes.array[r.name] = buf;
  });
  // create one-buffers
  cy.kindToPtrs.singleton.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCySingleton(device, r.struct, usage, r.init());
    kindToNameToRes.singleton[r.name] = buf;
  });
  // create idx-buffers
  cy.kindToPtrs.idxBuffer.forEach((r) => {
    const buf = createCyIdxBuf(device, r.init());
    kindToNameToRes.idxBuffer[r.name] = buf;
  });
  // create mesh pools
  cy.kindToPtrs.meshPool.forEach((r) => {
    const verts = kindToNameToRes.array[r.vertsPtr.name];
    const unis = kindToNameToRes.array[r.unisPtr.name];
    const triInds = kindToNameToRes.idxBuffer[r.triIndsPtr.name];
    const lineInds = kindToNameToRes.idxBuffer[r.lineIndsPtr.name];
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
    kindToNameToRes.meshPool[r.name] = pool;
  });
  // create texture
  cy.kindToPtrs.texture.forEach((r) => {
    const usage = cyNameToTextureUsage[r.name];
    const t = createCyTexture(device, r, usage);
    kindToNameToRes.texture[r.name] = t;
  });
  cy.kindToPtrs.depthTexture.forEach((r) => {
    const usage = cyNameToTextureUsage[r.name];
    const t = createCyDepthTexture(device, r, usage);
    kindToNameToRes.depthTexture[r.name] = t;
  });
  // create pipelines
  for (let p of [
    ...cy.kindToPtrs["compPipeline"],
    ...cy.kindToPtrs["renderPipeline"],
  ]) {
    const shaderStage = isRenderPipelinePtr(p)
      ? GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
      : GPUShaderStage.COMPUTE;
    // TODO(@darzu): move helpers elsewhere?
    // TODO(@darzu): dynamic is wierd to pass here
    function mkGlobalLayoutEntry(
      idx: number,
      r: CyGlobalUsage<CyGlobal>,
      dynamic: boolean
    ): GPUBindGroupLayoutEntry {
      if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
        // TODO(@darzu):
        // const struct = isResourcePtr(r) ? r.struct : r.ptr.
        return r.ptr.struct.layout(
          idx,
          shaderStage,
          // TODO(@darzu): more precise?
          r.ptr.struct.opts?.isUniform ? "uniform" : "storage",
          dynamic
        );
      } else if (r.ptr.kind === "texture" || r.ptr.kind === "depthTexture") {
        if (!r.access || r.access === "read") {
          // TODO(@darzu): is this a reasonable way to determine sample type?
          //    what does sample type even mean in this context :(
          const usage = cyNameToTextureUsage[r.ptr.name];
          let sampleType: GPUTextureSampleType;
          if (r.ptr.kind === "depthTexture") {
            sampleType = "depth";
          } else if (r.ptr.format.endsWith("uint")) {
            sampleType = "uint";
          } else if (r.ptr.format.endsWith("sint")) {
            sampleType = "sint";
          } else if ((usage & GPUTextureUsage.STORAGE_BINDING) !== 0) {
            // TODO(@darzu): this seems hacky. is there a better way to determine this?
            //    the deferred rendering example uses unfilterable-float for reading gbuffers
            sampleType = "unfilterable-float";
          } else {
            sampleType = "float";
          }
          return {
            binding: idx,
            visibility: shaderStage,
            // TODO(@darzu): need a mapping of format -> sample type?
            // texture: { sampleType: "float" },
            // texture: { sampleType: "depth" },
            texture: { sampleType: sampleType },
          };
        } else {
          return {
            binding: idx,
            visibility: shaderStage,
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
        entries: ptrs.map((r, i) => {
          return mkGlobalLayoutEntry(i, r, dynamic);
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
          return (
            structStr +
            `struct ${pluralize(capitalize(r.ptr.name))} {\n` +
            `ms : array<${capitalize(r.ptr.name)}>,\n` +
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
      bindingIdx: number
    ) {
      if (r.ptr.kind === "singleton" || r.ptr.kind === "array") {
        const usage = r.ptr.struct.opts?.isUniform ? "uniform" : "storage";
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
          if (r.ptr.kind === "depthTexture") {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_depth_2d;`;
          } else if (r.ptr.format.endsWith("uint")) {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<u32>;`;
          } else {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<f32>;`;
          }
        } else
          return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_storage_2d<${r.ptr.format}, write>;`;
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
      return globalToWgslVars(r, plurality, 0, i);
    });

    const shaderCore = isString(p.shader) ? shaders[p.shader].code : p.shader();

    if (isRenderPipelinePtr(p)) {
      const output = normalizeColorAttachments(p.output);

      const targets: GPUColorTargetState[] = output.map((o) => {
        return {
          format: o.ptr.format,
        };
      });

      let depthStencilOpts: GPUDepthStencilState | undefined = undefined;
      if (p.depthStencil)
        depthStencilOpts = {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: p.depthStencil.format,
        };

      if (p.meshOpt.stepMode === "per-instance") {
        const vertBuf = kindToNameToRes.array[p.meshOpt.vertex.name];
        const instBuf = kindToNameToRes.array[p.meshOpt.instance.name];
        const idxBuffer = kindToNameToRes.idxBuffer[p.meshOpt.index.name];

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
          `${shaderCore}\n`;

        // render pipeline
        const shader = device.createShaderModule({
          code: shaderStr,
        });
        const rndrPipelineDesc: GPURenderPipelineDescriptor = {
          // TODO(@darzu): allow this to be parameterized
          primitive: prim_tris,
          depthStencil: depthStencilOpts,
          // TODO(@darzu): ANTI-ALIAS
          // multisample: {
          //   count: antiAliasSampleCount,
          // },
          layout: device.createPipelineLayout({
            bindGroupLayouts: [resBindGroupLayout],
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
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else if (p.meshOpt.stepMode === "per-mesh-handle") {
        // TODO(@darzu): de-duplicate with above?
        const vertBuf = kindToNameToRes.array[p.meshOpt.pool.vertsPtr.name];
        const idxBuffer =
          kindToNameToRes.idxBuffer[p.meshOpt.pool.triIndsPtr.name];
        const uniBuf = kindToNameToRes.array[p.meshOpt.pool.unisPtr.name];
        const pool = kindToNameToRes.meshPool[p.meshOpt.pool.name];

        const uniUsage: CyGlobalUsage<CyArrayPtr<any>> = {
          ptr: p.meshOpt.pool.unisPtr,
          access: "read",
        };
        const uniBGLayout = mkBindGroupLayout([uniUsage], true);

        const uniStruct = globalToWgslDefs(uniUsage, "one");
        const uniVar = globalToWgslVars(uniUsage, "one", 1, 0);

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
          `${vertexInputStruct}\n` +
          `${shaderCore}\n`;

        // render pipeline
        const shader = device.createShaderModule({
          code: shaderStr,
        });
        const rndrPipelineDesc: GPURenderPipelineDescriptor = {
          // TODO(@darzu): allow this to be parameterized
          primitive: prim_tris,
          depthStencil: depthStencilOpts,
          // TODO(@darzu): ANTI-ALIAS
          // multisample: {
          //   count: antiAliasSampleCount,
          // },
          layout: device.createPipelineLayout({
            bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
          }),
          vertex: {
            module: shader,
            entryPoint: p.shaderVertexEntry,
            buffers: [vertBuf.struct.vertexLayout("vertex", 0)],
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
          pipeline: rndrPipeline,
          pool,
          bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
          output,
        };
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else if (p.meshOpt.stepMode === "single-draw") {
        // TODO(@darzu): IMPL// render shader
        // TODO(@darzu): pass vertex buffer and instance buffer into shader
        const shaderStr =
          `${shaderResStructs.join("\n")}\n` +
          `${shaderResVars.join("\n")}\n` +
          `${shaderCore}\n`;

        // render pipeline
        const shader = device.createShaderModule({
          code: shaderStr,
        });
        const rndrPipelineDesc: GPURenderPipelineDescriptor = {
          // TODO(@darzu): do we want depth stencil and multisample for this??
          // primitive: {
          //   topology: "triangle-list",
          // },
          primitive: prim_tris,
          // TODO(@darzu): depth stencil should be optional?
          depthStencil: depthStencilOpts,
          // TODO(@darzu): ANTI-ALIAS
          // multisample: {
          //   count: antiAliasSampleCount,
          // },
          layout: device.createPipelineLayout({
            bindGroupLayouts: [resBindGroupLayout],
          }),
          vertex: {
            module: shader,
            entryPoint: p.shaderVertexEntry,
          },
          fragment: {
            module: shader,
            entryPoint: p.shaderFragmentEntry,
            targets,
          },
        };
        const rndrPipeline = device.createRenderPipeline(rndrPipelineDesc);
        const cyPipeline: CyRenderPipeline = {
          ptr: p,
          pipeline: rndrPipeline,
          bindGroupLayouts: [resBindGroupLayout],
          output,
        };
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else {
        never(p.meshOpt, `Unimplemented step kind`);
      }
    } else {
      const shaderStr =
        `${shaderResStructs.join("\n")}\n` +
        `${shaderResVars.join("\n")}\n` +
        `${shaderCore}\n`;

      const emptyLayout = device.createBindGroupLayout({
        entries: [],
      });

      let compPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [resBindGroupLayout],
        }),
        compute: {
          module: device.createShaderModule({
            code: shaderStr,
          }),
          entryPoint: p.shaderComputeEntry ?? "main",
        },
      });
      const cyPipeline: CyCompPipeline = {
        ptr: p,
        pipeline: compPipeline,
        bindGroupLayout: resBindGroupLayout,
      };
      kindToNameToRes.compPipeline[p.name] = cyPipeline;
    }
  }

  return {
    kindToNameToRes,
  };
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

const canvasFormat = navigator.gpu?.getPreferredCanvasFormat();

export function bundleRenderPipelines(
  device: GPUDevice,
  resources: CyResources,
  renderPipelines: CyRenderPipeline[],
  meshHandleIds: Set<MeshHandle<any>["mId"]>
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
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats,
      depthStencilFormat: p.ptr.depthStencil?.format,
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

    if (p.indexBuf) bundleEnc.setIndexBuffer(p.indexBuf.buffer, "uint16");
    if (p.vertexBuf) bundleEnc.setVertexBuffer(0, p.vertexBuf.buffer);
    if (p.ptr.meshOpt.stepMode === "per-instance") {
      assert(!!p.instanceBuf && !!p.indexBuf);
      bundleEnc.setVertexBuffer(1, p.instanceBuf.buffer);
      bundleEnc.drawIndexed(p.indexBuf.length, p.instanceBuf.length, 0, 0);
      dbgNumTris += p.instanceBuf.length * (p.indexBuf.length / 3);
    } else if (p.ptr.meshOpt.stepMode === "per-mesh-handle") {
      assert(!!p.pool && p.bindGroupLayouts.length >= 2);
      const uniBGLayout = p.bindGroupLayouts[1]; // TODO(@darzu): hacky convention?
      const uniUsage: CyGlobalUsage<CyArrayPtr<any>> = {
        ptr: p.ptr.meshOpt.pool.unisPtr,
        access: "read",
      };
      const uniBG = mkBindGroup(
        device,
        resources,
        uniBGLayout,
        [uniUsage],
        "one"
      );
      // TODO(@darzu): filter meshes?
      for (let m of p.pool.allMeshes) {
        if (!meshHandleIds.has(m.mId)) continue;
        bundleEnc.setBindGroup(1, uniBG, [
          m.uniIdx * p.pool.opts.unis.struct.size,
        ]);
        bundleEnc.drawIndexed(m.triNum * 3, undefined, m.triIdx * 3, m.vertIdx);
        dbgNumTris += m.triNum * 3;
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
    return {
      binding: idx,
      // TODO(@darzu): does this view need to be updated on resize?
      resource: tex.texture.createView(),
    };
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
    layout: layout,
    entries: ptrs.map((r, i) => {
      return mkBindGroupEntry(device, resources, i, r, bufPlurality);
    }),
  });
  return bindGroup;
}

export function renderBundles(
  context: GPUCanvasContext,
  commandEncoder: GPUCommandEncoder,
  resources: CyResources,
  pipelineAndBundle: [CyRenderPipeline, GPURenderBundle][]
) {
  // render bundles
  // TODO(@darzu): ordering needs to be set by outside config
  // TODO(@darzu): same attachments need to be shared
  let lastPipeline: CyRenderPipeline | undefined;
  let renderPassEncoder: GPURenderPassEncoder | undefined;
  let seenTextures: Set<string> = new Set();
  for (let [p, bundle] of pipelineAndBundle) {
    // console.log(`rendering ${p.ptr.name}`);

    if (!renderPassEncoder || !lastPipeline || !isOutputEq(lastPipeline, p)) {
      let colorAttachments: GPURenderPassColorAttachment[] = p.output.map(
        (o) => {
          const isFirst = !seenTextures.has(o.ptr.name);
          seenTextures.add(o.ptr.name);
          let tex = resources.kindToNameToRes.texture[o.ptr.name]!;
          const doClear = isFirst ? o.clear === "once" : o.clear === "always";
          const defaultColor = o.defaultColor ?? [0, 0, 0, 1];
          const viewOverride = o.ptr.attachToCanvas
            ? context.getCurrentTexture().createView()
            : undefined;
          return tex.attachment({ doClear, defaultColor, viewOverride });
        }
      );
      let depthAtt: GPURenderPassDepthStencilAttachment | undefined = undefined;
      if (p.ptr.depthStencil) {
        const depthTex =
          resources.kindToNameToRes.depthTexture[p.ptr.depthStencil.name];
        depthAtt = depthTex.depthAttachment();
      }

      renderPassEncoder?.end();
      renderPassEncoder = commandEncoder.beginRenderPass({
        // TODO(@darzu): OUTPUT, different render targets
        //    need different pass per different output; start with one bundle per pipeline
        colorAttachments,
        // TODO(@darzu): parameterize depth attachment?
        depthStencilAttachment: depthAtt,
      });
    }

    renderPassEncoder.executeBundles([bundle]);

    lastPipeline = p;
  }
  renderPassEncoder?.end();

  // TODO(@darzu): support multi-output
  function isOutputEq(a: CyRenderPipeline, b: CyRenderPipeline) {
    return (
      a.output.length === b.output.length &&
      a.output.every((a, i) => a.ptr.name === b.output[i].ptr.name) &&
      a.ptr.depthStencil?.name === b.ptr.depthStencil?.name
    );
  }
}

export function doCompute(
  device: GPUDevice,
  resources: CyResources,
  commandEncoder: GPUCommandEncoder,
  pipeline: CyCompPipeline
) {
  const compPassEncoder = commandEncoder.beginComputePass();
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
  // TODO(@darzu): parameterize workgroup count
  compPassEncoder.dispatchWorkgroups(
    ...(pipeline.ptr.workgroupCounts ?? [1, 1, 1])
  );
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
    compositingAlphaMode: "opaque",
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
}
