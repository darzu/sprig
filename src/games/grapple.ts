import { defineNetEntityHelper } from "../ecs/em_helpers.js";
import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { MeDef } from "../net/components.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "../meshes/assets.js";
import { ColorDef } from "../color/color-ecs.js";
import { InteractableDef } from "../input/interact.js";

const DBG_GRAPPLE = false;

export async function registerGrappleDbgSystems(em: EntityManager) {
  if (!DBG_GRAPPLE) return;

  const res = await em.whenResources(AssetsDef);
  const h = em.new();
  em.ensureComponentOn(h, PositionDef, V(0, 0, 0));
  em.ensureComponentOn(h, ColorDef, V(0.1, 0.1, 0.1));
  em.ensureComponentOn(h, RenderableConstructDef, res.assets.grappleHook.proto);

  const g = em.new();
  em.ensureComponentOn(g, PositionDef, V(0, 0, 0));
  em.ensureComponentOn(g, ColorDef, V(0.1, 0.1, 0.1));
  em.ensureComponentOn(g, RenderableConstructDef, res.assets.grappleGun.proto);
}
