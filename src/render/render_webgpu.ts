import { mat4 } from "../gl-matrix.js";
import { assert } from "../test.js";
import { never } from "../util.js";
import {
  CyRndrPipelinePtr,
  CyGlobalUsage,
  CyGlobal,
  CyManyBufferPtr,
  CY,
  CyCompPipelinePtr,
} from "./gpu-registry.js";
import { MeshPool } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { Renderer } from "./renderer.js";
import {
  CyRndrPipeline,
  CyCompPipeline,
  CyOne,
  CyTexture,
} from "./gpu-data-webgpu.js";
import {
  VertexStruct,
  MeshUniformStruct,
  SceneStruct,
  MeshHandleStd,
  renderTriPipelineDesc,
} from "./std-pipeline.js";
import {
  cmpClothPipelinePtr0,
  cmpClothPipelinePtr1,
} from "./xp-cloth-pipeline.js";
import {
  compRopePipelinePtr,
  renderRopePipelineDesc,
} from "./xp-ropestick-pipeline.js";
import {
  boidCanvasMerge,
  boidComp0,
  boidComp1,
  boidRender,
} from "./xp-boids-pipeline.js";
import {
  bundleRenderPipelines,
  createCyResources,
  mkBindGroup,
  normalizeResources,
} from "./instantiator-webgpu.js";

