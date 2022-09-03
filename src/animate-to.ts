// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?

import { EM } from "./entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "./sprig-matrix.js";
import { onInit } from "./init.js";
import { PositionDef } from "./physics/transform.js";
import { TimeDef } from "./time.js";

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

// NOTE:
//  ideas from: https://easings.net/# (GPLv3, don't use code)
//  code from: https://github.com/Michaelangel007/easing#tldr-shut-up-and-show-me-the-code
export const EASE_LINEAR: EaseFn = (p) => p;
export const EASE_OUTQUAD: EaseFn = (p) => 1 - (1 - p) ** 2;
export const EASE_INQUAD: EaseFn = (p) => p ** 2;
export const EASE_INCUBE: EaseFn = (p) => p ** 3;
export const EASE_OUTBACK: EaseFn = (p) => {
  const m = p - 1;
  const k = 1.70158; // 10% bounce, see Michaelangel007's link for derivation
  return 1 + m * m * (m * (k + 1) + k);
};
export const EASE_INBACK: EaseFn = (p) => {
  const k = 1.70158;
  return p * p * (p * (k + 1) - k);
};
export function EASE_INVERSE(fn: EaseFn): EaseFn {
  return (p) => 1.0 - fn(1.0 - p);
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
