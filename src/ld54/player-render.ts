import {
  clearAnimationQueue,
  PoseDef,
  tweenToPose,
  queuePose,
} from "../animation/skeletal.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { quat, V3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { SWORD_SWING_DURATION } from "./gamestate.js";
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
    wasJustAccelerating: false,
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
  Sword0,
  Sword1,
  Sword2,
  Sword3,
}

const TWEENING_TIME = 500;

const SWORD_SWING_TIMINGS = [0.35, 0.35, 0.15, 0.15];

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
        V3.copy(e.position, player.position);
        // move rendered location towards player rotation
        const angle = quat.getAngle(e.rotation, player.rotation);
        if (angle) {
          const maxRotationAngle =
            e.playerRender.maxRotationAnglePerMs * res.time.dt;
          const slerpAmount = Math.min(1.0, maxRotationAngle / angle);
          quat.slerp(e.rotation, player.rotation, slerpAmount, e.rotation);
        }

        // sword animations
        if (player.spaceSuit.swingingSword) {
          // did we just start swinging?
          if (player.spaceSuit.swordSwingT === 0) {
            clearAnimationQueue(e);
            tweenToPose(
              e,
              Poses.Sword0,
              SWORD_SWING_TIMINGS[0] * SWORD_SWING_DURATION
            );
            queuePose(
              e,
              Poses.Sword1,
              SWORD_SWING_TIMINGS[1] * SWORD_SWING_DURATION
            );
            queuePose(
              e,
              Poses.Sword2,
              SWORD_SWING_TIMINGS[2] * SWORD_SWING_DURATION
            );
            queuePose(
              e,
              Poses.Sword3,
              SWORD_SWING_TIMINGS[3] * SWORD_SWING_DURATION
            );
          }
          // don't run other animations
          break;
        }

        // want to trigger the relaxation to bind pose just once
        if (V3.sqrLen(player.spaceSuit.localAccel) === 0) {
          if (e.playerRender.wasJustAccelerating) {
            tweenToPose(e, Poses.Bind, TWEENING_TIME);
          }
          e.playerRender.wasJustAccelerating = false;
        } else {
          e.playerRender.wasJustAccelerating = true;
        }
        // prefer forward, then back, left, right, up, down
        if (player.spaceSuit.localAccel[1] > 0) {
          tweenToPose(e, Poses.Forward, TWEENING_TIME);
        } else if (player.spaceSuit.localAccel[1] < 0) {
          tweenToPose(e, Poses.Back, TWEENING_TIME);
        } else if (player.spaceSuit.localAccel[0] < 0) {
          tweenToPose(e, Poses.Left, TWEENING_TIME);
        } else if (player.spaceSuit.localAccel[0] > 0) {
          tweenToPose(e, Poses.Right, TWEENING_TIME);
        } else if (player.spaceSuit.localAccel[2] > 0) {
          tweenToPose(e, Poses.Up, TWEENING_TIME);
        } else if (player.spaceSuit.localAccel[2] < 0) {
          tweenToPose(e, Poses.Down, TWEENING_TIME);
        }
      }
    }
  );
});
