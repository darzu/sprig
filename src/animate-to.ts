// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?
// TODO(@darzu): support more: https://easings.net/#

import { EM } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";
import { onInit } from "./init.js";
import { PositionDef } from "./physics/transform.js";
import { PhysicsTimerDef } from "./time.js";

export type EaseFn = (percent: number) => number;

export interface AnimateTo {
  // TODO(@darzu): support rotation, other properties?
  startPos: vec3;
  endPos: vec3;
  easeFn: EaseFn;
  durationMs: number;
  progressMs: number;
  // TODO(@darzu): pathFn
}

export const EASE_LINEAR: EaseFn = (p) => p;
export const EASE_OUTQUAD: EaseFn = (p) => 1 - (1 - p) ** 2;

export const AnimateToDef = EM.defineComponent(
  "animateTo",
  function (a: Partial<AnimateTo>): AnimateTo {
    return {
      startPos: a.startPos ?? vec3.create(),
      endPos: a.endPos ?? vec3.create(),
      easeFn: a.easeFn ?? EASE_LINEAR,
      durationMs: a.durationMs ?? 1000,
      progressMs: 0,
    };
  }
);

onInit(() => {
  let delta = vec3.create();

  EM.registerSystem(
    [AnimateToDef, PositionDef],
    [PhysicsTimerDef],
    (cs, res) => {
      let toRemove: number[] = [];

      const dt = res.physicsTimer.period;
      for (let c of cs) {
        c.animateTo.progressMs += dt;

        const percentTime = c.animateTo.progressMs / c.animateTo.durationMs;

        if (percentTime >= 1.0) {
          toRemove.push(c.id);
          vec3.copy(c.position, c.animateTo.endPos);
          continue;
        }

        const percentPath = c.animateTo.easeFn(percentTime);

        vec3.sub(delta, c.animateTo.endPos, c.animateTo.startPos);

        // TODO(@darzu): support other (non-linear) paths
        vec3.scale(delta, delta, percentPath);

        vec3.add(c.position, c.animateTo.startPos, delta);
      }

      // clean up finished
      for (let id of toRemove) {
        EM.removeComponent(id, AnimateToDef);
      }
    },
    "animateTo"
  );
});
