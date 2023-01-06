// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?

import { EM } from "./entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "./sprig-matrix.js";
import { onInit } from "./init.js";
import { PositionDef } from "./physics/transform.js";
import { TimeDef } from "./time.js";
import { EaseFn, EASE_LINEAR } from "./util-ease.js";

export interface AnimateTo {
  // TODO(@darzu): support rotation, other properties?
  startPos: vec3;
  endPos: vec3;
  easeFn: EaseFn;
  durationMs: number;
  progressMs: number;
  // TODO(@darzu): pathFn
}

export const AnimateToDef = EM.defineComponent(
  "animateTo",
  function (a?: Partial<AnimateTo>): AnimateTo {
    return {
      startPos: a?.startPos ?? vec3.create(),
      endPos: a?.endPos ?? vec3.create(),
      easeFn: a?.easeFn ?? EASE_LINEAR,
      durationMs: a?.durationMs ?? 1000,
      progressMs: a?.progressMs ?? 0,
    };
  }
);

onInit(() => {
  let delta = vec3.create();

  EM.registerSystem(
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
          vec3.copy(c.position, c.animateTo.startPos);
          continue;
        }

        if (percentTime >= 1.0) {
          toRemove.push(c.id);
          vec3.copy(c.position, c.animateTo.endPos);
          continue;
        }

        const percentPath = c.animateTo.easeFn(percentTime);

        vec3.sub(c.animateTo.endPos, c.animateTo.startPos, delta);

        // TODO(@darzu): support other (non-linear) paths
        // TODO(@darzu): support other (non-linear) paths
        vec3.scale(delta, percentPath, delta);

        vec3.add(c.animateTo.startPos, delta, c.position);
      }

      // clean up finished
      for (let id of toRemove) {
        EM.removeComponent(id, AnimateToDef);
      }
    },
    "animateTo"
  );
});
