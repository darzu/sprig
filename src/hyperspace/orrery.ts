import { ColorDef } from "../color/color-ecs.js";
import { createRef, Ref } from "../ecs/em_helpers.js";
import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec3, mat4, V } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "../meshes/assets.js";
import { DarkStarPropsDef } from "./darkstar.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys_phase.js";

const ORRERY_SCALE = 0.001;

export async function makeOrrery(em: EntityManager, parentId: number) {
  const res = await em.whenResources(AssetsDef);
  const orrery = em.new();
  em.ensureComponentOn(orrery, OrreryDef);
  em.ensureComponentOn(orrery, PhysicsParentDef, parentId);
  em.ensureComponentOn(orrery, PositionDef, V(0, 4, 4));

  // put a ship model at the center of it
  const shipModel = em.new();
  em.ensureComponentOn(shipModel, PhysicsParentDef, orrery.id);
  em.ensureComponentOn(shipModel, PositionDef, V(0, 0, 0));
  em.ensureComponentOn(
    shipModel,
    RenderableConstructDef,
    res.assets.ship.proto
  );
  em.ensureComponentOn(
    shipModel,
    ScaleDef,
    V(ORRERY_SCALE * 40, ORRERY_SCALE * 40, ORRERY_SCALE * 40)
  );
  em.ensureComponentOn(shipModel, ColorDef, ENDESGA16.lightBrown);
}

export const OrreryDef = EM.defineComponent("orrery", () => ({
  orreryStars: [] as Ref<[typeof PositionDef, typeof ColorDef]>[],
}));

onInit((em: EntityManager) => {
  em.registerSystem(
    "orreryMotion",
    Phase.GAME_WORLD,
    [OrreryDef, WorldFrameDef],
    [AssetsDef],
    (es, res) => {
      const stars = em.filterEntities([
        DarkStarPropsDef,
        WorldFrameDef,
        ColorDef,
      ]);

      for (let orrery of es) {
        // TODO(@darzu): use resizeArray?
        while (orrery.orrery.orreryStars.length < stars.length) {
          const orreryStar = em.new();
          em.ensureComponentOn(orreryStar, PositionDef);
          em.ensureComponentOn(orreryStar, PhysicsParentDef, orrery.id);
          em.ensureComponentOn(orreryStar, ColorDef);
          em.ensureComponentOn(
            orreryStar,
            RenderableConstructDef,
            res.assets.ball.proto
          );
          em.ensureComponentOn(orreryStar, ScaleDef, V(0.25, 0.25, 0.25));
          orrery.orrery.orreryStars.push(createRef(orreryStar));
        }
        const intoOrrerySpace = mat4.invert(orrery.world.transform);
        stars.forEach((star, i) => {
          const orreryStar = orrery.orrery.orreryStars[i]()!;
          vec3.copy(orreryStar.color, star.color);
          vec3.copy(orreryStar.position, star.world.position);
          vec3.transformMat4(
            orreryStar.position,
            intoOrrerySpace,
            orreryStar.position
          );
          vec3.scale(orreryStar.position, ORRERY_SCALE, orreryStar.position);
        });
      }
    }
  );
});
