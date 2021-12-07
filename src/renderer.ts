import { Canvas, CanvasDef } from "./canvas.js";
import {
  ComponentDef,
  EntityManager,
  EM,
  Entity,
  Component,
} from "./entity-manager.js";
import { ColorDef } from "./game/game.js";
import {
  CameraDef,
  CameraProps,
  PlayerEnt,
  PlayerEntDef,
} from "./game/player.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { Mesh, MeshHandle, MeshHandleDef } from "./mesh-pool.js";
import { Authority, AuthorityDef, Me, MeDef } from "./net/components.js";
import { Motion, MotionDef } from "./phys_motion.js";
import { RendererDef } from "./render_init.js";
import { Renderer } from "./render_webgpu.js";
import { tempQuat, tempVec } from "./temp-pool.js";
import { PhysicsTimerDef, Timer } from "./time.js";

const SMOOTH = true;

export const TransformDef = EM.defineComponent("transform", () => {
  return mat4.create();
});
export type Transform = mat4;

export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
  return {
    locationTarget: vec3.create(),
    locationDiff: vec3.create(),
    rotationTarget: quat.create(),
    rotationDiff: quat.create(),
  };
});
export type MotionSmoothing = Component<typeof MotionSmoothingDef>;

export const ParentDef = EM.defineComponent("parent", () => {
  return { id: 0 };
});
export type Parent = Component<typeof ParentDef>;

export const RenderableDef = EM.defineComponent("renderable", (mesh?: Mesh) => {
  return {
    mesh:
      mesh ??
      ({
        pos: [],
        tri: [],
        colors: [],
      } as Mesh),
  };
});
export type Renderable = Component<typeof RenderableDef>;

type Transformable = {
  id: number;
  motion: Motion;
  transform: Transform;
  renderable: Renderable;
  // optional components
  // TODO(@darzu): let the query system specify optional components
  parent?: Parent;
  motionSmoothing?: MotionSmoothing;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  // update transform based on new rotations and positions
  if (o.parent && o.parent.id > 0) {
    if (!_hasTransformed.has(o.parent.id))
      updateTransform(_transformables.get(o.parent.id)!);

    mat4.fromRotationTranslation(
      o.transform,
      o.motion.rotation,
      o.motion.location
    );
    mat4.mul(
      o.transform,
      _transformables.get(o.parent.id)!.transform,
      o.transform
    );
  } else if (SMOOTH && o.motionSmoothing) {
    const working_quat = tempQuat();
    quat.mul(working_quat, o.motion.rotation, o.motionSmoothing.rotationDiff);
    quat.normalize(working_quat, working_quat);
    mat4.fromRotationTranslation(
      o.transform,
      working_quat,
      vec3.add(tempVec(), o.motion.location, o.motionSmoothing.locationDiff)
    );
  } else {
    mat4.fromRotationTranslation(
      o.transform,
      o.motion.rotation,
      o.motion.location
    );
  }

  _hasTransformed.add(o.id);
}

function updateTransforms(objs: Transformable[]) {
  _transformables.clear();
  _hasTransformed.clear();

  for (let o of objs) {
    _transformables.set(o.id, o);
  }

  for (let o of objs) {
    updateTransform(o);
  }
}

export function registerUpdateTransforms(em: EntityManager) {
  em.registerSystem(
    [MotionDef, TransformDef, RenderableDef],
    [],
    updateTransforms
  );
}

export const CameraViewDef = EM.defineComponent("cameraView", () => {
  return {
    aspectRatio: 1,
    width: 100,
    height: 100,
    viewProjMat: mat4.create(),
  };
});
export type CameraView = Component<typeof CameraViewDef>;

interface RenderableObj {
  id: number;
  renderable: Renderable;
  transform: Transform;
  meshHandle: MeshHandle;
}

