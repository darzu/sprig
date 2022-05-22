import { vec3 } from "../gl-matrix.js";
import { assert } from "../test.js";
import { never, capitalize, pluralize, uncapitalize } from "../util.js";
import {
  PtrKindToResourceType,
  createCyMany,
  createCyOne,
  createCyIdxBuf,
  createCyTexture,
  createCyDepthTexture,
  CyRndrPipeline,
  CyCompPipeline,
  CyTexture,
} from "./gpu-data-webgpu.js";
import {
  PtrKind,
  CyRegistry,
  isResourcePtr,
  isRenderPipelinePtr,
  CyGlobalUsage,
  CyGlobal,
  CyManyBufferPtr,
  CyGlobalParam,
  CyRndrPipelinePtr,
} from "./gpu-registry.js";
import { GPUBufferBindingTypeToWgslVar } from "./gpu-struct.js";
import { createMeshPool, MeshHandle } from "./mesh-pool.js";

const prim_tris: GPUPrimitiveState = {
  topology: "triangle-list",
  cullMode: "back",
  frontFace: "ccw",
};
const prim_lines: GPUPrimitiveState = {
  topology: "line-list",
};

export type CyResources = {
  canvasTexture: GPUTexture | undefined;
  kindToNameToRes: {
    [K in PtrKind]: { [name: string]: PtrKindToResourceType[K] };
  };
};

