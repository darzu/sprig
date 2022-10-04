import { EntityManager, EM, Entity, EntityW } from "../entity-manager.js";
import { applyTints, TintsDef } from "../color-ecs.js";
import { CameraViewDef } from "../camera.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import {
  Frame,
  TransformDef,
  PhysicsParentDef,
  updateFrameFromTransform,
  updateFrameFromPosRotScale,
  copyFrame,
} from "../physics/transform.js";
import { ColorDef } from "../color-ecs.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DeletedDef } from "../delete.js";
import { stdRenderPipeline } from "./pipelines/std-mesh.js";
import { computeUniData, MeshUniformTS } from "./pipelines/std-scene.js";
import { CanvasDef } from "../canvas.js";
import { FORCE_WEBGL } from "../main.js";
import { createRenderer } from "./renderer-webgpu.js";
import { CyPipelinePtr, CyTexturePtr } from "./gpu-registry.js";
import { createFrame, WorldFrameDef } from "../physics/nonintersection.js";
import { tempVec3 } from "../temp-pool.js";
import { isMeshHandle, MeshHandle } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { SceneTS } from "./pipelines/std-scene.js";
import { max } from "../math.js";
import {
  positionAndTargetToOrthoViewProjMatrix,
  vec3Dbg,
} from "../utils-3d.js";
import { ShadersDef, ShaderSet } from "./shader-loader.js";
import { dbgLogOnce, never } from "../util.js";
import { TimeDef } from "../time.js";
import { PartyDef } from "../game/party.js";
import { PointLightDef, pointLightsPtr, PointLightTS } from "./lights.js";
import {
  computeOceanUniData,
  OceanMeshHandle,
  OceanUniTS,
} from "./pipelines/std-ocean.js";
import { assert } from "../util.js";
import {
  DONT_SMOOTH_WORLD_FRAME,
  GPU_DBG_PERF,
  VERBOSE_LOG,
} from "../flags.js";

const BLEND_SIMULATION_FRAMES_STRATEGY: "interpolate" | "extrapolate" | "none" =
  "none";

export type PoolKind = "std" | "ocean";
export interface RenderableConstruct {
  readonly enabled: boolean;
  readonly sortLayer: number;
  // TODO(@darzu): mask is inconsitently placed; here it is in the component,
  //  later it is in the mesh handle.
  readonly mask?: number;
  readonly poolKind: PoolKind;
  meshOrProto: Mesh | MeshHandle;
}

export const RenderableConstructDef = EM.defineComponent(
  "renderableConstruct",
  (
    meshOrProto: Mesh | MeshHandle,
    enabled: boolean = true,
    sortLayer: number = 0,
    mask?: number,
    poolKind: PoolKind = "std"
  ) => {
    const r: RenderableConstruct = {
      enabled,
      sortLayer: sortLayer,
      meshOrProto,
      mask,
      poolKind,
    };
    return r;
  }
);

export interface Renderable {
  enabled: boolean;
  sortLayer: number;
  meshHandle: MeshHandle;
}

export const RenderableDef = EM.defineComponent(
  "renderable",
  (r: Renderable) => r
);

// TODO: standardize names more

export const RenderDataStdDef = EM.defineComponent(
  "renderDataStd",
  (r: MeshUniformTS) => r
);

export const RenderDataOceanDef = EM.defineComponent(
  "renderDataOcean",
  (r: OceanUniTS) => r
);

// export interface RenderableOcean {
//   enabled: boolean;
//   sortLayer: number;
//   meshHandle: OceanMeshHandle;
// }

// export const RenderableOceanDef = EM.defineComponent(
//   "renderableOcean",
//   (r: RenderableOcean) => r
// );

const _hasRendererWorldFrame = new Set();

export const SmoothedWorldFrameDef = EM.defineComponent(
  "smoothedWorldFrame",
  () => createFrame()
);

const PrevSmoothedWorldFrameDef = EM.defineComponent(
  "prevSmoothedWorldFrame",
  () => createFrame()
);

