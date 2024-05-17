import { Entity, EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { CameraDef, CameraComputedDef } from "../camera/camera.js";
import { V3, quat, mat4 } from "../matrix/sprig-matrix.js";
import {
  Frame,
  TransformDef,
  PhysicsParentDef,
  updateFrameFromTransform,
  updateFrameFromPosRotScale,
  copyFrame,
  createFrame,
} from "../physics/transform.js";
import {
  MotionSmoothingDef,
  PrevSmoothedWorldFrameDef,
  SmoothedWorldFrameDef,
} from "./motion-smoothing.js";
import { DeadDef, DeletedDef } from "../ecs/delete.js";
import { canvasFormat, meshPoolPtr } from "./pipelines/std-scene.js";
import { CanvasDef } from "./canvas.js";
import { createRenderer } from "./renderer-webgpu.js";
import { CyMeshPoolPtr, CyPipelinePtr } from "./gpu-registry.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { isMeshHandle, MeshHandle, MeshReserve } from "./mesh-pool.js";
import { isRigged, Mesh, RiggedMesh, Rigging } from "../meshes/mesh.js";
import {
  frustumFromBounds,
  getFrustumWorldCorners,
} from "../utils/utils-3d.js";
import { ShadersDef, ShaderSet } from "./shader-loader.js";
import { dbgLogMilestone, dbgLogOnce, dbgOnce } from "../utils/util.js";
import { TimeDef } from "../time/time.js";
import { PartyDef } from "../camera/party.js";
import { PointLightDef } from "./lights.js";
import { assert } from "../utils/util.js";
import {
  DONT_SMOOTH_WORLD_FRAME,
  LOG_WEBGPU_AVAILABLE_FEATURES,
  PERF_DBG_GPU,
  VERBOSE_LOG,
} from "../flags.js";
import { clampToAABB } from "../physics/aabb.js";
import {
  createRiggedMeshPool,
  RiggedMeshHandle,
  RiggedMeshPool,
} from "./pipelines/std-rigged.js";
import { Phase } from "../ecs/sys-phase.js";
// TODO(@darzu): is it okay for renderer to depend on XY ? XY depends on Renderer
import { MeshReg, XY, isMeshReg } from "../meshes/mesh-loader.js";
import { CyStructDesc, CyToTS, createStruct } from "./gpu-struct.js";

// TODO(@darzu): the double "Renderer" naming is confusing. Maybe one should be GPUManager or something?
export const RendererDef = EM.defineResource(
  "renderer",
  (renderer: Renderer, pipelines: CyPipelinePtr[]) => {
    return {
      renderer,
      // TODO(@darzu): ABSTRACTION. could the pipeline scheduling be handled like init scheduleing? provides, requires, lazy, eager ?
      pipelines,
    };
  }
);

export type MeshLike = Mesh | MeshHandle | MeshReg;

// TODO(@darzu): we need a better way to handle arbitrary pools
// TODO(@darzu): support height map?
// export type PoolKind = "std" | "ocean" | "grass";
// TODO(@darzu): we need a better way to do construct!
/*
say which pool
there's a pool -> uni params type mapping
*/
export interface RenderableConstruct {
  readonly enabled: boolean;
  // readonly sortLayer: number;
  // TODO(@darzu): mask is inconsitently placed; here it is in the component,
  //  later it is in the mesh handle.
  readonly mask?: number;
  readonly pool: CyMeshPoolPtr<any, any>;
  // TODO(@darzu): little hacky: hidden vs enabled?
  // NOTE:
  //   "enabled" objects are debundled and not sent to the GPU.
  //   "hidden" objects are sent to the GPU w/ scale 0 (so they don't appear).
  //   hidden objects might be more efficient in object pools b/c it causes
  //   less rebundling, but this needs measurement.
  readonly hidden: boolean;
  meshOrProto: MeshLike;
  readonly reserve?: MeshReserve;
  readonly idOverride?: number;
}

// TODO(@darzu): UNI: leverage createStructFromPartial

// TODO(@darzu): UNI: Take uniform as optional parameter
// TODO(@darzu): UNI: duplicate, create a struct-y version, deprecate this one
export const RenderableConstructDef = EM.defineNonupdatableComponent(
  "renderableConstruct",
  // TODO(@darzu): generic components don't work..
  // <U extends CyStructDesc>
  (
    // TODO(@darzu): this constructor is too messy, we should use a params obj instead
    meshOrProto: MeshLike,
    enabled: boolean = true,
    sortLayer: number = 0, // TODO(@darzu): UNUSED. remove?
    mask?: number,
    pool?: CyMeshPoolPtr<any, any>,
    hidden: boolean = false,
    reserve?: MeshReserve,
    idOverride?: number
  ) => {
    const r: RenderableConstruct = {
      enabled,
      // sortLayer: sortLayer,
      meshOrProto,
      mask,
      pool: pool ?? meshPoolPtr,
      hidden,
      reserve,
      idOverride,
    };
    return r;
  },
  { multiArg: true }
);

// TODO(@darzu): new renderable construct: (should do this as a seperate PR)
/*
MeshDef:
  enabled,
  hidden,
  pool,
  reserve,
  idOverride,
  meshLike,
  mask,
  partialUni
MeshHandle as promise?
componentPack ?
  "sprite": color, position, rotation, worldFrame, renderable

Name: DrawDef, MeshDef, 
*/

export const RiggedRenderableConstructDef = EM.defineNonupdatableComponent(
  "riggedRenderableConstruct",
  // TODO: consider including other RenderableConstruct fields here
  (mesh: RiggedMesh) => ({
    mesh,
  })
);

export interface Renderable {
  // TODO(@darzu): clean up these options...
  enabled: boolean;
  hidden: boolean;
  // sortLayer: number;
  meshHandle: MeshHandle;
}

export const RenderableDef = EM.defineNonupdatableComponent(
  "renderable",
  (r: Renderable) => r
);

// TODO: standardize names more

// export const RenderDataStdDef = EM.defineComponent(
//   "renderDataStd",
//   (r: MeshUniformTS) => r
// );

export const RendererWorldFrameDef = EM.defineComponent(
  "rendererWorldFrame",
  () => createFrame()
);

// TODO(@darzu): We need to add constraints for updateRendererWorldFrames and such w/ respect to gameplay, physics, and rendering!

// export const poolKindToDataDef = {
//   std: RenderDataStdDef,
//   ocean: RenderDataOceanDef,
//   grass: RenderDataGrassDef,
// };
// type Assert_PoolKindToDataDef = typeof poolKindToDataDef[PoolKind];

// export const poolKindToDataUpdate: {
//   [k in PoolKind]: (
//     o: EntityW<
//       [
//         typeof RenderableDef,
//         typeof poolKindToDataDef[k],
//         typeof RendererWorldFrameDef
//       ]
//     >
//   ) => boolean;
// } = {
//   std: updateStdRenderData,
//   ocean: updateOceanRenderData,
//   grass: updateGrassRenderData,
// };

EM.addEagerInit([RenderableConstructDef], [RendererDef], [], () => {
  EM.addSystem(
    "constructRenderables",
    Phase.PRE_GAME_WORLD,
    [RenderableConstructDef],
    [RendererDef],
    (es, res) => {
      for (let e of es) {
        // TODO(@darzu): this seems somewhat inefficient to look for this every frame
        if (!RenderableDef.isOn(e)) {
          let meshHandle: MeshHandle;
          let mesh: Mesh;
          const pool = res.renderer.renderer.getCyResource(
            e.renderableConstruct.pool
          );
          assert(pool);
          const meshOrProto = e.renderableConstruct.meshOrProto;
          if (isMeshHandle(meshOrProto)) {
            // TODO(@darzu): renderableConstruct is getting to large and wierd
            assert(
              !e.renderableConstruct.reserve,
              `cannot have a reserve when adding an instance`
            );
            assert(
              meshOrProto.pool === pool,
              `Trying to add a mesh instance into pool "${pool.ptr.name}" based on a mesh from pool "${meshOrProto.pool.ptr.name}"`
            );
            meshHandle = pool.addMeshInstance(meshOrProto);
            mesh = meshHandle.mesh!;
          } else if (isMeshReg(meshOrProto)) {
            const gameMesh = meshOrProto.gameMeshNow();
            if (!gameMesh) {
              XY._ensureLoadingMesh(meshOrProto.desc);
              continue; // TODO(@darzu): PERF. Okay to delay like this? Shouldn't cost anything when it is loaded.
            }
            assert(
              !e.renderableConstruct.reserve,
              `cannot have a reserve when adding an instance`
            );
            assert(
              gameMesh.proto.pool === pool,
              `Trying to add a mesh instance into pool "${pool.ptr.name}" based on a mesh from pool "${gameMesh.proto.pool.ptr.name}"`
            );
            meshHandle = pool.addMeshInstance(gameMesh.proto);
            mesh = meshHandle.mesh!;
          } else {
            meshHandle = pool.addMesh(
              meshOrProto,
              e.renderableConstruct.reserve
            );
            mesh = meshOrProto;
          }
          if (e.renderableConstruct.mask) {
            meshHandle.mask = e.renderableConstruct.mask;
          }

          EM.set(e, RenderableDef, {
            enabled: e.renderableConstruct.enabled,
            hidden: false,
            // sortLayer: e.renderableConstruct.sortLayer,
            meshHandle,
          });

          // TODO(@darzu): UNI:
          // TODO(@darzu): HACK! We need some notion of required uni data maybe? Or common uni data
          // TODO(@darzu): Hmmm maybe reserve the first ~100 object IDs for custom stuff like water, terrain, etc ?
          // pool.updateUniform
          // TODO(@darzu): duplicate! createUniform is called inside of addMesh too..
          // TODO(@darzu): UNI:
          if (!pool.ptr.dataDef.isOn(e)) {
            const uni = pool.ptr.unisStruct.create();
            EM.set(e, pool.ptr.dataDef, uni);
            if ("id" in e[pool.ptr.dataDef.name]) {
              e[pool.ptr.dataDef.name]["id"] =
                e.renderableConstruct.idOverride ?? meshHandle.mId;
              // console.log(
              //   `setting "${mesh.dbgName}" ${e.id}.${
              //     pool.ptr.dataDef.name
              //   }.id = ${e[pool.ptr.dataDef.name]["id"]}`
              // );
            }
          }
        }
      }
    }
  );

  // NOTE: we use "renderListDeadHidden" and "renderList" to construct a custom
  //  query of renderable objects that include dead, hidden objects. The reason
  //  for this is that it causes a more stable entity list when we have object
  //  pools, and thus we have to rebundle less often.
  // TODO(@darzu): I'd love a better way to do this
  const renderObjs: EntityW<
    [typeof RendererWorldFrameDef, typeof RenderableDef]
  >[] = [];
  EM.addSystem(
    "renderListDeadHidden",
    Phase.RENDER_DRAW,
    [RendererWorldFrameDef, RenderableDef, DeadDef],
    [],
    (objs, _) => {
      for (let o of objs)
        if (o.renderable.enabled && o.renderable.hidden && !DeletedDef.isOn(o))
          renderObjs.push(o);
    }
  );
  EM.addSystem(
    "renderList",
    Phase.RENDER_DRAW,
    [RendererWorldFrameDef, RenderableDef],
    [],
    (objs, _) => {
      for (let o of objs)
        if (o.renderable.enabled && !DeletedDef.isOn(o)) renderObjs.push(o);
    }
  );

  let __frame = 1; // TODO(@darzu): DBG

  EM.addSystem(
    "renderDrawSubmitToGPU",
    Phase.RENDER_DRAW,
    null, // NOTE: see "renderList*" systems and NOTE above. We use those to construct our query.
    [CameraDef, CameraComputedDef, RendererDef, TimeDef, PartyDef],
    (_, res) => {
      __frame++; // TODO(@darzu): DBG

      const renderer = res.renderer.renderer;
      const cameraComputed = res.cameraComputed;

      // TODO(@darzu): this is currently unused, and maybe should be dropped.
      // sort
      // objs.sort((a, b) => b.renderable.sortLayer - a.renderable.sortLayer);

      // render
      // TODO(@darzu):
      // const m24 = objs.filter((o) => o.renderable.meshHandle.mId === 24);
      // const e10003 = objs.filter((o) => o.id === 10003);
      // console.log(`mId 24: ${!!m24.length}, e10003: ${!!e10003.length}`);

      // update position
      const pointLights = EM.filterEntities_uncached([
        PointLightDef,
        WorldFrameDef,
      ]).map((e) => {
        V3.copy(e.pointLight.position, e.world.position);
        return e.pointLight;
      });

      const NUM_CASCADES = 2;
      // TODO(@darzu): move point light and casading shadow map code to its own system
      // TODO(@darzu): move this into CameraView?
      // TODO(@darzu): CSM: support multiple slices
      // TODO(@darzu): support non-ortho shadows for point lights!
      if (cameraComputed.shadowCascadeMats.length)
        for (let e of pointLights) {
          mat4.copy(e.viewProjAll, cameraComputed.viewProj);
          // console.dir(e.viewProjAll);
          for (let i = 0; i < NUM_CASCADES; i++) {
            const cascade = cameraComputed.shadowCascadeMats[i];
            const visibleWorldCorners = getFrustumWorldCorners(
              // cameraComputed.invViewProjMat
              cascade.invViewProj
              // cameraComputed.shadowCascadeMats[0].invViewProj
            );
            // TODO(@darzu): we probably want the actual world frustum to be clamped by this max as well
            visibleWorldCorners.forEach((v) =>
              clampToAABB(v, res.camera.maxWorldAABB, v)
            );
            // if (__frame % 100 === 0) {
            //   console.log(visibleWorldCorners.map((c) => vec3Dbg(c)).join(","));
            // }

            // TODO(@darzu): HACKY ifs. why not arrays?
            // console.log(`cascade ${i}, farZ: ${cascade.farZ}`);
            if (i === 0) e.depth0 = cascade.farZ;
            else if (i === 1) e.depth1 = cascade.farZ;
            else assert(false);

            let viewProj: mat4;
            if (i === 0) viewProj = e.viewProj0;
            else if (i === 1) viewProj = e.viewProj1;
            else assert(false);

            // TODO(@darzu): need to quantize this right so that we don't get
            //   jitter on shadow edges when panning the camera
            frustumFromBounds(visibleWorldCorners, e.position, viewProj);

            // NOTE: this old way of calculating the light's viewProj was pretty broken for non-directional
            // positionAndTargetToOrthoViewProjMatrix(
            //   e.pointLight.viewProj,
            //   lightPos,
            //   V(0, 0, 0)
            // );
          }
        }

      // const lightPosition =
      //   pointLights[0]?.position ?? V(0, 0, 0);

      // TODO(@darzu): this maxSurfaceId calculation is super inefficient, we need
      //  to move this out of this loop.
      let maxSurfaceId = 1000;
      // let maxSurfaceId = max(
      //   objs
      //     .map((o) => o.renderable.meshHandle.readonlyMesh?.GF ?? [0])
      //     .reduce((p, n) => [...p, ...n], [])
      // );
      // TODO(@darzu): DBG
      // maxSurfaceId = 12;
      // console.log(`maxSurfaceId: ${maxSurfaceId}`);
      // console.log(
      //   `res.renderer.renderer.highGraphics: ${res.renderer.renderer.highGraphics}`
      // );

      renderer.updateScene({
        cameraViewProjMatrix: cameraComputed.viewProj,
        //lightViewProjMatrix,
        time: res.time.time,
        dt: res.time.dt,
        canvasAspectRatio: res.cameraComputed.aspectRatio,
        maxSurfaceId,
        partyPos: res.party.pos,
        partyDir: res.party.dir,
        cameraPos: cameraComputed.location,
        numPointLights: pointLights.length,
        highGraphics: res.renderer.renderer.highGraphics ? 1 : 0,
      });
      // console.log(`pointLights.length: ${pointLights.length}`);

      renderer.updatePointLights(pointLights);

      // TODO(@darzu): dbg
      // console.log(`pipelines: ${res.renderer.pipelines.map((p) => p.name)}`);
      renderer.submitPipelines(
        renderObjs.map((o) => o.renderable.meshHandle),
        res.renderer.pipelines
      );

      if (renderObjs.length && res.renderer.pipelines.length) {
        dbgLogMilestone("Rendering first frame");
      }

      renderObjs.length = 0;

      // Performance logging
      if (PERF_DBG_GPU) {
        const stdPool = res.renderer.renderer.getCyResource(meshPoolPtr)!;
        const stats = stdPool._stats;
        const totalBytes =
          stats._accumPrimDataQueued +
          stats._accumUniDataQueued +
          stats._accumVertDataQueued;
        const totalKb = totalBytes / 1024;
        if (totalKb > 100) {
          console.log(`Big frame: ${totalKb.toFixed(0)}kb`);
          console.log(`prims: ${stats._accumPrimDataQueued / 1024}kb`);
          console.log(`uni: ${stats._accumUniDataQueued / 1024}kb`);
          console.log(`vert: ${stats._accumVertDataQueued / 1024}kb`);
        }
        stats._accumPrimDataQueued = 0;
        stats._accumUniDataQueued = 0;
        stats._accumVertDataQueued = 0;
      }
    }
  );

  // EM.addConstraint([
  //   "renderListDeadHidden",
  //   "after",
  //   "updateRendererWorldFrames",
  // ]);
  // EM.addConstraint(["renderListDeadHidden", "before", "renderList"]);
  // EM.addConstraint(["renderList", "before", "stepRenderer"]);
});

// export function poolKindToPool(
//   renderer: Renderer,
//   kind: PoolKind
// ): MeshPool<any, any> {
//   if (kind === "std") {
//     return renderer.stdPool;
//   } else if (kind === "ocean") {
//     return renderer.oceanPool;
//   } else if (kind === "grass") {
//     return renderer.grassPool;
//   } else {
//     never(kind);
//   }
// }

export const RiggedRenderableDef = EM.defineNonupdatableComponent(
  "riggedRenderable",
  (meshHandle: RiggedMeshHandle, rigging: Rigging) => ({
    meshHandle,
    rigging,
    jointMatrices: rigging.parents.map(() => mat4.identity(mat4.create())),
  }),
  { multiArg: true }
);

EM.addEagerInit([RiggedRenderableConstructDef], [RendererDef], [], (res) => {
  const pool = createRiggedMeshPool(res.renderer.renderer);

  EM.addSystem(
    "constructRiggedRenderables",
    Phase.PRE_GAME_WORLD,
    [RiggedRenderableConstructDef],
    [],
    (es, res) => {
      // TODO(@darzu): DE-DUPLICATE with regular construct above!
      for (let e of es) {
        // TODO(@darzu): this seems somewhat inefficient to look for this every frame
        if (!RenderableDef.isOn(e)) {
          let mesh = e.riggedRenderableConstruct.mesh;
          assert(pool);
          let meshHandle = pool.addRiggedMesh(mesh);

          EM.set(e, RenderableDef, {
            enabled: true,
            hidden: false,
            // sortLayer: 0,
            meshHandle,
          });

          EM.set(e, RiggedRenderableDef, meshHandle, mesh.rigging);

          // TODO(@darzu): de-duplicate with constructRenderables
          // pool.updateUniform
          const uni = pool.ptr.unisStruct.create(); // TODO(@darzu): UNI
          EM.set(e, pool.ptr.dataDef, uni);
          // TODO(@darzu): HACK! We need some notion of required uni data maybe? Or common uni data
          if ("id" in e[pool.ptr.dataDef.name]) {
            // console.log(
            //   `setting ${e.id}.${pool.ptr.dataDef.name}.id = ${meshHandle.mId}`
            // );
            e[pool.ptr.dataDef.name]["id"] = meshHandle.mId;
          }
        }
      }
    }
  );

  EM.addSystem(
    "updateJoints",
    Phase.RENDER_PRE_DRAW,
    [RiggedRenderableDef, RenderableDef],
    [],
    (es, res) => {
      for (let e of es) {
        if (e.renderable.enabled && !e.renderable.hidden) {
          pool.updateJointMatrices(
            e.riggedRenderable.meshHandle,
            e.riggedRenderable.jointMatrices
          );
        }
      }
    }
  );
});

export type Renderer = ReturnType<typeof createRenderer>;
// export interface Renderer {
//   // opts
//   drawLines: boolean;
//   drawTris: boolean;

//   addMesh(m: Mesh): MeshHandleStd;
//   addMeshInstance(h: MeshHandleStd): MeshHandleStd;
//   updateMesh(handle: MeshHandleStd, newMeshData: Mesh): void;
//   // TODO(@darzu): scene struct maybe shouldn't be special cased, all uniforms
//   //  should be neatily updatable.
//   updateScene(scene: Partial<SceneTS>): void;
//   updatePointLights(pointLights: PointLightTS[]): void;
//   submitPipelines(handles: MeshHandleStd[], pipelines: CyPipelinePtr[]): void;
//   readTexture(tex: CyTexturePtr): Promise<ArrayBuffer>;
//   stats(): Promise<Map<string, bigint>>;
// }

// TODO(@darzu): CANVAS
// TODO(@darzu): RENAME GPUCanvas ?
export interface AbstractCanvas {
  getCanvasTexture: () => GPUTexture;
  getCanvasSize: () => readonly [number, number];
}

EM.addLazyInit(
  [CanvasDef, ShadersDef],
  [RendererDef],
  async ({ htmlCanvas, shaders }) => {
    let renderer: Renderer | undefined = undefined;

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      console.error("navigator.gpu?.requestAdapter() failed");
      displayWebGPUError();
      throw new Error("Unable to get gpu adapter");
    }

    const supportsTimestamp = adapter.features.has("timestamp-query");
    if (!supportsTimestamp && VERBOSE_LOG)
      console.log(
        "GPU profiling disabled: device does not support timestamp queries"
      );

    if (LOG_WEBGPU_AVAILABLE_FEATURES) {
      console.log("available navigator.gpu?.requestAdapter().features");
      console.dir([...adapter.features.keys()]);
    }

    const device = await adapter.requestDevice({
      label: `sprigDevice`,
      requiredFeatures: supportsTimestamp ? ["timestamp-query"] : [],
    });

    // TODO(@darzu): CANVAS
    let _activeCanvas: HTMLCanvasElement;
    let _activeCanvasName: string;
    let _activeContext: GPUCanvasContext;

    const canvasToCtx = new Map<string, GPUCanvasContext>();

    function updateActiveCanvas() {
      _activeCanvas = htmlCanvas.getCanvasHtml();
      _activeCanvasName = htmlCanvas.getCanvasName();

      let ctxOpt = canvasToCtx.get(_activeCanvasName);
      if (!ctxOpt) {
        ctxOpt = _activeCanvas.getContext("webgpu") ?? undefined;
        if (!ctxOpt) {
          displayWebGPUError();
          throw new Error("Unable to get webgpu context");
        }
        initCanvasContext(ctxOpt);

        canvasToCtx.set(_activeCanvasName, ctxOpt);
      }
      _activeContext = ctxOpt;
    }

    function initCanvasContext(ctx: GPUCanvasContext) {
      // TODO(@darzu): CANVAS
      ctx.configure({
        device: device,
        format: canvasFormat, // presentationFormat
        // TODO(@darzu): support transparency?
        // alphaMode: "premultiplied",
        alphaMode: "opaque",
        colorSpace: "srgb",
      });
    }

    updateActiveCanvas();

    htmlCanvas.onCanvasChange = updateActiveCanvas; // TODO(@darzu): register instead

    const getCanvasTexture = () => _activeContext.getCurrentTexture();

    // TODO(@darzu): CANVAS
    const getCanvasSize = () =>
      [_activeCanvas.width, _activeCanvas.height] as const;

    const absCanvas: AbstractCanvas = {
      getCanvasSize,
      getCanvasTexture,
    };

    renderer = createRenderer(device, shaders, absCanvas);

    EM.addResource(RendererDef, renderer, []);
  }
);

export function displayWebGPUError() {
  const style = `font-size: 48px;
      color: green;
      margin: 24px;
      max-width: 600px;`;
  document.getElementsByTagName(
    "body"
  )[0].innerHTML = `<div style="${style}">This page requires WebGPU which isn't yet supported in your browser!<br>Or something else went wrong that was my fault.<br><br>Probably Chrome on Windows will work.<br><br>🙂</div>`;
}
