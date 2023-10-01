import { PoseDef, tweenToPose } from "../animation/skeletal.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { SpaceSuitDef } from "./space-suit-controller.js";

export const PlayerRenderDef = EM.defineNonupdatableComponent(
  "playerRender",
  (
    follow?: EntityW<
      [typeof PositionDef, typeof RotationDef, typeof SpaceSuitDef]
    >
  ) => ({
    follow: follow
      ? createRef(follow)
      : createRef(0, [PositionDef, RotationDef, SpaceSuitDef]),
    // radians per millisecond we're willing to rotate
    maxRotationAnglePerMs: Math.PI / 1000,
  })
);

enum Poses {
  Bind = 0,
  Up,
  Right,
  Left,
  Down,
  Forward,
  Back,
}

const TWEENING_TIME = 500;

EM.addEagerInit([PlayerRenderDef], [], [], () => {
  EM.addSystem(
    "playerAnimate",
    Phase.POST_GAME_PLAYERS,
    [PlayerRenderDef, PositionDef, RotationDef, PoseDef],
    [TimeDef],
    (es, res) => {
      for (let e of es) {
        const player = e.playerRender.follow();
        if (!player) {
          continue;
        }
        // for now just set the rendered position = to player position--no smoothing
        vec3.copy(e.position, player.position);

        // move rendered location towards player rotation
        const angle = quat.getAngle(e.rotation, player.rotation);
        if (angle) {
          const maxRotationAngle =
            e.playerRender.maxRotationAnglePerMs * res.time.dt;
          const slerpAmount = Math.min(1.0, maxRotationAngle / angle);
          quat.slerp(e.rotation, player.rotation, slerpAmount, e.rotation);
        }
        // moving forward?
        if (player.spaceSuit.localAccel[2] < 0) {
          tweenToPose(e, Poses.Forward, TWEENING_TIME);
        }
      }
    }
  );
});
