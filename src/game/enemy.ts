import { FinishedDef } from "../build.js";
import {
  Component,
  EM,
  Entity,
  EntityManager,
  EntityW,
} from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { cloneMesh, scaleMesh3 } from "../render/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { Assets } from "./assets.js";
import { ColorDef } from "../color.js";

export const EnemyDef = EM.defineComponent("enemy", () => {
  return {
    leftLegId: 0,
    rightLegId: 0,
  };
});

export type Enemy = Component<typeof EnemyDef>;

export function createEnemy(
  em: EntityManager,
  assets: Assets,
  parent: number,
  pos: vec3
): EntityW<[typeof EnemyDef]> {
  const e = em.newEntity();
  em.ensureComponentOn(e, EnemyDef);
  em.ensureComponentOn(e, PositionDef, pos);
  em.ensureComponentOn(e, RotationDef, quat.create());
  const torso = cloneMesh(assets.cube.mesh);
  scaleMesh3(torso, [0.75, 0.75, 0.4]);
  em.ensureComponentOn(e, RenderableConstructDef, torso);
  em.ensureComponentOn(e, ColorDef, [0.2, 0.0, 0]);
  em.ensureComponentOn(e, PhysicsParentDef, parent);

  function makeLeg(x: number): Entity {
    const l = em.newEntity();
    em.ensureComponentOn(l, PositionDef, [x, -1.75, 0]);
    em.ensureComponentOn(l, RenderableConstructDef, assets.cube.proto);
    em.ensureComponentOn(l, ScaleDef, [0.1, 1.0, 0.1]);
    em.ensureComponentOn(l, ColorDef, [0.05, 0.05, 0.05]);
    em.ensureComponentOn(l, PhysicsParentDef, e.id);
    return l;
  }
  e.enemy.leftLegId = makeLeg(-0.5).id;
  e.enemy.rightLegId = makeLeg(0.5).id;
  return e;
}
