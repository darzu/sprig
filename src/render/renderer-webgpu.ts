import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util.js";
import {
  CY,
  CyMeshPoolPtr,
  CyPipelinePtr,
  CyResourcePtr,
  CyTexturePtr,
  isRenderPipelinePtr,
  PtrKind,
} from "./gpu-registry.js";
import { MeshHandle, MeshPool } from "./mesh-pool.js";
import { Mesh } from "../meshes/mesh.js";
import { Renderer } from "./renderer-ecs.js";
import {
  CyRenderPipeline,
  CyCompPipeline,
  CySingleton,
  CyPipeline,
  isRenderPipeline,
  CyArray,
  PtrKindToResourceType,
} from "./data-webgpu.js";
import {
  VertexStruct,
  MeshUniformStruct,
  meshPoolPtr,
  sceneBufPtr,
  MeshUniformTS,
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
import { CyStructDesc, texTypeToBytes } from "./gpu-struct.js";
import { align } from "../utils/math.js";
import { pointLightsPtr, PointLightStruct, PointLightTS } from "./lights.js";
import {
  gerstnerWavesPtr,
  GerstnerWaveStruct,
  GerstnerWaveTS,
  OceanMeshHandle,
  oceanPoolPtr,
  OceanUniStruct,
  OceanUniTS,
  OceanVertStruct,
} from "./pipelines/std-ocean.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";
import { PERF_DBG_GPU, VERBOSE_LOG } from "../flags.js";
import { dbgLogOnce } from "../utils/util.js";
import {
  GrassVertStruct,
  GrassUniStruct,
  grassPoolPtr,
} from "../grass/std-grass.js";

// TODO(@darzu): Try using drawIndirect !!
//    https://gpuweb.github.io/gpuweb/#dom-gpurendercommandsmixin-drawindirect

// TODO(@darzu): We should use:
// "navigator.gpu.requestAdapter().then(a => console.log([...a.features]))"
// to test for features on hardware we want to support

const MAX_PIPELINES = 64;

export function createRenderer(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext,
  shaders: ShaderSet
) {
  const timestampQuerySet = device.features.has("timestamp-query")
    ? device.createQuerySet({
        label: `sprigTimestampQuerySet`,
        type: "timestamp",
        count: MAX_PIPELINES + 1, // start of execution + after each pipeline
      })
    : null;
  if (VERBOSE_LOG) console.log(`timestamp-query: ${!!timestampQuerySet}`);

  const resources = createCyResources(CY, shaders, device);
  const cyKindToNameToRes = resources.kindToNameToRes;

  const stdPool = getCyResource(meshPoolPtr)!;
  // const oceanPool: MeshPool<
  //   typeof OceanVertStruct.desc,
  //   typeof OceanUniStruct.desc
  // > = cyKindToNameToRes.meshPool[oceanPoolPtr.name]!;
  // const grassPool: MeshPool<
  //   typeof GrassVertStruct.desc,
  //   typeof GrassUniStruct.desc
  // > = cyKindToNameToRes.meshPool[grassPoolPtr.name]!;

  const renderer = {
    drawLines: true,
    drawTris: true,

    highGraphics: false,

    // std mesh
    // addMeshInstance,
    // TODO(@darzu): need sub-mesh updateMesh variant (e.g. coloring a few quads)
    // updateMeshVertices,
    // updateMeshIndices,

    // ocean
    // addOcean,
    // updateOcean,
    updateGerstnerWaves,

    // std scene
    updateScene,
    updatePointLights,

    // uniforms
    // updateStdUniform,
    // updateOceanUniform,

    // gpu commands
    submitPipelines,
    readTexture,
    // TODO(@darzu): maybe have a "typed library" thingy where u can
    //  declare: i want my registery to have these things and u get
    //  strong typings just like as if they were dumped right here
    //  (like the pools used to be)
    getCyResource,
    stats,

    // debug
    getMeshPoolStats,

    // TODO(@darzu): collapose the renderer-webgpu layer, it shouldn't exist
    stdPool,
    // oceanPool,
    // grassPool,
  };

  // TODO(@darzu): collapse this with MeshPool._stats
  function getMeshPoolStats() {
    const stats = {
      numTris: 0,
      numVerts: 0,
    };
    for (let p of Object.values(cyKindToNameToRes.meshPool)) {
      stats.numTris += p.sets.reduce((p, n) => p + n.numTris, 0);
      stats.numVerts += p.sets.reduce((p, n) => p + n.numVerts, 0);
    }
    return stats;
  }

  const sceneUni: CySingleton<typeof SceneStruct.desc> =
    cyKindToNameToRes.singleton[sceneBufPtr.name]!;

  const pointLightsArray: CyArray<typeof PointLightStruct.desc> =
    cyKindToNameToRes.array[pointLightsPtr.name]!;

  const gerstnerWavesArray: CyArray<typeof GerstnerWaveStruct.desc> =
    cyKindToNameToRes.array[gerstnerWavesPtr.name]!;

  // render bundle
  const bundledMIds = new Set<number>();
  const bundledMIdToVertIdx = new Map<number, number>();
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

  function updateRenderBundle(
    handles: MeshHandle[],
    pipelines: CyRenderPipeline[]
  ) {
    // TODO(@darzu): handle ocean
    needsRebundle = false; // TODO(@darzu): hack?

    bundledMIds.clear();
    handles.forEach((h) => {
      bundledMIds.add(h.mId);
      bundledMIdToVertIdx.set(h.mId, h.vertIdx);
    });

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
    if (PERF_DBG_GPU) {
      dbgLogOnce("sceneUniSize", `SceneUni size: ${sceneUni.struct.size}`);
    }
    sceneUni.queueUpdate({
      ...sceneUni.lastData!,
      ...scene,
    });
  }

  function updatePointLights(pointLights: PointLightTS[]) {
    pointLightsArray.queueUpdates(pointLights, 0, 0, pointLights.length);
  }

  function updateGerstnerWaves(gerstnerWaves: GerstnerWaveTS[]) {
    gerstnerWavesArray.queueUpdates(gerstnerWaves, 0, 0, gerstnerWaves.length);
  }

  // TODO(@darzu): support ocean!
  function submitPipelines(
    handles: MeshHandle[],
    pipelinePtrs: CyPipelinePtr[]
  ): void {
    // TODO(@darzu): a lot of the smarts of this fn should come out and be an explicit part
    //  of some pipeline sequencer-timeline-composition-y description thing
    if (VERBOSE_LOG && !pipelinePtrs.length) {
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

    // // update all mesh transforms
    // for (let m of handles) {
    //   stdPool.updateUniform(m);
    // }

    // // update all ocean mesh transforms
    // for (let m of oceanHandles) {
    //   oceanPool.updateUniform(m);
    // }

    // TODO(@darzu): not great detection, needs to be more precise and less
    //    false positives
    // TODO(@darzu): account for handle masks
    needsRebundle =
      needsRebundle ||
      didPipelinesChange ||
      didResize ||
      bundledMIds.size !== handles.length ||
      renderer.drawLines !== lastWireMode[0] ||
      renderer.drawTris !== lastWireMode[1];
    if (!needsRebundle) {
      for (let h of handles) {
        if (!bundledMIds.has(h.mId)) {
          // TODO(@darzu): BUG. this is currently true too often, maybe every frame
          needsRebundle = true;
          break;
        }
        // TODO(@darzu): PERF. perf cost of this check? Maybe we should just use dirty flags..
        if (bundledMIdToVertIdx.get(h.mId) !== h.vertIdx) {
          needsRebundle = true;
          break;
        }
      }
    }

    if (needsRebundle) {
      if (PERF_DBG_GPU) console.log("rebundeling");
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
    if (timestampQuerySet) commandEncoder.writeTimestamp(timestampQuerySet, 0);
    let index = 1;
    for (let p of pipelines) {
      if (isRenderPipeline(p)) {
        // render
        bundleRenderer.render(p, cyRenderToBundle[p.ptr.name]);
      } else {
        // compute
        doCompute(device, resources, commandEncoder, p);
      }
      if (timestampQuerySet)
        commandEncoder.writeTimestamp(timestampQuerySet, index);
      index++;
      if (index > MAX_PIPELINES) {
        throw `More than ${MAX_PIPELINES} GPU pipelines. Edit MAX_PIPELINES constant`;
      }
    }

    // submit render passes to GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  function getCyResource<V extends CyStructDesc, U extends CyStructDesc>(
    ptr: CyMeshPoolPtr<V, U>
  ): MeshPool<V, U> | undefined;
  function getCyResource<K extends PtrKind>(
    ptr: CyResourcePtr<K>
  ): PtrKindToResourceType[K] | undefined;
  function getCyResource<K extends PtrKind>(
    ptr: CyResourcePtr<K>
  ): PtrKindToResourceType[K] | undefined {
    return cyKindToNameToRes[ptr.kind][ptr.name];
  }

  async function readTexture(ptr: CyTexturePtr): Promise<ArrayBuffer> {
    const tex = cyKindToNameToRes.texture[ptr.name];
    assert(!!tex, "cannot read from uninitialized texture: " + ptr.name);

    const bytesPerVal = texTypeToBytes[tex.format]!;

    const byteSize = tex.size[0] * tex.size[1] * bytesPerVal;
    // console.log(`byteSize: ${byteSize}`);

    // TODO(@darzu): re-use buffers! and/or make it a CyBuffer-thing
    const gpuBuffer = device.createBuffer({
      label: `sprigReadTexBuf`,
      size: byteSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      mappedAtCreation: false, // mapped post texture copy
    });

    const commandEncoder = device.createCommandEncoder();

    // TODO(@darzu): shares a lot with CyTexture's queueUpdate
    // TODO(@darzu): ERROR: bytesPerRow (64) is not a multiple of 256.
    // TODO(@darzu): need to align up to 256 but then also account for this in the
    //                CPU sampler?
    /*
    Required size for texture data layout (16192) 
    exceeds the linear data size (4096) with offset (0).
    - While encoding [CommandEncoder].CopyTextureToBuffer([Texture], [Buffer], 
        [Extent3D width:64, height:64, depthOrArrayLayers:1]).
    */
    // bytesPerRow: align(tex.size[0] * bytesPerVal, 256), // TODO: alignment?
    const bytesPerRow = tex.size[0] * bytesPerVal;
    if (bytesPerRow % 256 !== 0) {
      console.warn(`texture alignment issues for: ${tex.ptr.name}`);
    }
    commandEncoder.copyTextureToBuffer(
      {
        texture: tex.texture,
      },
      {
        buffer: gpuBuffer,
        offset: 0,
        bytesPerRow,
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

  const byteSize = (MAX_PIPELINES + 1) * 8;
  // We need to have 2 buffers here because you can't have MAP_READ
  // and QUERY_RESOLVE on the same buffer. We resolve the QuerySet
  // to one buffer, then copy it to another for reading.
  const resolveBuffer = device.createBuffer({
    label: `sprig_timestampQuerySet_resolveBuf`,
    // GPUSize64s
    size: byteSize,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: false, // mapped post texture copy
  });
  async function stats(): Promise<Map<string, bigint>> {
    if (!timestampQuerySet) return new Map();

    // console.log("getting stats!");

    const copyBuffer = device.createBuffer({
      label: `sprig_timestampQuerySet_copyBuf`,
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
