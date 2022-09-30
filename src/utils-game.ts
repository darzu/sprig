import { ColorDef } from "./color-ecs.js";
import { EM, Entity, EntityW } from "./entity-manager.js";
import { AssetsDef } from "./game/assets.js";
import { vec3 } from "./gl-matrix.js";
import { Line } from "./physics/broadphase.js";
import { PositionDef, ScaleDef } from "./physics/transform.js";
import { MeshHandle } from "./render/mesh-pool.js";
import { Mesh } from "./render/mesh.js";
import {
  Renderable,
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "./render/renderer-ecs.js";
import { tempVec3 } from "./temp-pool.js";

// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
// TODO(@darzu): this whole line pool thing needs a hard rethink; it might be okay but it's pretty hacky rn
const _linePool: EntityW<[typeof RenderableDef]>[] = [];
const _linePoolLimit = 100;
let _linePoolNext = 0;
export async function drawLine2(line: Line, color: vec3) {
  const end = vec3.add(
    tempVec3(),
    line.ray.org,
    vec3.scale(tempVec3(), line.ray.dir, line.len)
  );
  return drawLine(line.ray.org, end, color);
}
export async function drawLine(start: vec3, end: vec3, color: vec3) {
  start = vec3.clone(start);
  const start2 = vec3.add(vec3.create(), start, [0.2, 0.2, 0.2]);
  end = vec3.clone(end);
  const end2 = vec3.add(vec3.create(), end, [0.1, 0.1, 0.1]);

  const pos = [start, start2, end2, end];

  if (_linePool.length >= _linePoolLimit) {
    const e = _linePool[_linePoolNext];
    _linePoolNext++;
    if (_linePoolNext >= _linePool.length) _linePoolNext = 0;

    const m = e.renderable.meshHandle.readonlyMesh!;

    m.pos = pos;
    m.colors = [color, color];

    const res = await EM.whenResources(RendererDef);
    res.renderer.renderer.updateMesh(e.renderable.meshHandle, m);
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
  const start2 = vec3.add(vec3.create(), start, [0.2, 0.2, 0.2]);
  end = vec3.clone(end);
  const end2 = vec3.add(vec3.create(), end, [0.1, 0.1, 0.1]);

  const pos = [start, start2, end2, end];

  const e = EM.newEntity();
  EM.ensureComponentOn(e, ColorDef, color);
  const m: Mesh = {
    pos,
    tri: [],
    // TODO(@darzu): HACK
    quad: [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
    ],
    colors: [color, color],
    // TODO(@darzu): use line rendering!
    // lines: [[0, 1]],
    surfaceIds: [1, 2],
    usesProvoking: true,
  };
  EM.ensureComponentOn(e, RenderableConstructDef, m);
  EM.ensureComponentOn(e, PositionDef);

  return e;
}

export async function drawBall(
  pos: vec3,
  size: number,
  color: vec3
): Promise<EntityW<[typeof PositionDef]>> {
  let res = await EM.whenResources(AssetsDef);
  const e = EM.newEntity();
  EM.ensureComponentOn(e, ColorDef, color);
  EM.ensureComponentOn(e, RenderableConstructDef, res.assets.ball.proto);
  EM.ensureComponentOn(e, PositionDef, pos);
  EM.ensureComponentOn(e, ScaleDef, [size, size, size]);
  return e;
}

export async function randomizeMeshColors(e: Entity) {
  const res = await EM.whenResources(RendererDef);
  const e2 = await EM.whenEntityHas(e, RenderableDef);
  const meshH = e2.renderable.meshHandle;
  const mesh = meshH.readonlyMesh!;
  for (let c of mesh.colors)
    vec3.set(c, Math.random(), Math.random(), Math.random());
  res.renderer.renderer.updateMesh(meshH, mesh);
}
