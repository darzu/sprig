// TODO(@darzu): move other common infrastructure here?

import { CameraFollowDef, setCameraFollowPosition } from "../camera/camera.js";
import { EM, Entity } from "../ecs/entity-manager.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ControllableDef } from "../input/controllable.js";

// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const gameplaySystems: string[] = [];

export const GhostDef = EM.defineComponent(
  "ghost",
  () => ({}),
  (p) => p
);

export function createGhost() {
  const g = EM.new();
  EM.ensureComponentOn(g, GhostDef);
  EM.ensureComponentOn(g, ControllableDef);
  g.controllable.modes.canFall = false;
  g.controllable.modes.canJump = false;
  // g.controllable.modes.canYaw = true;
  // g.controllable.modes.canPitch = true;
  EM.ensureComponentOn(g, CameraFollowDef, 1);
  setCameraFollowPosition(g, "firstPerson");
  EM.ensureComponentOn(g, PositionDef);
  EM.ensureComponentOn(g, RotationDef);
  // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
  // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
  EM.ensureComponentOn(g, LinearVelocityDef);

  return g;
}
