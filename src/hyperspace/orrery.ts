import { ColorDef } from "../color/color-ecs.js";
import { createRef, Ref } from "../ecs/em-helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { vec3, mat4, V } from "../matrix/sprig-matrix.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  ScaleDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { DarkStarPropsDef } from "./darkstar.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys-phase.js";

const ORRERY_SCALE = 0.001;

export async function makeOrrery(parentId: number) {
  const res = await EM.whenResources(AllMeshesDef);
  const orrery = EM.new();
  EM.set(orrery, OrreryDef);
  EM.set(orrery, PhysicsParentDef, parentId);
  EM.set(orrery, PositionDef, V(0, 4, 4));

  // put a ship model at the center of it
  const shipModel = EM.new();
  EM.set(shipModel, PhysicsParentDef, orrery.id);
  EM.set(shipModel, PositionDef, V(0, 0, 0));
  EM.set(shipModel, RenderableConstructDef, res.allMeshes.ship.proto);
  EM.set(
    shipModel,
    ScaleDef,
    V(ORRERY_SCALE * 40, ORRERY_SCALE * 40, ORRERY_SCALE * 40)
  );
  EM.set(shipModel, ColorDef, ENDESGA16.lightBrown);
}

export const OrreryDef = EM.defineComponent("orrery", () => ({
  orreryStars: [] as Ref<[typeof PositionDef, typeof ColorDef]>[],
}));

export function registerOrrerySystems() {
  EM.addSystem(
    "orreryMotion",
    Phase.GAME_WORLD,
    [OrreryDef, WorldFrameDef],
    [AllMeshesDef],
    (es, res) => {
      const stars = EM.filterEntities([
        DarkStarPropsDef,
        WorldFrameDef,
        ColorDef,
      ]);

      for (let orrery of es) {
        // TODO(@darzu): use resizeArray?
        while (orrery.orrery.orreryStars.length < stars.length) {
          const orreryStar = EM.new();
          EM.set(orreryStar, PositionDef);
          EM.set(orreryStar, PhysicsParentDef, orrery.id);
          EM.set(orreryStar, ColorDef);
          EM.set(orreryStar, RenderableConstructDef, res.allMeshes.ball.proto);
          EM.set(orreryStar, ScaleDef, V(0.25, 0.25, 0.25));
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
}
