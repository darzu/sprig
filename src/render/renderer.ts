import { Canvas, CanvasDef } from "../canvas.js";
import {
  EntityManager,
  EM,
  Component,
  EntityW,
  Entity,
} from "../entity-manager.js";
import { applyTints, TintsDef } from "../color.js";
import { PlayerDef } from "../game/player.js";
import {
  CameraDef,
  CameraProps,
  CameraView,
  CameraViewDef,
} from "../camera.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { isMeshHandle, Mesh, MeshHandle } from "./mesh-pool.js";
import { Authority, AuthorityDef, Me, MeDef } from "../net/components.js";
import { createFrame, WorldFrameDef } from "../physics/nonintersection.js";
import { RendererDef } from "./render_init.js";
import { tempQuat, tempVec } from "../temp-pool.js";
import {
  PhysicsParent,
  Position,
  PositionDef,
  Rotation,
  RotationDef,
  Frame,
  TransformDef,
  PhysicsParentDef,
  ScaleDef,
  updateFrameFromTransform,
  updateFrameFromPosRotScale,
  copyFrame,
} from "../physics/transform.js";
import { ColorDef } from "../color.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DeletedDef } from "../delete.js";

const BLEND_SIMULATION_FRAMES_STRATEGY: "interpolate" | "extrapolate" | "none" =
  "extrapolate";

export interface RenderableConstruct {
  readonly enabled: boolean;
  readonly layer: number;
  meshOrProto: Mesh | MeshHandle;
}

export const RenderableConstructDef = EM.defineComponent(
  "renderableConstruct",
  (
    meshOrProto: Mesh | MeshHandle,
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

function createEmptyMesh(): Mesh {
  return {
    pos: [],
    tri: [],
    colors: [],
  };
}

export interface Renderable {
  enabled: boolean;
  layer: number;
  meshHandle: MeshHandle;
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

function stepRenderer(
  renderer: Renderer,
  objs: RenderableObj[],
  cameraView: CameraView
) {
  // filter
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
    objs.map((o) => o.renderable.meshHandle)
  );
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
      stepRenderer(res.renderer.renderer, objs, res.cameraView);
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
          let meshHandle: MeshHandle;
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

  addMesh(m: Mesh): MeshHandle;
  addMeshInstance(h: MeshHandle): MeshHandle;
  updateMesh(handle: MeshHandle, newMeshData: Mesh): void;
  renderFrame(viewMatrix: mat4, handles: MeshHandle[]): void;
  removeMesh(h: MeshHandle): void;
}
