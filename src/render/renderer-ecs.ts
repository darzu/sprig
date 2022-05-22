import { EntityManager, EM, Entity } from "../entity-manager.js";
import { applyTints, TintsDef } from "../color.js";
import { CameraView, CameraViewDef } from "../camera.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { isMeshHandle } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { createFrame } from "../physics/nonintersection.js";
import { PhysicsTimerDef } from "../time.js";
import {
  Frame,
  TransformDef,
  PhysicsParentDef,
  updateFrameFromTransform,
  updateFrameFromPosRotScale,
} from "../physics/transform.js";
import { ColorDef } from "../color.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DeletedDef } from "../delete.js";
import { MeshHandleStd, renderTriPipelineDesc } from "./std-pipeline.js";
import { CanvasDef } from "../canvas.js";
import { FORCE_WEBGL } from "../main.js";
import { createWebGPURenderer } from "./render-webgpu.js";
import { CyPipelinePtr, CyRndrPipelinePtr } from "./gpu-registry.js";

export interface RenderableConstruct {
  readonly enabled: boolean;
  readonly layer: number;
  meshOrProto: Mesh | MeshHandleStd;
}

export const RenderableConstructDef = EM.defineComponent(
  "renderableConstruct",
  (
    meshOrProto: Mesh | MeshHandleStd,
    enabled: boolean = true,
    layer: number = 0
  ) => {
    const r: RenderableConstruct = {
      enabled,
      layer,
      meshOrProto,
    };
    return r;
  }
);

export interface Renderable {
  enabled: boolean;
  layer: number;
  meshHandle: MeshHandleStd;
}

export const RenderableDef = EM.defineComponent(
  "renderable",
  (r: Renderable) => r
);

interface RenderableObj {
  id: number;
  renderable: Renderable;
  rendererWorldFrame: Frame;
}

const _hasRendererWorldFrame = new Set();

export const RendererWorldFrameDef = EM.defineComponent(
  "rendererWorldFrame",
  () => createFrame()
);

function updateRendererWorldFrame(em: EntityManager, o: Entity) {
  if (DeletedDef.isOn(o)) return;
  if (!TransformDef.isOn(o)) return;
  let parent = null;
  if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
    if (!_hasRendererWorldFrame.has(o.physicsParent.id)) {
      updateRendererWorldFrame(em, em.findEntity(o.physicsParent.id, [])!);
    }
    parent = em.findEntity(o.physicsParent.id, [RendererWorldFrameDef]);
    if (!parent) return;
  }
  em.ensureComponentOn(o, RendererWorldFrameDef);
  mat4.copy(o.rendererWorldFrame.transform, o.transform);
  updateFrameFromTransform(o.rendererWorldFrame);
  if (MotionSmoothingDef.isOn(o)) {
    vec3.add(
      o.rendererWorldFrame.position,
      o.rendererWorldFrame.position,
      o.motionSmoothing.positionError
    );
    quat.mul(
      o.rendererWorldFrame.rotation,
      o.rendererWorldFrame.rotation,
      o.motionSmoothing.rotationError
    );
    updateFrameFromPosRotScale(o.rendererWorldFrame);
  }
  if (parent) {
    mat4.mul(
      o.rendererWorldFrame.transform,
      parent.rendererWorldFrame.transform,
      o.rendererWorldFrame.transform
    );
    updateFrameFromTransform(o.rendererWorldFrame);
  }
  _hasRendererWorldFrame.add(o.id);
}

export function registerUpdateRendererWorldFrames(em: EntityManager) {
  em.registerSystem(
    [RenderableDef, TransformDef],
    [],
    (objs, res) => {
      _hasRendererWorldFrame.clear();

      for (const o of objs) {
        updateRendererWorldFrame(em, o);
      }
    },
    "updateRendererWorldFrames"
  );
}

