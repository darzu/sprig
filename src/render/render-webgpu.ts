import { mat4 } from "../gl-matrix.js";
import { assert } from "../test.js";
import {
  CY,
  CyPipelinePtr,
  CyTexturePtr,
  isRenderPipelinePtr,
} from "./gpu-registry.js";
import { MeshPool } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { Renderer } from "./renderer-ecs.js";
import {
  CyRenderPipeline,
  CyCompPipeline,
  CySingleton,
  CyPipeline,
  isRenderPipeline,
} from "./data-webgpu.js";
import {
  VertexStruct,
  MeshUniformStruct,
  MeshHandleStd,
} from "./pipelines/std-scene.js";
import {
  bundleRenderPipelines,
  createCyResources,
  doCompute,
  onCanvasResizeAll,
  startBundleRenderer,
} from "./instantiator-webgpu.js";
import { SceneStruct, SceneTS } from "./pipelines/std-scene.js";
import { ShaderSet } from "./shader-loader.js";
import { texTypeToBytes } from "./gpu-struct.js";

const MAX_PIPELINES = 64;

export function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext,
  shaders: ShaderSet
): Renderer {
  let renderer: Renderer = {
    drawLines: true,
    drawTris: true,

    addMesh,
    addMeshInstance,
    updateMesh,
    updateScene,
    submitPipelines,
    readTexture,
    stats,
  };

  const timestampQuerySet = device.createQuerySet({
    type: "timestamp",
    count: MAX_PIPELINES + 1, // start of execution + after each pipeline
  });

  const resources = createCyResources(CY, shaders, device);
  const cyKindToNameToRes = resources.kindToNameToRes;

  const pool: MeshPool<
    typeof VertexStruct.desc,
    typeof MeshUniformStruct.desc
  > = cyKindToNameToRes.meshPool["meshPool"]!;

  const sceneUni: CySingleton<typeof SceneStruct.desc> =
    cyKindToNameToRes.singleton["scene"]!;

  // render bundle
  const bundledMIds = new Set<number>();
  let needsRebundle = false;
  let lastWireMode: [boolean, boolean] = [
    renderer.drawLines,
    renderer.drawTris,
  ];
  let lastPipelines: CyPipeline[] = [];

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

  function updateScene(scene: Partial<SceneTS>) {
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      ...scene,
    });
  }

  function submitPipelines(
    handles: MeshHandleStd[],
    pipelinePtrs: CyPipelinePtr[]
  ): void {
    // TODO(@darzu): a lot of the smarts of this fn should come out and be an explicit part
    //  of some pipeline sequencer-timeline-composition-y description thing
    if (!pipelinePtrs.length) {
      console.warn("rendering without any pipelines specified");
      return;
    }

    let renderPipelines: CyRenderPipeline[] = [];
    let computePipelines: CyCompPipeline[] = [];
    let pipelines: CyPipeline[] = [];

    pipelinePtrs.forEach((p) => {
      if (p.kind === "renderPipeline") {
        const res = cyKindToNameToRes.renderPipeline[p.name];
        assert(res, `Resource not initialized: ${p.name}`);
        renderPipelines.push(res);
        pipelines.push(res);
      } else {
        const res = cyKindToNameToRes.compPipeline[p.name];
        assert(res, `Resource not initialized: ${p.name}`);
        computePipelines.push(res);
        pipelines.push(res);
      }
    });

    const didPipelinesChange =
      lastPipelines.length !== pipelinePtrs.length ||
      lastPipelines.reduce(
        (p, n, i) => p || lastPipelines[i].ptr.name !== pipelinePtrs[i].name,
        false as boolean
      );

    const didResize = checkCanvasResize();

    // update all mesh transforms
    for (let m of handles) {
      pool.updateUniform(m);
    }

    // TODO(@darzu): not great detection, needs to be more precise and less
    //    false positives
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
          // TODO(@darzu): BUG. this is currently true too often, maybe every frame
          needsRebundle = true;
          break;
        }
      }
    }

    if (needsRebundle) {
      // console.log("rebundeling");
      updateRenderBundle(handles, renderPipelines);
    }

    lastPipelines = pipelines;

    // start collecting our commands for this frame
    const commandEncoder = device.createCommandEncoder();

    const bundleRenderer = startBundleRenderer(
      context,
      commandEncoder,
      resources
    );

    // run pipelines
    commandEncoder.writeTimestamp(timestampQuerySet, 0);
    let index = 1;
    for (let p of pipelines) {
      if (isRenderPipeline(p)) {
        // render
        bundleRenderer.render(p, cyRenderToBundle[p.ptr.name]);
      } else {
        // compute
        doCompute(device, resources, commandEncoder, p);
      }
      commandEncoder.writeTimestamp(timestampQuerySet, index);
      index++;
      if (index > MAX_PIPELINES) {
        throw `More than ${MAX_PIPELINES} GPU pipelines. Edit MAX_PIPELINES constant`;
      }
    }

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  async function readTexture(ptr: CyTexturePtr): Promise<ArrayBuffer> {
    const tex = cyKindToNameToRes.texture[ptr.name];
    assert(!!tex, "cannot read from uninitialized texture: " + ptr.name);

    const bytesPerVal = texTypeToBytes[tex.format]!;

    const byteSize = tex.size[0] * tex.size[1] * bytesPerVal;
    console.log(`byteSize: ${byteSize}`);

    // TODO(@darzu): re-use buffers! and/or make it a CyBuffer-thing
    const gpuBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      mappedAtCreation: false, // mapped post texture copy
    });

    const commandEncoder = device.createCommandEncoder();

    // TODO(@darzu): shares a lot with CyTexture's queueUpdate
    commandEncoder.copyTextureToBuffer(
      {
        texture: tex.texture,
      },
      {
        buffer: gpuBuffer,
        offset: 0,
        bytesPerRow: tex.size[0] * bytesPerVal, // TODO: alignment?
        rowsPerImage: tex.size[1],
      },
      {
        width: tex.size[0],
        height: tex.size[1],
        // TODO(@darzu): what does this mean?
        depthOrArrayLayers: 1,
      }
    );

    device.queue.submit([commandEncoder.finish()]);

    await gpuBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);

    // TODO(@darzu): support unmapping the array??

    return gpuBuffer.getMappedRange();
  }

  async function stats(): Promise<Map<string, bigint>> {
    const byteSize = (MAX_PIPELINES + 1) * 8;
    // We need to have 2 buffers here because you can't have MAP_READ
    // and QUERY_RESOLVE on the same buffer. We resolve the QuerySet
    // to one buffer, then copy it to another for reading.
    const resolveBuffer = device.createBuffer({
      // GPUSize64s
      size: byteSize,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false, // mapped post texture copy
    });
    const copyBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      mappedAtCreation: false, // mapped post texture copy
    });
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.resolveQuerySet(
      timestampQuerySet,
      0,
      MAX_PIPELINES + 1,
      resolveBuffer,
      0
    );
    commandEncoder.copyBufferToBuffer(
      resolveBuffer,
      0,
      copyBuffer,
      0,
      byteSize
    );
    device.queue.submit([commandEncoder.finish()]);
    await copyBuffer.mapAsync(GPUMapMode.READ, 0, byteSize);

    const times = new BigUint64Array(copyBuffer.getMappedRange());

    const res = new Map();
    let lastTime = times.at(0)!;
    for (let i = 0; i < lastPipelines.length; i++) {
      const t = times.at(i + 1)!;
      res.set(lastPipelines[i].ptr.name, t - lastTime);
      lastTime = t;
    }
    return res;
  }

  return renderer;
}
