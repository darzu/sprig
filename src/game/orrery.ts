import { ColorDef } from "../color.js";
import { createRef, defineNetEntityHelper, Ref } from "../em_helpers.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { InputsDef } from "../inputs.js";
import { clamp } from "../math.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
  ScaleDef,
} from "../physics/transform.js";
import { cloneMesh, mapMeshPositions } from "../render/mesh.js";
import { FLAG_UNLIT } from "../render/pipelines/std-scene.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { tempMat4, tempQuat, tempVec2, tempVec3 } from "../temp-pool.js";
import { range } from "../util.js";
import {
  signedAreaOfTriangle,
  positionAndTargetToOrthoViewProjMatrix,
  vec3Dbg,
} from "../utils-3d.js";
import { YawPitchDef, yawpitchToQuat } from "../yawpitch.js";
import { AssetsDef } from "./assets.js";
import { DarkStarPropsDef, STAR1_COLOR, STAR2_COLOR } from "./darkstar.js";
import { GameState, GameStateDef } from "./gamestate.js";
import {
  BOAT_COLOR,
  PlayerShipLocalDef,
  PlayerShipPropsDef,
} from "./player-ship.js";
import { ShipDef } from "./ship.js";
import { constructNetTurret, TurretDef } from "./turret.js";

const ORRERY_SCALE = 0.001;

export async function makeOrrery(em: EntityManager, parentId: number) {
  const res = await em.whenResources(AssetsDef);
  const orrery = em.newEntity();
  em.ensureComponentOn(orrery, OrreryDef);
  em.ensureComponentOn(orrery, PhysicsParentDef, parentId);
  em.ensureComponentOn(orrery, PositionDef, vec3.clone([0, 4, 4]));

  // put a ship model at the center of it
  const shipModel = em.newEntity();
  em.ensureComponentOn(shipModel, PhysicsParentDef, orrery.id);
  em.ensureComponentOn(shipModel, PositionDef, vec3.clone([0, 0, 0]));
  em.ensureComponentOn(
    shipModel,
    RenderableConstructDef,
    res.assets.ship.proto
  );
  em.ensureComponentOn(shipModel, ScaleDef, vec3.clone([
    ORRERY_SCALE * 40,
    ORRERY_SCALE * 40,
    ORRERY_SCALE * 40,
]));
  em.ensureComponentOn(shipModel, ColorDef, BOAT_COLOR);
}

export const OrreryDef = EM.defineComponent("orrery", () => ({
  orreryStars: [] as Ref<[typeof PositionDef, typeof ColorDef]>[],
}));

onInit((em: EntityManager) => {
  em.registerSystem(
    [OrreryDef, WorldFrameDef],
    [AssetsDef],
    (es, res) => {
      const stars = em.filterEntities([
        DarkStarPropsDef,
        WorldFrameDef,
        ColorDef,
      ]);

      for (let orrery of es) {
        while (orrery.orrery.orreryStars.length < stars.length) {
          const orreryStar = em.newEntity();
          em.ensureComponentOn(orreryStar, PositionDef);
          em.ensureComponentOn(orreryStar, PhysicsParentDef, orrery.id);
          em.ensureComponentOn(orreryStar, ColorDef);
          em.ensureComponentOn(
            orreryStar,
            RenderableConstructDef,
            res.assets.ball.proto
          );
          em.ensureComponentOn(orreryStar, ScaleDef, vec3.clone([0.25, 0.25, 0.25]));
          orrery.orrery.orreryStars.push(createRef(orreryStar));
        }
        const intoOrrerySpace = mat4.invert(orrery.world.transform);
        stars.forEach((star, i) => {
          const orreryStar = orrery.orrery.orreryStars[i]()!;
          vec3.copy(orreryStar.color, star.color);
          vec3.copy(orreryStar.position, star.world.position);
          vec3.transformMat4(orreryStar.position, intoOrrerySpace, orreryStar.position);
          vec3.scale(orreryStar.position, ORRERY_SCALE, orreryStar.position);
        });
      }
    },
    "orreryMotion"
  );
});
