import { CameraView } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import {
  AllMeshesDef,
  BallMesh,
  GizmoMesh,
  UnitCubeMesh,
} from "../meshes/mesh-list.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { remap } from "./math.js";
import { getLineEnd, Line, Ray } from "../physics/broadphase.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import { MeshHandle } from "../render/mesh-pool.js";
import { Mesh } from "../meshes/mesh.js";
import {
  Renderable,
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { aabbDbg, randNormalPosVec3, vec3Dbg } from "./utils-3d.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { DeadDef } from "../ecs/delete.js";
import { Collider, ColliderDef } from "../physics/collider.js";
import { ENDESGA16 } from "../color/palettes.js";
import { AABB, getSizeFromAABB, isValidAABB } from "../physics/aabb.js";

// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
// TODO(@darzu): this whole line pool thing needs a hard rethink; it might be okay but it's pretty hacky rn
const _linePool: EntityW<[typeof RenderableDef]>[] = [];
const _linePoolLimit = 100;
let _linePoolNext = 0;
export async function drawLine2(line: Line, color: vec3) {
  const end = getLineEnd(tempVec3(), line);
  return drawLine(line.ray.org, end, color);
}
export async function drawLine(start: vec3, end: vec3, color: vec3) {
  start = vec3.clone(start);
  const start2 = vec3.add(start, [0.2, 0.2, 0.2], vec3.create());
  end = vec3.clone(end);
  const end2 = vec3.add(end, [0.1, 0.1, 0.1], vec3.create());

  const pos = [start, start2, end2, end];

  if (_linePool.length >= _linePoolLimit) {
    const e = _linePool[_linePoolNext];
    _linePoolNext++;
    if (_linePoolNext >= _linePool.length) _linePoolNext = 0;

    const m = e.renderable.meshHandle.mesh!;

    m.pos = pos;
    m.colors = [color, color];

    const res = await EM.whenResources(RendererDef);
    res.renderer.renderer.stdPool.updateMeshVertices(
      e.renderable.meshHandle,
      m
    );
    return e;
  } else {
    const e = createLine(start, end, color);

    const e2 = await EM.whenEntityHas(e, RenderableDef);
    _linePool.push(e2);
    return e2;
  }
}
export function createLine(start: vec3, end: vec3, color: vec3) {
  start = vec3.clone(start);
  const start2 = vec3.add(start, [0.2, 0.2, 0.2], vec3.create());
  end = vec3.clone(end);
  const end2 = vec3.add(end, [0.1, 0.1, 0.1], vec3.create());

  const pos = [start, start2, end2, end];

  const e = EM.new();
  EM.set(e, ColorDef, color);
  const m: Mesh = {
    pos,
    tri: [],
    // TODO(@darzu): HACK
    quad: [V(0, 1, 2, 3), V(3, 2, 1, 0)],
    colors: [color, color],
    // TODO(@darzu): use line rendering!
    // lines: [[0, 1]],
    surfaceIds: [1, 2],
    usesProvoking: true,
  };
  EM.set(e, RenderableConstructDef, m);
  EM.set(e, PositionDef);

  return e;
}

// TODO(@darzu): turn this into a resource like TowerPoolDef
const _ballPool = createEntityPool<
  [typeof ColorDef, typeof PositionDef, typeof ScaleDef]
>({
  max: 100,
  maxBehavior: "rand-despawn",
  create: () => {
    const e = EM.new();
    EM.set(e, ColorDef);
    EM.set(e, RenderableConstructDef, BallMesh);
    EM.set(e, PositionDef);
    EM.set(e, ScaleDef);
    return e;
  },
  onSpawn: (e) => {
    EM.tryRemoveComponent(e.id, DeadDef);
  },
  onDespawn: (e) => {
    EM.set(e, DeadDef);
    e.dead.processed = true;
  },
});

// TODO(@darzu): refactor w/ gizmos and arrows and pooling
export function drawBall(
  pos: vec3.InputT,
  size: number,
  color: vec3.InputT
): EntityW<[typeof PositionDef]> {
  const e = _ballPool.spawn();
  vec3.copy(e.color, color);
  vec3.copy(e.position, pos);
  vec3.set(size, size, size, e.scale);
  return e;
}

export async function randomizeMeshColors(e: Entity) {
  const res = await EM.whenResources(RendererDef);
  const e2 = await EM.whenEntityHas(e, RenderableDef);
  const meshH = e2.renderable.meshHandle;
  const mesh = meshH.mesh!;
  for (let c of mesh.colors)
    vec3.set(Math.random(), Math.random(), Math.random(), c);
  res.renderer.renderer.stdPool.updateMeshVertices(meshH, mesh);
}

export function screenPosToWorldPos(
  out: vec3,
  screenPos: vec2,
  cameraComputed: CameraView,
  screenDepth: number = 0
): vec3 {
  const invViewProj = cameraComputed.invViewProj;

  const viewX = remap(screenPos[0], 0, cameraComputed.width, -1, 1);
  const viewY = remap(screenPos[1], 0, cameraComputed.height, 1, -1);
  const viewPos3 = vec3.set(viewX, viewY, screenDepth);

  return vec3.transformMat4(viewPos3, invViewProj, out);
}

export function screenPosToRay(
  screenPos: vec2,
  cameraComputed: CameraView
): Ray {
  const origin = screenPosToWorldPos(
    vec3.create(),
    screenPos,
    cameraComputed,
    -1
  );
  const target = screenPosToWorldPos(tempVec3(), screenPos, cameraComputed, 0);

  const dir = vec3.sub(target, origin, vec3.create());
  vec3.normalize(dir, dir);

  const r: Ray = {
    org: origin,
    dir,
  };

  return r;
}

export function randColor(v?: vec3): vec3 {
  return randNormalPosVec3(v);
}

export function addGizmoChild(
  parent: Entity,
  scale: number = 1,
  offset: vec3.InputT = [0, 0, 0]
): Entity {
  // TODO(@darzu): Doesn't need to be async!
  // make debug gizmo
  const gizmo = EM.new();
  EM.set(gizmo, PositionDef, vec3.clone(offset));
  EM.set(gizmo, ScaleDef, V(scale, scale, scale));
  EM.set(gizmo, PhysicsParentDef, parent.id);
  EM.set(gizmo, RenderableConstructDef, GizmoMesh);
  return gizmo;
}

export function addWorldGizmo(origin = V(0, 0, 0), scale = 5) {
  const worldGizmo = EM.new();
  EM.set(worldGizmo, PositionDef, origin);
  EM.set(worldGizmo, ScaleDef, V(scale, scale, scale));
  EM.set(worldGizmo, RenderableConstructDef, GizmoMesh);
}

export function createBoxForAABB(
  aabb: AABB
): EntityW<
  [typeof PositionDef, typeof ScaleDef, typeof RenderableConstructDef]
> {
  const scale = getSizeFromAABB(aabb, vec3.create());
  const offset = vec3.clone(aabb.min);

  const box = EM.new();
  EM.set(box, PositionDef, offset);
  EM.set(box, ScaleDef, scale);
  console.log(`createBoxForAABB scale ${vec3Dbg(scale)}`);
  EM.set(box, RenderableConstructDef, UnitCubeMesh);
  return box;
}

export function addColliderDbgVis(ent: EntityW<[typeof ColliderDef]>): void {
  addColliderDbgVisForCollider(ent.collider);

  function addColliderDbgVisForCollider(c: Collider) {
    if (c.shape === "AABB") {
      if (!isValidAABB(c.aabb))
        console.warn(`invalid aabb: ${aabbDbg(c.aabb)}`);

      const box = createBoxForAABB(c.aabb);
      EM.set(box, PhysicsParentDef, ent.id);
      const color = c.solid ? ENDESGA16.darkGray : ENDESGA16.lightGray;
      EM.set(box, ColorDef, color); // TODO(@darzu): use transparency?
    } else if (c.shape === "Multi") {
      c.children.forEach(addColliderDbgVisForCollider);
    } else {
      console.error(`TODO: impl addColliderDbgVis for ${c.shape}`);
    }
  }
}
