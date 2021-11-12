import {
  ComponentDef,
  EntityManager,
  EM,
  TimeDef,
  Entity,
} from "./entity-manager.js";
import { ColorDef } from "./game/game.js";
import {
  CameraDef,
  CameraProps,
  PlayerEnt,
  PlayerEntDef,
} from "./game/player.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { _gameState, _renderer } from "./main.js";
import { Mesh, MeshHandle, MeshHandleDef } from "./mesh-pool.js";
import { Motion, MotionDef } from "./phys_motion.js";
import { tempQuat, tempVec } from "./temp-pool.js";

export type Component<DEF> = DEF extends ComponentDef<any, infer P> ? P : never;

const SMOOTH = true;

export const TransformDef = EM.defineComponent("transform", () => {
  return mat4.create();
});
export type Transform = mat4;

export const MotionErrorDef = EM.defineComponent("motionError", () => {
  return {
    rotation_error: quat.create(),
    location_error: vec3.create(),
  };
});
export type MotionError = Component<typeof MotionErrorDef>;

export const ParentDef = EM.defineComponent("parent", () => {
  return { id: 0 };
});
export type Parent = Component<typeof ParentDef>;

export const RenderableDef = EM.defineComponent("renderable", () => {
  return {
    mesh: {
      pos: [],
      tri: [],
      colors: [],
    } as Mesh,
  };
});
export type Renderable = Component<typeof RenderableDef>;

type Transformable = {
  id: number;
  motion: Motion;
  transform: Transform;
  renderable: Renderable;
  parent: Parent;
  motionError: MotionError;
};

const _transformables: Map<number, Transformable> = new Map();
const _hasTransformed: Set<number> = new Set();

function updateTransform(o: Transformable) {
  if (_hasTransformed.has(o.id)) return;

  // update transform based on new rotations and positions
  if (o.parent.id > 0) {
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
  } else if (SMOOTH) {
    const working_quat = tempQuat();
    quat.mul(working_quat, o.motion.rotation, o.motionError.rotation_error);
    quat.normalize(working_quat, working_quat);
    mat4.fromRotationTranslation(
      o.transform,
      working_quat,
      vec3.add(tempVec(), o.motion.location, o.motionError.location_error)
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
    [MotionDef, TransformDef, RenderableDef, ParentDef, MotionErrorDef],
    [],
    updateTransforms
  );
}

export const PlayerViewDef = EM.defineComponent("playerView", () => {
  return {
    viewMat: mat4.create(),
  };
});
export type PlayerView = Component<typeof PlayerViewDef>;

interface RenderableObj {
  id: number;
  renderable: Renderable;
  transform: Transform;
  meshHandle: MeshHandle;
}

function stepRenderer(
  objs: RenderableObj[],
  { time, playerView }: { time: { dt: number }; playerView: PlayerView }
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
  _renderer.renderFrame(
    playerView.viewMat,
    objs.map((o) => o.meshHandle)
  );
}

function updatePlayerView(
  players: { player: PlayerEnt; motion: Motion }[],
  resources: { playerView: PlayerView; camera: CameraProps }
) {
  const {
    playerView: { viewMat },
    camera,
  } = resources;

  // TODO(@darzu): ECS check authority and me state
  const mePlayer = players.filter(
    (p) => p === (_gameState.players[_gameState.me]?.entity as any)
  )[0];

  //TODO: this calculation feels like it should be simpler but Doug doesn't
  //understand quaternions.
  let viewMatrix = viewMat;
  mat4.identity(viewMatrix);
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
  return viewMatrix;
}

export function registerRenderer(em: EntityManager) {
  em.addSingletonComponent(PlayerViewDef);

  em.registerSystem(
    [RenderableDef, TransformDef, MeshHandleDef],
    [TimeDef, PlayerViewDef],
    stepRenderer
  );

  em.registerSystem(
    [PlayerEntDef, MotionDef],
    [PlayerViewDef, CameraDef],
    updatePlayerView
  );
}
