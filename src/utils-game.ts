import { ColorDef } from "./color.js";
import { EM, Entity, EntityW } from "./entity-manager.js";
import { AssetsDef } from "./game/assets.js";
import { vec2, vec3, vec4, quat, mat4 } from "./sprig-matrix.js";
import { PositionDef, ScaleDef } from "./physics/transform.js";
import { Mesh } from "./render/mesh.js";
import { RenderableConstructDef } from "./render/renderer-ecs.js";

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
    lines: [vec2.clone([0, 1])],
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
  EM.ensureComponentOn(e, ScaleDef, vec3.clone([size, size, size]));
  return e;
}