export function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext
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

  let canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  const resources = createCyResources(CY, device);
  const cyKindToNameToRes = resources.kindToNameToRes;

  // TODO(@darzu): pass in elsewhere?
  const pool: MeshPool<
    typeof VertexStruct.desc,
    typeof MeshUniformStruct.desc
  > = cyKindToNameToRes.meshPool["meshPool"]!;

  // TODO(@darzu): hacky grab
  let sceneUni: CyOne<typeof SceneStruct.desc> =
    cyKindToNameToRes.oneBuffer["scene"]!;

  // render bundle
  let bundledMIds = new Set<number>();
  let needsRebundle = false;
  let lastWireMode: [boolean, boolean] = [
    renderer.drawLines,
    renderer.drawTris,
  ];

  let renderPipelinesPtrs: CyRndrPipelinePtr[] = [
    renderTriPipelineDesc,
    renderRopePipelineDesc,
    boidRender,
    boidCanvasMerge,
  ];
  let computePipelinesPtrs: CyCompPipelinePtr[] = [
    cmpClothPipelinePtr0,
    cmpClothPipelinePtr1,
    compRopePipelinePtr,
    boidComp0,
    boidComp1,
  ];

  function renderPipelines(): CyRndrPipeline[] {
    return renderPipelinesPtrs.map((p) => {
      const res = cyKindToNameToRes.renderPipeline[p.name];
      assert(res, `Resource not initialized: ${p.name}`);
      return res;
    });
  }
  function computePipelines(): CyCompPipeline[] {
    return computePipelinesPtrs.map((p) => {
      const res = cyKindToNameToRes.compPipeline[p.name];
      assert(res, `Resource not initialized: ${p.name}`);
      return res;
    });
  }

  // TODO(@darzu): IMPL
  const cyRenderToBundle: { [pipelineName: string]: GPURenderBundle } = {};

  // let renderBundle: GPURenderBundle;
  updateRenderBundle([]);

  // recomputes textures, widths, and aspect ratio on canvas resize
  let canvasTexture: GPUTexture | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  function checkCanvasResize(): boolean {
    const newWidth = canvas.width;
    const newHeight = canvas.height;
    if (lastWidth === newWidth && lastHeight === newHeight) return false;

    const newSize = [newWidth, newHeight] as const;

    context.configure({
      device: device,
      format: canvasFormat, // presentationFormat
      // TODO(@darzu): support transparency?
      compositingAlphaMode: "opaque",
    });

    canvasTexture?.destroy();
    canvasTexture = device.createTexture({
      size: newSize,
      // TODO(@darzu): ANTI-ALIAS
      // sampleCount: antiAliasSampleCount,
      format: canvasFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    for (let tex of [
      ...Object.values(cyKindToNameToRes.texture),
      ...Object.values(cyKindToNameToRes.depthTexture),
    ]) {
      if (tex.ptr.onCanvasResize) {
        const newSize = tex.ptr.onCanvasResize(newWidth, newHeight);
        tex.resize(newSize[0], newSize[1]);
      }
    }

    lastWidth = newWidth;
    lastHeight = newHeight;

    return true;
  }

  function textureAttachment(tex: CyTexture): GPURenderPassColorAttachment {
    // TODO(@darzu): parameterizable?
    return {
      view: tex.texture.createView(),
      // loadOp: "load",
      // TODO(@darzu): handle load vs clear
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

  function canvasAttachment(clear?: boolean): GPURenderPassColorAttachment {
    return {
      // TODO(@darzu): ANTI-ALIAS; for some reason this is tangled in AA?
      // view: canvasTextureView!,
      // resolveTarget: context.getCurrentTexture().createView(),
      view: context.getCurrentTexture().createView(),
      // TODO(@darzu): is this how we want to handle load vs clear?
      loadOp: clear ? "clear" : "load",
      clearValue: {
        r: renderer.backgroundColor[0],
        g: renderer.backgroundColor[1],
        b: renderer.backgroundColor[2],
        a: 1,
      },
      storeOp: "store",
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

    const pipelines = renderPipelines();
    const renderBundles = bundleRenderPipelines(
      device,
      resources,
      pipelines,
      bundledMIds
    );
    for (let i = 0; i < pipelines.length; i++) {
      cyRenderToBundle[pipelines[i].ptr.name] = renderBundles[i];
    }
  }

  function renderFrame(viewProj: mat4, handles: MeshHandleStd[]): void {
    const didResize = checkCanvasResize();

    // update scene data
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      time: 1000 / 60,
      cameraViewProjMatrix: viewProj,
    });

    // update all mesh transforms
    for (let m of handles) {
      pool.updateUniform(m);
    }

    // TODO(@darzu): more fine grain
    needsRebundle =
      needsRebundle ||
      didResize ||
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

    // run compute shaders
    for (let p of computePipelines()) {
      const compPassEncoder = commandEncoder.beginComputePass();
      compPassEncoder.setPipeline(p.pipeline);

      // TODO(@darzu): de-dupe?
      const resBindGroupLayout = p.bindGroupLayout;
      const resUsages = normalizeResources(p.ptr.resources);
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
        ...(p.ptr.workgroupCounts ?? [1, 1, 1])
      );
      compPassEncoder.end();
    }

    // TODO(@darzu): support multi-output
    function isOutputEq(a: CyRndrPipelinePtr, b: CyRndrPipelinePtr) {
      return (
        a.output.name === b.output.name &&
        a.depthStencil.name === b.depthStencil.name
      );
    }

    // render bundles
    // TODO(@darzu): ordering needs to be set by outside config
    // TODO(@darzu): same attachments need to be shared
    let lastPipeline: CyRndrPipelinePtr | undefined;
    let renderPassEncoder: GPURenderPassEncoder | undefined;
    for (let p of renderPipelines()) {
      // console.log(`rendering ${p.ptr.name}`);
      const bundle = cyRenderToBundle[p.ptr.name];

      if (
        !renderPassEncoder ||
        !lastPipeline ||
        !isOutputEq(lastPipeline, p.ptr)
      ) {
        let colorAttachments: GPURenderPassColorAttachment[] = [
          p.ptr.output,
        ].map((o) => {
          const isFirst = !lastPipeline;
          const doClear = isFirst;
          if (o.kind === "canvasTexture") return canvasAttachment(doClear);
          else if (o.kind === "texture") {
            let tex = cyKindToNameToRes.texture[o.name]!;
            return textureAttachment(tex);
          } else {
            never(o, "TO IMPL");
          }
        });
        const depthTex =
          cyKindToNameToRes.depthTexture[p.ptr.depthStencil.name];
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

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  return renderer;
}
