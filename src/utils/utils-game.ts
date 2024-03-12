import { CameraView } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM, Entity, EntityW } from "../ecs/entity-manager.js";
import {
  AllMeshesDef,
  BallMesh,
  GizmoMesh,
  PlaneMesh,
  UnitCubeMesh,
  UnitPlaneMesh,
} from "../meshes/mesh-list.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { remap } from "./math.js";
import { getLineEnd, Line, Ray } from "../physics/broadphase.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { MeshHandle } from "../render/mesh-pool.js";
import {
  Mesh,
  getAABBFromMesh,
  mergeMeshes,
  scaleMesh,
  transformMesh,
} from "../meshes/mesh.js";
import {
  Renderable,
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { aabbDbg, randNormalPosVec3, vec3Dbg } from "./utils-3d.js";
import { createEntityPool } from "../ecs/entity-pool.js";
import { DeadDef } from "../ecs/delete.js";
import { Collider, ColliderDef } from "../physics/collider.js";
import { ENDESGA16 } from "../color/palettes.js";
import { AABB, getSizeFromAABB, isValidAABB } from "../physics/aabb.js";
import { createObj, mixinObj } from "../graybox/objects.js";
import { PI } from "./util-no-import.js";
import { createGizmoMesh } from "../debug/gizmos.js";

// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
// TODO(@darzu): this whole line pool thing needs a hard rethink; it might be okay but it's pretty hacky rn
// TODO(@darzu): use entity pool
const _linePool: EntityW<[typeof RenderableDef]>[] = [];
const _linePoolLimit = 100;
let _linePoolNext = 0;
export async function drawLine2(line: Line, color: V3) {
  const end = getLineEnd(V3.tmp(), line);
  return drawLine(line.ray.org, end, color);
}
export async function drawLine(start: V3, end: V3, color: V3) {
  start = V3.clone(start);
  const start2 = V3.add(start, [0.2, 0.2, 0.2], V3.mk());
  end = V3.clone(end);
  const end2 = V3.add(end, [0.1, 0.1, 0.1], V3.mk());

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
export function createLine(start: V3, end: V3, color: V3) {
  start = V3.clone(start);
  const start2 = V3.add(start, [0.2, 0.2, 0.2], V3.mk());
  end = V3.clone(end);
  const end2 = V3.add(end, [0.1, 0.1, 0.1], V3.mk());

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
  pos: V3.InputT,
  size: number,
  color: V3.InputT
): EntityW<[typeof PositionDef]> {
  const e = _ballPool.spawn();
  V3.copy(e.color, color);
  V3.copy(e.position, pos);
  V3.set(size, size, size, e.scale);
  return e;
}

// TODO(@darzu): MOVE TO SKETCHER
// TODO(@darzu): Use pool!
type DrawPlaneOpt = {
  norm: V3.InputT;
  color?: V3.InputT;
} & (
  | {
      center: V3.InputT;
      halfsize?: number;
    }
  | {
      corner1: V3.InputT;
      corner2: V3.InputT;
    }
);
export function drawPlane(opt: DrawPlaneOpt): EntityW<[typeof PositionDef]> {
  const e = createObj([ColorDef] as const, {
    color: opt.color ?? ENDESGA16.darkGray,
  });
  // TODO(@darzu): BROKEN!
  if ("center" in opt) {
    const scale = (opt.halfsize ?? 1.0) / 5;
    mixinObj(
      e,
      [PositionDef, RenderableConstructDef, ScaleDef, RotationDef] as const,
      {
        position: [0, 0, 0],
        renderableConstruct: [PlaneMesh],
        scale: [scale, scale, scale],
        rotation: quat.fromUp(opt.norm),
      }
    );
    return e;
  } else if ("corner1" in opt) {
    const _1to2 = V3.sub(opt.corner2, opt.corner1);
    const orig = [
      Math.min(opt.corner1[0], opt.corner2[0]),
      Math.min(opt.corner1[0], opt.corner2[0]),
      Math.min(opt.corner1[0], opt.corner2[0]),
    ];
    const height = Math.abs(_1to2[2]);
    const len = V2.len([_1to2[0], _1to2[1]]);
    const yaw = V2.getYaw([opt.norm[0], opt.norm[1]]);
    const rot = quat.tmp();
    quat.pitch(rot, PI / 2, rot);
    quat.yaw(rot, yaw, rot);
    mixinObj(
      e,
      [PositionDef, RenderableConstructDef, ScaleDef, RotationDef] as const,
      {
        position: [0, 0, 0],
        renderableConstruct: [PlaneMesh],
        scale: [len, height, 1],
        rotation: rot,
      }
    );
    throw "TODO wip";
    // return e;
  } else throw "todo";
}

export async function randomizeMeshColors(e: Entity) {
  const res = await EM.whenResources(RendererDef);
  const e2 = await EM.whenEntityHas(e, RenderableDef);
  const meshH = e2.renderable.meshHandle;
  const mesh = meshH.mesh!;
  for (let c of mesh.colors)
    V3.set(Math.random(), Math.random(), Math.random(), c);
  res.renderer.renderer.stdPool.updateMeshVertices(meshH, mesh);
}

export function screenPosToWorldPos(
  out: V3,
  screenPos: V2,
  cameraComputed: CameraView,
  screenDepth: number = 0
): V3 {
  const invViewProj = cameraComputed.invViewProj;

  const viewX = remap(screenPos[0], 0, cameraComputed.width, -1, 1);
  const viewY = remap(screenPos[1], 0, cameraComputed.height, 1, -1);
  const viewPos3 = V3.set(viewX, viewY, screenDepth);

  return V3.tMat4(viewPos3, invViewProj, out);
}

export function screenPosToRay(screenPos: V2, cameraComputed: CameraView): Ray {
  const origin = screenPosToWorldPos(V3.mk(), screenPos, cameraComputed, -1);
  const target = screenPosToWorldPos(V3.tmp(), screenPos, cameraComputed, 0);

  const dir = V3.sub(target, origin, V3.mk());
  V3.norm(dir, dir);

  const r: Ray = {
    org: origin,
    dir,
  };

  return r;
}

export function randColor(v?: V3): V3 {
  return randNormalPosVec3(v);
}

export function addGizmoChild(
  parent: Entity,
  scale: number = 1,
  offset: V3.InputT = [0, 0, 0]
): Entity {
  // TODO(@darzu): Doesn't need to be async!
  // make debug gizmo
  const gizmo = EM.new();
  EM.set(gizmo, PositionDef, V3.clone(offset));
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
  return worldGizmo;
}

// TODO(@darzu): MOVE TO SKETCHER
export function drawGizmosForMat4(m: mat4, scale: number) {
  // const g1 = createGizmoMesh();
  // scaleMesh(g1, scale);
  const g2 = createGizmoMesh();
  scaleMesh(g2, scale);
  transformMesh(g2, m);
  // const newX = V3.tMat4([1,0,0], m);
  // const newY = V3.tMat4([0,1,0], m);
  // const newZ = V3.tMat4([0,0,1], m);

  // createLineMesh(0.1, [0.05, 0, 0], [1, 0, 0]);

  // const mesh = mergeMeshes(g1, g2);
  const mesh = g2;

  const ent = EM.new();
  EM.set(ent, PositionDef);
  EM.set(ent, RenderableConstructDef, mesh);
  return ent;
}

export function createBoxForAABB(
  aabb: AABB
): EntityW<
  [typeof PositionDef, typeof ScaleDef, typeof RenderableConstructDef]
> {
  const scale = getSizeFromAABB(aabb, V3.mk());
  const offset = V3.clone(aabb.min);

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
