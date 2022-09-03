import { defineNetEntityHelper } from "../em_helpers.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "../color.js";
import { InteractableDef } from "./interact.js";

const DBG_GRAPPLE = false;

export async function registerGrappleDbgSystems(em: EntityManager) {
  if (!DBG_GRAPPLE) return;

  const res = await em.whenResources(AssetsDef);
  const h = em.newEntity();
  em.ensureComponentOn(h, PositionDef, vec3.clone([0, 0, 0]));
  em.ensureComponentOn(h, ColorDef, vec3.clone([0.1, 0.1, 0.1]));
  em.ensureComponentOn(h, RenderableConstructDef, res.assets.grappleHook.proto);

  const g = em.newEntity();
  em.ensureComponentOn(g, PositionDef, vec3.clone([0, 0, 0]));
  em.ensureComponentOn(g, ColorDef, vec3.clone([0.1, 0.1, 0.1]));
  em.ensureComponentOn(g, RenderableConstructDef, res.assets.grappleGun.proto);
}
