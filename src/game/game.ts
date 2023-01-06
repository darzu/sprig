// TODO(@darzu): move other common infrastructure here?

import { CameraFollowDef, setCameraFollowPosition } from "../camera.js";
import { EM, Entity, EntityManager } from "../entity-manager.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ControllableDef } from "./controllable.js";

// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const gameplaySystems: string[] = [];

export const GhostDef = EM.defineComponent("ghost", () => ({}));

export function createGhost() {
  const em: EntityManager = EM;
  const g = em.newEntity();
  em.set(g, GhostDef);
  em.set(g, ControllableDef);
  g.controllable.modes.canFall = false;
  g.controllable.modes.canJump = false;
  // g.controllable.modes.canYaw = true;
  // g.controllable.modes.canPitch = true;
  em.set(g, CameraFollowDef, 1);
  setCameraFollowPosition(g, "firstPerson");
  em.set(g, PositionDef);
  em.set(g, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  em.set(g, LinearVelocityDef);

  return g;
}
