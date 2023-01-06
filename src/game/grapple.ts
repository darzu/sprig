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
import { ColorDef } from "../color-ecs.js";
import { InteractableDef } from "./interact.js";

const DBG_GRAPPLE = false;

export async function registerGrappleDbgSystems(em: EntityManager) {
  if (!DBG_GRAPPLE) return;

  const res = await em.whenResources(AssetsDef);
  const h = em.newEntity();
  em.set(h, PositionDef, vec3.clone([0, 0, 0]));
  em.set(h, ColorDef, vec3.clone([0.1, 0.1, 0.1]));
  em.set(h, RenderableConstructDef, res.assets.grappleHook.proto);

  const g = em.newEntity();
  em.set(g, PositionDef, vec3.clone([0, 0, 0]));
  em.set(g, ColorDef, vec3.clone([0.1, 0.1, 0.1]));
  em.set(g, RenderableConstructDef, res.assets.grappleGun.proto);
}
