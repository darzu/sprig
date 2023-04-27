import { EM, EntityManager } from "../entity-manager.js";
import { vec3, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { TimeDef } from "../time.js";
import { PositionDef } from "../physics/transform.js";

export interface ParamProjectile {
  pos: vec3;
  vel: vec3;
  accel: vec3;
}

export const ParametricDef = EM.defineComponent(
  "parametric",
  (init?: ParamProjectile, startMs?: number) => {
    return {
      init: init ?? {
        pos: V(0, 0, 0),
        vel: V(0, 1, 0),
        accel: V(0, 0, 0),
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
        projectilePosition(
          e.parametric.init.pos,
          e.parametric.init.vel,
          e.parametric.init.accel,
          res.time.time - e.parametric.startMs,
          e.position
        );
      }
    },
    "updateParametricMotion"
  );
});

export function projectilePosition(
  pos: vec3,
  vel: vec3,
  accel: vec3,
  t: number,
  out?: vec3
): vec3 {
  out = out ?? vec3.tmp();
  out[0] = pos[0] + vel[0] * t + accel[0] * t * t;
  out[1] = pos[1] + vel[1] * t + accel[1] * t * t;
  out[2] = pos[2] + vel[2] * t + accel[2] * t * t;
  return out;
}

// TODO(@darzu): determine the right angle to hit the player
// TODO(@darzu): determine the right angle to maximize distance
// TODO(@darzu): determine the angles that will miss the player
// TODO(@darzu): determine the angles that will miss the player
// TODO(@darzu): determine the velocity and gravity parameters that allows range X

// export function paramProjectileStats(start: ParamProjectile) {
//   // y(t) = y0 + vy * t + ay * t * t;
//   // 0 = y0 + vy * t + ay * t * t;
//   // quadradic equation
//   // t = (-vy +- sqrt(vy**2 - 4*ay*y0)) / 2*ay
//   // TODO(@darzu):
//   const vy = start.vel[1];
//   const y0 = start.pos[1];
//   const ay = start.grav[1];

//   const yZeroT = ((-vy + -sqrt(vy ** 2 - 4 * ay * y0)) / 2) * ay;
// }
