import { defineNetEntityHelper } from "../em_helpers.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "./game.js";
import { InteractableDef } from "./interact.js";

const DBG_GRAPPLE = false;

export function registerGrappleDbgSystems(em: EntityManager) {
  if (!DBG_GRAPPLE) return;

  em.registerOneShotSystem(null, [AssetsDef], (_, res) => {
    const h = em.newEntity();
    em.ensureComponentOn(h, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(h, ColorDef, [0.1, 0.1, 0.1]);
    em.ensureComponentOn(
      h,
      RenderableConstructDef,
      res.assets.grappleHook.proto
    );

    const g = em.newEntity();
    em.ensureComponentOn(g, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(g, ColorDef, [0.1, 0.1, 0.1]);
    em.ensureComponentOn(
      g,
      RenderableConstructDef,
      res.assets.grappleGun.proto
    );
  });
}
