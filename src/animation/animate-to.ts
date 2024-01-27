// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?

import { EM } from "../ecs/entity-manager.js";
import { V2, V3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { EaseFn, EASE_LINEAR } from "../utils/util-ease.js";
import { Phase } from "../ecs/sys-phase.js";

export interface AnimateTo {
  // TODO(@darzu): support rotation, other properties?
  startPos: V3;
  endPos: V3;
  easeFn: EaseFn;
  durationMs: number;
  progressMs: number;
  // TODO(@darzu): pathFn
}

export const AnimateToDef = EM.defineNonupdatableComponent(
  "animateTo",
  function (a?: Partial<AnimateTo>): AnimateTo {
    return {
      startPos: a?.startPos ?? V3.mk(),
      endPos: a?.endPos ?? V3.mk(),
      easeFn: a?.easeFn ?? EASE_LINEAR,
      durationMs: a?.durationMs ?? 1000,
      progressMs: a?.progressMs ?? 0,
    };
  }
);

EM.addEagerInit([AnimateToDef], [], [], () => {
  let delta = V3.mk();

  EM.addSystem(
    "animateTo",
    Phase.PHYSICS_MOTION,
    [AnimateToDef, PositionDef],
    [TimeDef],
    (cs, res) => {
      let toRemove: number[] = [];

      // advance the animation
      for (let c of cs) {
        c.animateTo.progressMs += res.time.dt;

        const percentTime = c.animateTo.progressMs / c.animateTo.durationMs;

        if (percentTime < 0) {
          // outside the time bounds, we're in a start delay
          V3.copy(c.position, c.animateTo.startPos);
          continue;
        }

        if (percentTime >= 1.0) {
          toRemove.push(c.id);
          V3.copy(c.position, c.animateTo.endPos);
          continue;
        }

        const percentPath = c.animateTo.easeFn(percentTime);

        V3.sub(c.animateTo.endPos, c.animateTo.startPos, delta);

        // TODO(@darzu): support other (non-linear) paths
        V3.scale(delta, percentPath, delta);

        V3.add(c.animateTo.startPos, delta, c.position);
      }

      // clean up finished
      for (let id of toRemove) {
        EM.removeComponent(id, AnimateToDef);
      }
    }
  );
});