export const RendererWorldFrameDef = EM.defineComponent(
  "rendererWorldFrame",
  () => createFrame()
);

function updateSmoothedWorldFrame(em: EntityManager, o: Entity) {
  if (DeletedDef.isOn(o)) return;
  if (!TransformDef.isOn(o)) return;
  let parent = null;
  if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
    if (!_hasRendererWorldFrame.has(o.physicsParent.id)) {
      updateSmoothedWorldFrame(em, em.findEntity(o.physicsParent.id, [])!);
    }
    parent = em.findEntity(o.physicsParent.id, [SmoothedWorldFrameDef]);
    if (!parent) return;
  }
  let firstFrame = false;
  if (!SmoothedWorldFrameDef.isOn(o)) firstFrame = true;
  em.ensureComponentOn(o, SmoothedWorldFrameDef);
  em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
  copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  mat4.copy(o.smoothedWorldFrame.transform, o.transform);
  updateFrameFromTransform(o.smoothedWorldFrame);
  if (MotionSmoothingDef.isOn(o)) {
    vec3.add(
      o.smoothedWorldFrame.position,
      o.smoothedWorldFrame.position,
      o.motionSmoothing.positionError
    );
    quat.mul(
      o.smoothedWorldFrame.rotation,
      o.smoothedWorldFrame.rotation,
      o.motionSmoothing.rotationError
    );
    updateFrameFromPosRotScale(o.smoothedWorldFrame);
  }
  if (parent) {
    mat4.mul(
      o.smoothedWorldFrame.transform,
      parent.smoothedWorldFrame.transform,
      o.smoothedWorldFrame.transform
    );
    updateFrameFromTransform(o.smoothedWorldFrame);
  }
  if (firstFrame) copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  _hasRendererWorldFrame.add(o.id);
}

export function registerUpdateSmoothedWorldFrames(em: EntityManager) {
  em.registerSystem(
    [RenderableConstructDef, TransformDef],
    [],
    (objs, res) => {
      _hasRendererWorldFrame.clear();

      for (const o of objs) {
        // TODO(@darzu): PERF HACK!
        if (DONT_SMOOTH_WORLD_FRAME) {
          em.ensureComponentOn(o, SmoothedWorldFrameDef);
          em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
          continue;
        }

        updateSmoothedWorldFrame(em, o);
      }
    },
    "updateSmoothedWorldFrames"
  );
}

let _simulationAlpha = 0.0;

export function setSimulationAlpha(to: number) {
  _simulationAlpha = to;
}

function interpolateFrames(
  alpha: number,
  out: Frame,
  prev: Frame,
  next: Frame
) {
  vec3.lerp(out.position, prev.position, next.position, alpha);
  quat.slerp(out.rotation, prev.rotation, next.rotation, alpha);
  vec3.lerp(out.scale, prev.scale, next.scale, alpha);
  updateFrameFromPosRotScale(out);
}

