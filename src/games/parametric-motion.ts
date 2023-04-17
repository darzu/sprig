import { EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { tempVec3 } from "../temp-pool.js";
import { TimeDef } from "../time.js";
import { PositionDef } from "../physics/transform.js";

export interface ParamProjectile {
  pos: vec3;
  vel: vec3;
  grav: vec3;
}

export const ParametricDef = EM.defineComponent(
  "parametric",
  (init?: ParamProjectile, startMs?: number) => {
    return {
      init: init ?? {
        pos: V(0, 0, 0),
        vel: V(0, 1, 0),
        grav: V(0, 0, 0),
      },
      startMs: startMs ?? 0,
    };
  }
);
// TODO(@darzu): serializer pairs

onInit((em: EntityManager) => {
  em.registerSystem(
    [PositionDef, ParametricDef],
    [TimeDef],
    (es, res) => {
      for (let e of es) {
        paramProjectileFn(
          e.parametric.init,
          res.time.time - e.parametric.startMs,
          e.position
        );
      }
    },
    "updateParametricMotion"
  );
});

export function paramProjectileFn(
  start: ParamProjectile,
  t: number,
  out?: vec3
): vec3 {
  out = out ?? vec3.tmp();
  // TODO(@darzu): HACK. move 0.00001 elsewhere? fix units?
  out[0] = start.pos[0] + start.vel[0] * t + start.grav[0] * 0.00001 * t * t;
  out[1] = start.pos[1] + start.vel[1] * t + start.grav[1] * 0.00001 * t * t;
  out[2] = start.pos[2] + start.vel[2] * t + start.grav[2] * 0.00001 * t * t;
  return out;
}