export function createCyResources(
  cy: CyRegistry,
  device: GPUDevice
): CyResources {
  // determine resource usage modes
  // TODO(@darzu): determine texture usage modes
  const cyNameToBufferUsage: { [name: string]: GPUBufferUsageFlags } = {};
  // all buffers are updatable via queue
  // TODO(@darzu): option for some to opt out? for perf?
  [...cy.kindToPtrs.manyBuffer, ...cy.kindToPtrs.oneBuffer].forEach(
    (r) => (cyNameToBufferUsage[r.name] |= GPUBufferUsage.COPY_DST)
  );
  // all singleton buffers are probably used as uniforms
  cy.kindToPtrs.oneBuffer.forEach(
    (p) => (cyNameToBufferUsage[p.name] |= GPUBufferUsage.UNIFORM)
  );
  // all pipeline global resources are storage or uniform
  // TODO(@darzu): be more precise?
  [...cy.kindToPtrs.compPipeline, ...cy.kindToPtrs.renderPipeline].forEach(
    (p) =>
      p.resources.forEach((r) => {
        if (isResourcePtr(r)) {
          if (r.kind === "oneBuffer" || r.kind === "manyBuffer")
            cyNameToBufferUsage[r.name] |= GPUBufferUsage.STORAGE;
        } else {
          if (r.ptr.kind === "oneBuffer" || r.ptr.kind === "manyBuffer")
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
    if (p.output.kind === "texture") {
      cyNameToTextureUsage[p.output.name] |= GPUTextureUsage.RENDER_ATTACHMENT;
    }
    cyNameToTextureUsage[p.depthStencil.name] |=
      GPUTextureUsage.RENDER_ATTACHMENT;
  });
  [...cy.kindToPtrs.renderPipeline, ...cy.kindToPtrs.compPipeline].forEach(
    (p) => {
      p.resources.forEach((r) => {
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
    manyBuffer: {},
    oneBuffer: {},
    idxBuffer: {},
    texture: {},
    depthTexture: {},
    compPipeline: {},
    renderPipeline: {},
    meshPool: {},
    canvasTexture: {},
    sampler: {},
  };

  // create singleton resources
  // TODO(@darzu): create CyTexture for canvas
  // const cyCanvasTex = createCyTexture(device, canvasTexturePtr);
  for (let s of cy.kindToPtrs.sampler) {
    // TODO(@darzu): other sampler features?
    let filterMode: GPUFilterMode;
    if (s.name === "linearSampler") filterMode = "linear";
    else if (s.name === "nearestSampler") filterMode = "nearest";
    else never(s, "todo");
    kindToNameToRes.sampler[s.name] = {
      ptr: s,
      // TODO(@darzu): support comparison sampler
      // sampler: device.createSampler({
      //   compare: "less",
      // }),
      sampler: device.createSampler({
        minFilter: filterMode,
        magFilter: filterMode,
      }),
    };
  }

  // create many-buffers
  cy.kindToPtrs.manyBuffer.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCyMany(device, r.struct, usage, r.init());
    kindToNameToRes.manyBuffer[r.name] = buf;
  });
  // create one-buffers
  cy.kindToPtrs.oneBuffer.forEach((r) => {
    const usage = cyNameToBufferUsage[r.name]!;
    const buf = createCyOne(device, r.struct, usage, r.init());
    kindToNameToRes.oneBuffer[r.name] = buf;
  });
  // create idx-buffers
  cy.kindToPtrs.idxBuffer.forEach((r) => {
    const buf = createCyIdxBuf(device, r.init());
    kindToNameToRes.idxBuffer[r.name] = buf;
  });
  // create mesh pools
  cy.kindToPtrs.meshPool.forEach((r) => {
    const verts = kindToNameToRes.manyBuffer[r.vertsPtr.name];
    const unis = kindToNameToRes.manyBuffer[r.unisPtr.name];
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
      if (r.ptr.kind === "oneBuffer" || r.ptr.kind === "manyBuffer") {
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
        return {
          binding: idx,
          visibility: shaderStage,
          // TODO(@darzu): SAMPLER what type to put here....
          // sampler: { type: "comparison" },
          // sampler: { type: "non-filtering" },
          sampler: { type: "filtering" },
        };
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
      if (r.ptr.kind === "oneBuffer" || r.ptr.kind === "manyBuffer") {
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
      if (r.ptr.kind === "oneBuffer" || r.ptr.kind === "manyBuffer") {
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
          } else {
            return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_2d<f32>;`;
          }
        } else
          return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : texture_storage_2d<${r.ptr.format}, write>;`;
      } else if (r.ptr.kind === "sampler") {
        const varName = r.alias ?? uncapitalize(r.ptr.name);
        // TODO(@darzu): support comparison sampler
        // return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : sampler_comparison;`;
        return `@group(${groupIdx}) @binding(${bindingIdx}) var ${varName} : sampler;`;
      } else {
        never(r.ptr, "unimpl");
      }
    }

    // normalize global format
    const resUsages = normalizeResources(p.resources);

    // resources layout and bindings
    // TODO(@darzu): don't like this dynamic layout var
    const resBindGroupLayout = mkBindGroupLayout(resUsages, false);
    // TODO(@darzu): wait, plurality many isn't right
    // const resBindGroup = mkBindGroup(resBindGroupLayout, resUsages, "many");

    // shader resource setup
    const shaderResStructs = resUsages.map((r) => {
      // TODO(@darzu): HACK
      const plurality = r.ptr.kind === "oneBuffer" ? "one" : "many";
      return globalToWgslDefs(r, plurality);
    });
    const shaderResVars = resUsages.map((r, i) => {
      const plurality = r.ptr.kind === "oneBuffer" ? "one" : "many";
      return globalToWgslVars(r, plurality, 0, i);
    });

    let canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    if (isRenderPipelinePtr(p)) {
      // TODO(@darzu): OUTPUT parameterize output targets
      const targets: GPUColorTargetState[] = [p.output].map((o) => {
        if (o.kind === "canvasTexture") {
          return {
            format: canvasFormat,
          };
        } else if (o.kind === "texture") {
          return {
            format: o.format,
          };
        } else {
          never(o, "TODO");
        }
      });

      const depthStencilOpts: GPUDepthStencilState = {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: p.depthStencil.format,
      };

      if (p.meshOpt.stepMode === "per-instance") {
        const vertBuf = kindToNameToRes.manyBuffer[p.meshOpt.vertex.name];
        const instBuf = kindToNameToRes.manyBuffer[p.meshOpt.instance.name];
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
          `${p.shader()}\n`;

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
        const cyPipeline: CyRndrPipeline = {
          ptr: p,
          indexBuf: idxBuffer,
          vertexBuf: vertBuf,
          instanceBuf: instBuf,
          pipeline: rndrPipeline,
          bindGroupLayouts: [resBindGroupLayout],
        };
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else if (p.meshOpt.stepMode === "per-mesh-handle") {
        // TODO(@darzu): de-duplicate with above?
        const vertBuf =
          kindToNameToRes.manyBuffer[p.meshOpt.pool.vertsPtr.name];
        const idxBuffer =
          kindToNameToRes.idxBuffer[p.meshOpt.pool.triIndsPtr.name];
        const uniBuf = kindToNameToRes.manyBuffer[p.meshOpt.pool.unisPtr.name];
        const pool = kindToNameToRes.meshPool[p.meshOpt.pool.name];

        const uniUsage: CyGlobalUsage<CyManyBufferPtr<any>> = {
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
          `${p.shader()}\n`;

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
        const cyPipeline: CyRndrPipeline = {
          ptr: p,
          indexBuf: idxBuffer,
          vertexBuf: vertBuf,
          pipeline: rndrPipeline,
          pool,
          bindGroupLayouts: [resBindGroupLayout, uniBGLayout],
        };
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else if (p.meshOpt.stepMode === "single-draw") {
        // TODO(@darzu): IMPL// render shader
        // TODO(@darzu): pass vertex buffer and instance buffer into shader
        const shaderStr =
          `${shaderResStructs.join("\n")}\n` +
          `${shaderResVars.join("\n")}\n` +
          `${p.shader()}\n`;

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
        const cyPipeline: CyRndrPipeline = {
          ptr: p,
          pipeline: rndrPipeline,
          bindGroupLayouts: [resBindGroupLayout],
        };
        kindToNameToRes.renderPipeline[p.name] = cyPipeline;
      } else {
        never(p.meshOpt, `Unimplemented step kind`);
      }
    } else {
      const shaderStr =
        `${shaderResStructs.join("\n")}\n` +
        `${shaderResVars.join("\n")}\n` +
        `${p.shader()}\n`;

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
    canvasTexture: undefined,
    kindToNameToRes,
  };
}

export function normalizeResources(
  res: CyGlobalParam[]
): CyGlobalUsage<CyGlobal>[] {
  const resUsages = res.map((r, i) => {
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
  cyKindToNameToRes: CyResources,
  renderPipelines: CyRndrPipeline[],
  meshHandleIds: Set<MeshHandle<any>["mId"]>
): GPURenderBundle[] {
  const bundles: GPURenderBundle[] = [];
  // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
  // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
  for (let p of renderPipelines) {
    // TODO(@darzu): OUTPUT, pipeline.output;
    //    just airty and color here
    //    need bundle per-pipeline, or per same output
    const colorFormats: GPUTextureFormat[] = [p.ptr.output].map((o) => {
      if (o.kind === "canvasTexture") {
        return canvasFormat;
      } else if (o.kind === "texture") {
        return o.format;
      } else {
        never(o, "TODO");
      }
    });
    // TODO(@darzu): create once?
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats,
      depthStencilFormat: p.ptr.depthStencil.format,
      // TODO(@darzu): ANTI-ALIAS
      // sampleCount: antiAliasSampleCount,
    });

    bundleEnc.setPipeline(p.pipeline);

    // bind group 0 is always the global resources
    // TODO(@darzu): this seems a bit hacky
    if (p.bindGroupLayouts.length) {
      const resBindGroupLayout = p.bindGroupLayouts[0];
      const resUsages = normalizeResources(p.ptr.resources);
      const resBindGroup = mkBindGroup(
        device,
        cyKindToNameToRes,
        resBindGroupLayout,
        resUsages,
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
    } else if (p.ptr.meshOpt.stepMode === "per-mesh-handle") {
      assert(!!p.pool && p.bindGroupLayouts.length >= 2);
      const uniBGLayout = p.bindGroupLayouts[1]; // TODO(@darzu): hacky convention?
      const uniUsage: CyGlobalUsage<CyManyBufferPtr<any>> = {
        ptr: p.ptr.meshOpt.pool.unisPtr,
        access: "read",
      };
      const uniBG = mkBindGroup(
        device,
        cyKindToNameToRes,
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
      }
    } else if (p.ptr.meshOpt.stepMode === "single-draw") {
      bundleEnc.draw(p.ptr.meshOpt.vertexCount, 1, 0, 0);
    } else {
      never(p.ptr.meshOpt, `Unimplemented mesh step mode`);
    }

    let renderBundle = bundleEnc.finish();
    bundles.push(renderBundle);
  }

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
  if (r.ptr.kind === "oneBuffer" || r.ptr.kind === "manyBuffer") {
    const buf =
      r.ptr.kind === "oneBuffer"
        ? kindToNameToRes.oneBuffer[r.ptr.name]
        : kindToNameToRes.manyBuffer[r.ptr.name];
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
  pipelineAndBundle: [CyRndrPipeline, GPURenderBundle][],
  backgroundColor: vec3
) {
  // render bundles
  // TODO(@darzu): ordering needs to be set by outside config
  // TODO(@darzu): same attachments need to be shared
  let lastPipeline: CyRndrPipelinePtr | undefined;
  let renderPassEncoder: GPURenderPassEncoder | undefined;
  for (let [p, bundle] of pipelineAndBundle) {
    // console.log(`rendering ${p.ptr.name}`);

    if (
      !renderPassEncoder ||
      !lastPipeline ||
      !isOutputEq(lastPipeline, p.ptr)
    ) {
      let colorAttachments: GPURenderPassColorAttachment[] = [p.ptr.output].map(
        (o) => {
          const isFirst = !lastPipeline;
          const doClear = isFirst;
          if (o.kind === "canvasTexture") return canvasAttachment(doClear);
          else if (o.kind === "texture") {
            let tex = resources.kindToNameToRes.texture[o.name]!;
            return textureAttachment(tex);
          } else {
            never(o, "TO IMPL");
          }
        }
      );
      const depthTex =
        resources.kindToNameToRes.depthTexture[p.ptr.depthStencil.name];
      const depthAtt = depthTex.depthAttachment();

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

    lastPipeline = p.ptr;
  }
  renderPassEncoder?.end();

  // TODO(@darzu): support multi-output
  function isOutputEq(a: CyRndrPipelinePtr, b: CyRndrPipelinePtr) {
    return (
      a.output.name === b.output.name &&
      a.depthStencil.name === b.depthStencil.name
    );
  }

  function canvasAttachment(clear?: boolean): GPURenderPassColorAttachment {
    return {
      // TODO(@darzu): ANTI-ALIAS; for some reason this is tangled in AA?
      // view: canvasTextureView!,
      // resolveTarget: context.getCurrentTexture().createView(),
      view: context.getCurrentTexture().createView(),
      // TODO(@darzu): is this how we want to handle load vs clear?
      loadOp: clear ? "clear" : "load",
      clearValue: {
        r: backgroundColor[0],
        g: backgroundColor[1],
        b: backgroundColor[2],
        a: 1,
      },
      storeOp: "store",
    };
  }

  // TODO(@darzu): move into CyTexture
  function textureAttachment(tex: CyTexture): GPURenderPassColorAttachment {
    // TODO(@darzu): parameterizable?
    return {
      view: tex.texture.createView(),
      // loadOp: "load",
      // TODO(@darzu): handle load vs clear
      loadOp: "clear",
      clearValue: {
        r: backgroundColor[0],
        g: backgroundColor[1],
        b: backgroundColor[2],
        a: 1,
      },
      storeOp: "store",
    };
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
  const resUsages = normalizeResources(pipeline.ptr.resources);
  const resBindGroup = mkBindGroup(
    device,
    resources,
    resBindGroupLayout,
    resUsages,
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
  context.configure({
    device: device,
    format: canvasFormat, // presentationFormat
    // TODO(@darzu): support transparency?
    compositingAlphaMode: "opaque",
  });

  resources.canvasTexture?.destroy();
  resources.canvasTexture = device.createTexture({
    size: canvasSize,
    // TODO(@darzu): ANTI-ALIAS
    // sampleCount: antiAliasSampleCount,
    format: canvasFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
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