function stepRenderer(
  renderer: Renderer,
  objs: RenderableObj[],
  cameraView: CameraView
) {
  // ensure our mesh handle is up to date
  for (let o of objs) {
    // TODO(@darzu): color:
    const colorEnt = EM.findEntity(o.id, [ColorDef]);
    if (colorEnt) {
      vec3.copy(o.meshHandle.tint, colorEnt.color);
    }

    mat4.copy(o.meshHandle.transform, o.transform);
  }

  // render
  renderer.renderFrame(
    cameraView.viewProjMat,
    objs.map((o) => o.meshHandle)
  );
}

function updateCameraView(
  players: { player: PlayerEnt; motion: Motion; authority: Authority }[],
  resources: {
    cameraView: CameraView;
    camera: CameraProps;
    me: Me;
    htmlCanvas: Canvas;
  }
) {
  const { cameraView, camera, me, htmlCanvas } = resources;

  const mePlayer = players.filter((p) => p.authority.pid === me.pid)[0];
  if (!mePlayer) return;

  // update aspect ratio and size
  cameraView.aspectRatio = Math.abs(
    htmlCanvas.canvas.width / htmlCanvas.canvas.height
  );
  cameraView.width = htmlCanvas.canvas.width;
  cameraView.height = htmlCanvas.canvas.height;

  //TODO: this calculation feels like it should be simpler but Doug doesn't
  //understand quaternions.
  let viewMatrix = mat4.create();
  if (mePlayer) {
    mat4.translate(viewMatrix, viewMatrix, mePlayer.motion.location);
    mat4.multiply(
      viewMatrix,
      viewMatrix,
      mat4.fromQuat(mat4.create(), mePlayer.motion.rotation)
    );
  }
  mat4.multiply(
    viewMatrix,
    viewMatrix,
    mat4.fromQuat(mat4.create(), camera.rotation)
  );
  mat4.translate(viewMatrix, viewMatrix, camera.location);
  mat4.invert(viewMatrix, viewMatrix);

  const projectionMatrix = mat4.create();
  if (camera.perspectiveMode === "ortho") {
    const ORTHO_SIZE = 40;
    mat4.ortho(
      projectionMatrix,
      -ORTHO_SIZE,
      ORTHO_SIZE,
      -ORTHO_SIZE,
      ORTHO_SIZE,
      -400,
      200
    );
  } else {
    mat4.perspective(
      projectionMatrix,
      (2 * Math.PI) / 5,
      cameraView.aspectRatio,
      1,
      10000.0 /*view distance*/
    );
  }
  const viewProj = mat4.multiply(
    mat4.create(),
    projectionMatrix,
    viewMatrix
  ) as Float32Array;

  cameraView.viewProjMat = viewProj;
}

export function registerUpdateCameraView(em: EntityManager) {
  em.addSingletonComponent(CameraViewDef);
  em.registerSystem(
    [PlayerEntDef, MotionDef, AuthorityDef],
    [CameraViewDef, CameraDef, MeDef, CanvasDef],
    updateCameraView
  );
}

export function registerRenderer(em: EntityManager) {
  em.registerSystem(
    [RenderableDef, TransformDef, MeshHandleDef],
    [CameraViewDef, PhysicsTimerDef, RendererDef],
    (objs, res) => {
      if (res.physicsTimer.steps > 0)
        stepRenderer(res.renderer.renderer, objs, res.cameraView);
    }
  );
}

export function registerAddMeshHandleSystem(em: EntityManager) {
  em.registerSystem([RenderableDef], [RendererDef], (es, res) => {
    for (let e of es) {
      if (!MeshHandleDef.isOn(e)) {
        // TODO(@darzu): how should we handle instancing?
        // TODO(@darzu): this seems somewhat inefficient to look for this every frame
        const meshHandle = res.renderer.renderer.addMesh(e.renderable.mesh);
        em.addComponent(e.id, MeshHandleDef, meshHandle);
      }
    }
  });
}
