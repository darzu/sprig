import { ColorDef } from "./color-ecs.js";
import { EM, Entity, EntityW } from "./entity-manager.js";
import { AssetsDef } from "./game/assets.js";
import { vec3 } from "./gl-matrix.js";
import { PositionDef, ScaleDef } from "./physics/transform.js";
import { Mesh } from "./render/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "./render/renderer-ecs.js";

// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
export function drawLine(start: vec3, end: vec3, color: vec3) {
  const e = EM.newEntity();
  EM.ensureComponentOn(e, ColorDef, color);
  const m: Mesh = {
    pos: [start, end],
    tri: [],
    quad: [],
    colors: [],
    lines: [[0, 1]],
    surfaceIds: [],
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
