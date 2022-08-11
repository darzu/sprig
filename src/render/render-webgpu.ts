import { mat4 } from "../gl-matrix.js";
import { assert } from "../test.js";
import { CY, CyPipelinePtr } from "./gpu-registry.js";
import { MeshPool } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { Renderer } from "./renderer-ecs.js";
import {
  CyRenderPipeline,
  CyCompPipeline,
  CySingleton,
  CyArray,
} from "./data-webgpu.js";
import {
  VertexStruct,
  MeshUniformStruct,
  MeshHandleStd,
  PointLightStruct,
  PointLightTS,
  MAX_POINT_LIGHTS,
} from "./std-scene.js";
import {
  bundleRenderPipelines,
  createCyResources,
  doCompute,
  onCanvasResizeAll,
  renderBundles,
} from "./instantiator-webgpu.js";
import { SceneStruct, SceneTS } from "./std-scene.js";

export function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext
): Renderer {
  let renderer: Renderer = {
    drawLines: true,
    drawTris: true,

    addMesh,
    addMeshInstance,
    updateMesh,
    updateScene,
    renderFrame,
  };

  const resources = createCyResources(CY, device);
  const cyKindToNameToRes = resources.kindToNameToRes;

  const pool: MeshPool<
    typeof VertexStruct.desc,
    typeof MeshUniformStruct.desc
  > = cyKindToNameToRes.meshPool["meshPool"]!;

  const sceneUni: CySingleton<typeof SceneStruct.desc> =
    cyKindToNameToRes.singleton["scene"]!;

  const pointLightsArray: CyArray<typeof PointLightStruct.desc> =
    cyKindToNameToRes.array["pointLight"]!;

  // render bundle
  const bundledMIds = new Set<number>();
  let needsRebundle = false;
  let lastWireMode: [boolean, boolean] = [
    renderer.drawLines,
    renderer.drawTris,
  ];
  let lastPipelines: CyPipelinePtr[] = [];

  const cyRenderToBundle: { [pipelineName: string]: GPURenderBundle } = {};

  updateRenderBundle([], []);

  // recomputes textures, widths, and aspect ratio on canvas resize
  let lastWidth = 0;
  let lastHeight = 0;

  function checkCanvasResize(): boolean {
    const newWidth = canvas.width;
    const newHeight = canvas.height;
    if (lastWidth === newWidth && lastHeight === newHeight) return false;

    onCanvasResizeAll(device, context, resources, [newWidth, newHeight]);

    lastWidth = newWidth;
    lastHeight = newHeight;

    return true;
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

  function updateRenderBundle(
    handles: MeshHandleStd[],
    pipelines: CyRenderPipeline[]
  ) {
    needsRebundle = false; // TODO(@darzu): hack?

    bundledMIds.clear();
    handles.forEach((h) => bundledMIds.add(h.mId));

    lastWireMode = [renderer.drawLines, renderer.drawTris];

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

  function updateScene(scene: Partial<SceneTS>, pointLights: PointLightTS[]) {
    assert(
      pointLights.length < MAX_POINT_LIGHTS,
      `Too many point lights ${pointLights.length}`
    );
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      ...scene,
      pointLights: pointLights.length,
    });
    pointLightsArray.queueUpdates(pointLights, 0);
  }

  function renderFrame(
    handles: MeshHandleStd[],
    pipelines: CyPipelinePtr[]
  ): void {
    if (!pipelines.length) {
      console.warn("rendering without any pipelines specified");
      return;
    }

    let renderPipelines: CyRenderPipeline[] = [];
    let computePipelines: CyCompPipeline[] = [];

    pipelines.forEach((p) => {
      if (p.kind === "renderPipeline") {
        const res = cyKindToNameToRes.renderPipeline[p.name];
        assert(res, `Resource not initialized: ${p.name}`);
        renderPipelines.push(res);
      } else {
        const res = cyKindToNameToRes.compPipeline[p.name];
        assert(res, `Resource not initialized: ${p.name}`);
        computePipelines.push(res);
      }
    });

    const didPipelinesChange =
      lastPipelines.length !== pipelines.length ||
      lastPipelines.reduce(
        (p, n, i) => p || lastPipelines[i].name !== pipelines[i].name,
        false as boolean
      );

    const didResize = checkCanvasResize();

    // update all mesh transforms
    for (let m of handles) {
      pool.updateUniform(m);
    }

    // TODO(@darzu): more fine grain
    needsRebundle =
      needsRebundle ||
      didPipelinesChange ||
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
      updateRenderBundle(handles, renderPipelines);
    }

    // start collecting our render commands for this frame
    const commandEncoder = device.createCommandEncoder();

    // run compute shaders
    for (let p of computePipelines) {
      doCompute(device, resources, commandEncoder, p);
    }

    // render
    renderBundles(
      context,
      commandEncoder,
      resources,
      renderPipelines.map((p) => [p, cyRenderToBundle[p.ptr.name]])
    );

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  return renderer;
}