function extrapolateFrames(
  alpha: number,
  out: Frame,
  prev: Frame,
  next: Frame
) {
  // out.position = next.position + alpha * (next.position - prev.position)
  vec3.sub(out.position, next.position, prev.position);
  vec3.scale(out.position, out.position, alpha);
  vec3.add(out.position, out.position, next.position);

  // see https://answers.unity.com/questions/168779/extrapolating-quaternion-rotation.html
  quat.invert(out.rotation, prev.rotation);
  quat.mul(out.rotation, next.rotation, out.rotation);
  const axis = tempVec3();
  let angle = quat.getAxisAngle(axis, out.rotation);
  // ensure we take the shortest path
  if (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  if (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  angle = angle * alpha;
  quat.setAxisAngle(out.rotation, axis, angle);
  quat.mul(out.rotation, out.rotation, next.rotation);

  // out.scale = next.scale + alpha * (next.scale - prev.scale)
  vec3.sub(out.scale, next.scale, prev.scale);
  vec3.scale(out.scale, out.scale, alpha);
  vec3.add(out.scale, out.scale, next.scale);

  updateFrameFromPosRotScale(out);
}

export function registerUpdateRendererWorldFrames(em: EntityManager) {
  em.registerSystem(
    [SmoothedWorldFrameDef, PrevSmoothedWorldFrameDef],
    [],
    (objs) => {
      for (let o of objs) {
        em.ensureComponentOn(o, RendererWorldFrameDef);

        // TODO(@darzu): HACK!
        if (DONT_SMOOTH_WORLD_FRAME) {
          (o as any).rendererWorldFrame = (o as any).world;
          continue;
        }

        switch (BLEND_SIMULATION_FRAMES_STRATEGY) {
          case "interpolate":
            interpolateFrames(
              _simulationAlpha,
              o.rendererWorldFrame,
              o.prevSmoothedWorldFrame,
              o.smoothedWorldFrame
            );
            break;
          case "extrapolate":
            extrapolateFrames(
              _simulationAlpha,
              o.rendererWorldFrame,
              o.prevSmoothedWorldFrame,
              o.smoothedWorldFrame
            );
            break;
          default:
            copyFrame(o.rendererWorldFrame, o.smoothedWorldFrame);
        }
      }
    },
    "updateRendererWorldFrames"
  );
}

const _lastMeshHandlePos = new Map<number, vec3>();

export function registerRenderer(em: EntityManager) {
  em.registerSystem(
    [RendererWorldFrameDef, RenderableDef],
    [CameraViewDef, RendererDef, TimeDef, PartyDef],
    (objs, res) => {
      const renderer = res.renderer.renderer;
      const cameraView = res.cameraView;

      objs = objs.filter((o) => o.renderable.enabled && !DeletedDef.isOn(o));

      // ensure our mesh handle is up to date
      for (let o of objs) {
        if (RenderDataStdDef.isOn(o)) {
          // color / tint
          let tintChange = false;
          let prevTint = vec3.copy(tempVec3(), o.renderDataStd.tint);
          if (ColorDef.isOn(o)) {
            vec3.copy(o.renderDataStd.tint, o.color);
          }
          if (TintsDef.isOn(o)) {
            applyTints(o.tints, o.renderDataStd.tint);
          }
          if (vec3.sqrDist(prevTint, o.renderDataStd.tint) > 0.01) {
            tintChange = true;
          }

          // TODO(@darzu): actually we only set this at creation now so that
          //  it's overridable for gameplay
          // id
          // o.renderDataStd.id = o.renderable.meshHandle.mId;

          // transform
          // TODO(@darzu): hACK! ONLY UPDATE UNIFORM IF WE"VE MOVED
          let lastPos = _lastMeshHandlePos.get(o.renderable.meshHandle.mId);
          const thisPos = o.rendererWorldFrame.position;
          if (tintChange || !lastPos || vec3.sqrDist(lastPos, thisPos) > 0.01) {
            mat4.copy(
              o.renderDataStd.transform,
              o.rendererWorldFrame.transform
            );
            res.renderer.renderer.stdPool.updateUniform(
              o.renderable.meshHandle,
              o.renderDataStd
            );
            if (!lastPos) {
              lastPos = vec3.create();
              _lastMeshHandlePos.set(o.renderable.meshHandle.mId, lastPos);
            }
            vec3.copy(lastPos, thisPos);
          }
        } else if (RenderDataOceanDef.isOn(o)) {
          // color / tint
          if (ColorDef.isOn(o)) {
            vec3.copy(o.renderDataOcean.tint, o.color);
          }
          if (TintsDef.isOn(o)) {
            applyTints(o.tints, o.renderDataOcean.tint);
          }

          // id
          o.renderDataOcean.id = o.renderable.meshHandle.mId;

          // transform
          mat4.copy(
            o.renderDataOcean.transform,
            o.rendererWorldFrame.transform
          );
          res.renderer.renderer.oceanPool.updateUniform(
            o.renderable.meshHandle,
            o.renderDataOcean
          );
        }
      }

      // TODO(@darzu): this is currently unused, and maybe should be dropped.
      // sort
      // objs.sort((a, b) => b.renderable.sortLayer - a.renderable.sortLayer);

      // render
      // TODO(@darzu):
      // const m24 = objs.filter((o) => o.renderable.meshHandle.mId === 24);
      // const e10003 = objs.filter((o) => o.id === 10003);
      // console.log(`mId 24: ${!!m24.length}, e10003: ${!!e10003.length}`);

      // TODO(@darzu): go elsewhere
      // const lightPosition = vec3.fromValues(50, 100, -100);

      const pointLights = em
        .filterEntities([PointLightDef, RendererWorldFrameDef])
        .map((e) => {
          e.pointLight.viewProj = positionAndTargetToOrthoViewProjMatrix(
            mat4.create(),
            e.rendererWorldFrame.position,
            cameraView.location
          );
          let { viewProj, ...rest } = e.pointLight;
          return {
            viewProj,
            position: e.rendererWorldFrame.position,
            ...rest,
          };
        });

      // const lightPosition =
      //   pointLights[0]?.position ?? vec3.fromValues(0, 0, 0);

      // TODO(@darzu): this maxSurfaceId calculation is super inefficient, we need
      //  to move this out of this loop.
      let maxSurfaceId = 1000;
      // let maxSurfaceId = max(
      //   objs
      //     .map((o) => o.renderable.meshHandle.readonlyMesh?.surfaceIds ?? [0])
      //     .reduce((p, n) => [...p, ...n], [])
      // );
      // TODO(@darzu): DBG
      // maxSurfaceId = 12;
      // console.log(`maxSurfaceId: ${maxSurfaceId}`);

      renderer.updateScene({
        cameraViewProjMatrix: cameraView.viewProjMat,
        //lightViewProjMatrix,
        time: res.time.time,
        canvasAspectRatio: res.cameraView.aspectRatio,
        maxSurfaceId,
        partyPos: res.party.pos,
        cameraPos: cameraView.location,
        numPointLights: pointLights.length,
      });
      // console.log(`pointLights.length: ${pointLights.length}`);

      renderer.updatePointLights(pointLights);

      renderer.submitPipelines(
        objs.map((o) => o.renderable.meshHandle),
        res.renderer.pipelines
      );

      if (objs.length && res.renderer.pipelines.length) {
        dbgLogOnce(
          "first-frame",
          `Rendering first frame at: ${performance.now().toFixed(2)}ms`
        );
      }

      // Performance logging
      if (GPU_DBG_PERF) {
        const stats = res.renderer.renderer.stdPool._stats;
        const totalBytes =
          stats._accumTriDataQueued +
          stats._accumUniDataQueued +
          stats._accumVertDataQueued;
        const totalKb = totalBytes / 1024;
        if (totalKb > 100) {
          console.log(`Big frame: ${totalKb.toFixed(0)}kb`);
          console.log(`tris: ${stats._accumTriDataQueued / 1024}kb`);
          console.log(`uni: ${stats._accumUniDataQueued / 1024}kb`);
          console.log(`vert: ${stats._accumVertDataQueued / 1024}kb`);
        }
        stats._accumTriDataQueued = 0;
        stats._accumUniDataQueued = 0;
        stats._accumVertDataQueued = 0;
      }
    },
    "stepRenderer"
  );
}

export function registerConstructRenderablesSystem(em: EntityManager) {
  em.registerSystem(
    [RenderableConstructDef],
    [RendererDef],
    (es, res) => {
      for (let e of es) {
        // TODO(@darzu): this seems somewhat inefficient to look for this every frame
        if (!RenderableDef.isOn(e)) {
          let meshHandle: MeshHandle;
          let mesh: Mesh;
          if (isMeshHandle(e.renderableConstruct.meshOrProto)) {
            assert(
              e.renderableConstruct.poolKind === "std",
              `Instanced meshes only supported for std pool`
            );
            meshHandle = res.renderer.renderer.stdPool.addMeshInstance(
              e.renderableConstruct.meshOrProto
            );
            mesh = meshHandle.readonlyMesh!;
          } else {
            if (e.renderableConstruct.poolKind === "std") {
              meshHandle = res.renderer.renderer.stdPool.addMesh(
                e.renderableConstruct.meshOrProto
              );
            } else if (e.renderableConstruct.poolKind === "ocean") {
              meshHandle = res.renderer.renderer.oceanPool.addMesh(
                e.renderableConstruct.meshOrProto
              );
            } else {
              never(e.renderableConstruct.poolKind);
            }
            mesh = e.renderableConstruct.meshOrProto;
          }
          if (e.renderableConstruct.mask) {
            meshHandle.mask = e.renderableConstruct.mask;
          }

          em.addComponent(e.id, RenderableDef, {
            enabled: e.renderableConstruct.enabled,
            sortLayer: e.renderableConstruct.sortLayer,
            meshHandle,
          });
          if (e.renderableConstruct.poolKind === "std") {
            em.ensureComponentOn(e, RenderDataStdDef, computeUniData(mesh));
            e.renderDataStd.id = meshHandle.mId;
          } else if (e.renderableConstruct.poolKind === "ocean") {
            em.addComponent(
              e.id,
              RenderDataOceanDef,
              computeOceanUniData(mesh)
            );
          } else {
            never(e.renderableConstruct.poolKind);
          }
        }
      }
    },
    "constructRenderables"
  );
}

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

// TODO(@darzu): the double "Renderer" naming is confusing. Maybe one should be GPUManager or something?
export const RendererDef = EM.defineComponent(
  "renderer",
  (renderer: Renderer, usingWebGPU: boolean, pipelines: CyPipelinePtr[]) => {
    return {
      renderer,
      usingWebGPU,
      pipelines,
    };
  }
);

let _rendererPromise: Promise<void> | null = null;

export function registerRenderInitSystem(em: EntityManager) {
  em.registerSystem(
    [],
    [CanvasDef, ShadersDef],
    (_, res) => {
      if (!!em.getResource(RendererDef)) return; // already init
      if (!!_rendererPromise) return;
      _rendererPromise = chooseAndInitRenderer(
        em,
        res.shaders,
        res.htmlCanvas.canvas
      );
    },
    "renderInit"
  );
}

async function chooseAndInitRenderer(
  em: EntityManager,
  shaders: ShaderSet,
  canvas: HTMLCanvasElement
): Promise<void> {
  let renderer: Renderer | undefined = undefined;
  let usingWebGPU = false;
  if (!FORCE_WEBGL) {
    // try webgpu first
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      const supportsTimestamp = adapter.features.has("timestamp-query");
      if (!supportsTimestamp && VERBOSE_LOG)
        console.log(
          "GPU profiling disabled: device does not support timestamp queries"
        );
      const device = await adapter.requestDevice({
        requiredFeatures: supportsTimestamp ? ["timestamp-query"] : [],
      });
      // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
      const context = canvas.getContext("webgpu");
      // console.log("webgpu context:");
      // console.dir(context);
      if (context) {
        renderer = createRenderer(canvas, device, context, shaders);
        if (renderer) usingWebGPU = true;
      }
    }
  }
  // TODO(@darzu): re-enable WebGL
  // if (!rendererInit)
  //   rendererInit = attachToCanvasWebgl(canvas, MAX_MESHES, MAX_VERTICES);
  if (!renderer) {
    displayWebGPUError();
    throw new Error("Unable to create webgl or webgpu renderer");
  }
  if (VERBOSE_LOG) console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);

  // add to ECS
  // TODO(@darzu): this is a little wierd to do this in an async callback
  em.addSingletonComponent(RendererDef, renderer, usingWebGPU, []);
}

export function displayWebGPUError() {
  const style = `font-size: 48px;
      color: green;
      margin: 24px;
      max-width: 600px;`;
  document.getElementsByTagName(
    "body"
  )[0].innerHTML = `<div style="${style}">This page requires WebGPU which isn't yet supported in your browser!<br>Or something else went wrong that was my fault.<br><br>U can try Chrome >106.<br><br>🙂</div>`;
}
