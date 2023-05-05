// TODO(@darzu): move other common infrastructure here?

import { CameraFollowDef, setCameraFollowPosition } from "../camera/camera.js";
import { EM, Entity, EntityManager } from "../ecs/entity-manager.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ControllableDef } from "../input/controllable.js";

// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const gameplaySystems: string[] = [];

export const GhostDef = EM.defineComponent("ghost", () => ({}));

export function createGhost() {
  const em: EntityManager = EM;
  const g = em.new();
  em.ensureComponentOn(g, GhostDef);
  em.ensureComponentOn(g, ControllableDef);
  g.controllable.modes.canFall = false;
  g.controllable.modes.canJump = false;
  // g.controllable.modes.canYaw = true;
  // g.controllable.modes.canPitch = true;
  em.ensureComponentOn(g, CameraFollowDef, 1);
  setCameraFollowPosition(g, "firstPerson");
  em.ensureComponentOn(g, PositionDef);
  em.ensureComponentOn(g, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  em.ensureComponentOn(g, LinearVelocityDef);

  return g;
}
