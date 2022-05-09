import { ColorDef } from "./color.js";
import { EM, EntityManager } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/nonintersection.js";
import { PositionDef } from "./physics/transform.js";
import { Mesh } from "./render/mesh.js";
import { RenderableConstructDef } from "./render/renderer.js";

// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
export function drawLine(start: vec3, end: vec3, color: vec3) {
  const e = EM.newEntity();
  EM.ensureComponentOn(e, ColorDef, color);
  const m: Mesh = {
    pos: [start, end],
    tri: [],
    colors: [],
    lines: [[0, 1]],
    usesProvoking: true,
  };
  EM.ensureComponentOn(e, RenderableConstructDef, m);
  EM.ensureComponentOn(e, PositionDef);
  return e;
}
