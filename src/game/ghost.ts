import { CameraFollowDef, setCameraFollowPosition } from "../camera.js";
import { EM, EntityManager } from "../entity-manager.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ControllableDef } from "./controllable.js";

export const GhostDef = EM.defineComponent("ghost", () => ({}));

export function createGhost(em: EntityManager) {
  const g = em.newEntity();
  em.ensureComponentOn(g, GhostDef);
  em.ensureComponentOn(g, ControllableDef);
  g.controllable.modes.canFall = false;
  g.controllable.modes.canJump = false;
  em.ensureComponentOn(g, CameraFollowDef, 1);
  setCameraFollowPosition(g, "firstPerson");
  em.ensureComponentOn(g, PositionDef, [-5, -5, -5]);
  em.ensureComponentOn(g, RotationDef);
  em.ensureComponentOn(g, LinearVelocityDef);

  return g;
}
