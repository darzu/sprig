import { EntityManager, EM, Entity } from "../entity-manager.js";
import { applyTints, TintsDef } from "../color.js";
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
import { ColorDef } from "../color.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DeletedDef } from "../delete.js";
import { stdRenderPipeline } from "./std-pipeline.js";
import { MeshHandleStd } from "./std-scene.js";
import { CanvasDef } from "../canvas.js";
import { FORCE_WEBGL } from "../main.js";
import { createWebGPURenderer } from "./render-webgpu.js";
import { CyPipelinePtr } from "./gpu-registry.js";
import { createFrame } from "../physics/nonintersection.js";
import { tempVec } from "../temp-pool.js";
import { isMeshHandle } from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { SceneTS } from "./std-scene.js";
import { max } from "../math.js";

const BLEND_SIMULATION_FRAMES_STRATEGY: "interpolate" | "extrapolate" | "none" =
  "none";

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
    [RenderableDef, TransformDef],
    [],
    (objs, res) => {
      _hasRendererWorldFrame.clear();

      for (const o of objs) {
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
  const axis = tempVec();
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

export function registerRenderer(em: EntityManager) {
  em.registerSystem(
    [RendererWorldFrameDef, RenderableDef],
    [CameraViewDef, RendererDef],
    (objs, res) => {
      const renderer = res.renderer.renderer;
      const cameraView = res.cameraView;

      objs = objs.filter((o) => o.renderable.enabled && !DeletedDef.isOn(o));

      // ensure our mesh handle is up to date
      for (let o of objs) {
        // color / tint
        if (ColorDef.isOn(o)) {
          vec3.copy(o.renderable.meshHandle.shaderData.tint, o.color);
        }
        if (TintsDef.isOn(o)) {
          applyTints(o.tints, o.renderable.meshHandle.shaderData.tint);
        }

        // id
        o.renderable.meshHandle.shaderData.id = o.renderable.meshHandle.mId;

        // transform
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

      // const light1Dir = vec3.fromValues(-1, -2, -1);
      // vec3.normalize(light1Dir, light1Dir);

      // TODO(@darzu): go elsewhere
      // const lightPosition = vec3.fromValues(50, 100, -100);
      const lightPosition = vec3.fromValues(50, 100, 50);
      const lightViewMatrix = mat4.create();
      mat4.lookAt(lightViewMatrix, lightPosition, [0, 0, 0], [0, 1, 0]);
      const lightProjectionMatrix = mat4.create();
      {
        const left = -80;
        const right = 80;
        const bottom = -80;
        const top = 80;
        const near = -200;
        const far = 300;
        mat4.ortho(lightProjectionMatrix, left, right, bottom, top, near, far);
      }
      const lightViewProjMatrix = mat4.create();
      mat4.multiply(
        lightViewProjMatrix,
        lightProjectionMatrix,
        lightViewMatrix
      );

      let maxSurfaceId = max(
        objs
          .map((o) => o.renderable.meshHandle.readonlyMesh?.surfaceIds ?? [0])
          .reduce((p, n) => [...p, ...n], [])
      );
      // TODO(@darzu): DBG
      // maxSurfaceId = 12;
      // console.log(`maxSurfaceId: ${maxSurfaceId}`);

      renderer.updateScene({
        cameraViewProjMatrix: cameraView.viewProjMat,
        lightViewProjMatrix,
        // TODO(@darzu): use?
        time: 1000 / 60,
        maxSurfaceId,
      });

      renderer.renderFrame(
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

  addMesh(m: Mesh): MeshHandleStd;
  addMeshInstance(h: MeshHandleStd): MeshHandleStd;
  updateMesh(handle: MeshHandleStd, newMeshData: Mesh): void;
  updateScene(scene: Partial<SceneTS>): void;
  renderFrame(handles: MeshHandleStd[], pipelines: CyPipelinePtr[]): void;
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
  em.addSingletonComponent(RendererDef, renderer, usingWebGPU, []);
}