export function registerRenderer(em: EntityManager) {
  em.registerSystem(
    [RendererWorldFrameDef, RenderableDef],
    [CameraViewDef, PhysicsTimerDef, RendererDef],
    (objs, res) => {
      // TODO: should we just render on every frame?
      if (res.physicsTimer.steps <= 0) return;

      const renderer = res.renderer.renderer;
      const cameraView = res.cameraView;

      objs = objs.filter((o) => o.renderable.enabled && !DeletedDef.isOn(o));

      // ensure our mesh handle is up to date
      for (let o of objs) {
        // TODO(@darzu): color:
        if (ColorDef.isOn(o)) {
          vec3.copy(o.renderable.meshHandle.shaderData.tint, o.color);
        }

        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.renderable.meshHandle.shaderData.tint);
        }
        mat4.copy(
          o.renderable.meshHandle.shaderData.transform,
          o.rendererWorldFrame.transform
        );
      }

      // sort
      objs.sort((a, b) => b.renderable.layer - a.renderable.layer);

      // render
      // TODO(@darzu):
      // const m24 = objs.filter((o) => o.renderable.meshHandle.mId === 24);
      // const e10003 = objs.filter((o) => o.id === 10003);
      // console.log(`mId 24: ${!!m24.length}, e10003: ${!!e10003.length}`);
      renderer.renderFrame(
        cameraView.viewProjMat,
        objs.map((o) => o.renderable.meshHandle),
        res.renderer.pipelines
      );
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
        if (!RenderableDef.isOn(e)) {
          // TODO(@darzu): how should we handle instancing?
          // TODO(@darzu): this seems somewhat inefficient to look for this every frame
          let meshHandle: MeshHandleStd;
          if (isMeshHandle(e.renderableConstruct.meshOrProto))
            meshHandle = res.renderer.renderer.addMeshInstance(
              e.renderableConstruct.meshOrProto
            );
          else
            meshHandle = res.renderer.renderer.addMesh(
              e.renderableConstruct.meshOrProto
            );

          em.addComponent(e.id, RenderableDef, {
            enabled: e.renderableConstruct.enabled,
            layer: e.renderableConstruct.layer,
            meshHandle,
          });
        }
      }
    },
    "constructRenderables"
  );
}

export interface Renderer {
  // opts
  drawLines: boolean;
  drawTris: boolean;
  backgroundColor: vec3;

  addMesh(m: Mesh): MeshHandleStd;
  addMeshInstance(h: MeshHandleStd): MeshHandleStd;
  updateMesh(handle: MeshHandleStd, newMeshData: Mesh): void;
  renderFrame(
    viewMatrix: mat4,
    handles: MeshHandleStd[],
    pipelines: CyPipelinePtr[]
  ): void;
}

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
    [CanvasDef],
    (_, res) => {
      if (!!em.getResource(RendererDef)) return; // already init
      if (!!_rendererPromise) return;
      _rendererPromise = chooseAndInitRenderer(em, res.htmlCanvas.canvas);
    },
    "renderInit"
  );
}

async function chooseAndInitRenderer(
  em: EntityManager,
  canvas: HTMLCanvasElement
): Promise<void> {
  let renderer: Renderer | undefined = undefined;
  let usingWebGPU = false;
  if (!FORCE_WEBGL) {
    // try webgpu first
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      const device = await adapter.requestDevice();
      // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
      const context = canvas.getContext("webgpu");
      if (context) {
        renderer = createWebGPURenderer(canvas, device, context);
        if (renderer) usingWebGPU = true;
      }
    }
  }
  // TODO(@darzu): re-enable WebGL
  // if (!rendererInit)
  //   rendererInit = attachToCanvasWebgl(canvas, MAX_MESHES, MAX_VERTICES);
  if (!renderer) throw "Unable to create webgl or webgpu renderer";
  console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);

  // add to ECS
  // TODO(@darzu): this is a little wierd to do this in an async callback
  em.addSingletonComponent(RendererDef, renderer, usingWebGPU, [
    renderTriPipelineDesc,
  ]);
}
