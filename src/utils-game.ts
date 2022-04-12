import { ColorDef } from "./color.js";
import { EntityManager } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";
import { WorldFrameDef } from "./physics/nonintersection.js";
import { Mesh } from "./render/mesh-pool.js";
import { RenderableConstructDef } from "./render/renderer.js";

// TODO(@darzu): move this helper elsewhere?
export function drawLine(
  em: EntityManager,
  start: vec3,
  end: vec3,
  color: vec3
) {
  const { id } = em.newEntity();
  em.addComponent(id, ColorDef, color);
  const m: Mesh = {
    pos: [start, end],
    tri: [],
    colors: [],
    lines: [[0, 1]],
    usesProvoking: true,
  };
  em.addComponent(id, RenderableConstructDef, m);
  em.addComponent(id, WorldFrameDef);
}
