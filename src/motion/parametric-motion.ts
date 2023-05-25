import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec3, V, vec2, tV } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { TimeDef } from "../time/time.js";
import { PositionDef } from "../physics/transform.js";
import { assert } from "../utils/util.js";
import { parabolaFromPoints } from "../utils/math.js";
import { Phase } from "../ecs/sys_phase";

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
    "updateParametricMotion",
    Phase.PRE_PHYSICS,
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
    }
  );
});

// NOTE: assumes no air resistance
export function projectilePosition(
  pos: vec3,
  vel: vec3,
  accel: vec3,
  t: number,
  out?: vec3
): vec3 {
  out = out ?? vec3.tmp();
  out[0] = projectilePosition1D(pos[0], vel[0], accel[0], t);
  out[1] = projectilePosition1D(pos[1], vel[1], accel[1], t);
  out[2] = projectilePosition1D(pos[2], vel[2], accel[2], t);
  return out;
}
export function projectilePosition1D(
  x0: number,
  vx: number,
  ax: number,
  t: number
): number {
  return x0 + vx * t + (ax * t * t) / 2;
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

// NOTE: assumes only acceleration is on y and no air resistance
export function projectileTimeOfFlight(
  vy: number,
  y0: number,
  ay: number
): number {
  // console.dir({ vy, y0, ay });
  const s = Math.sqrt(vy ** 2 - 4 * ay * y0);
  const tof1 = (-vy + s) / (2 * ay);
  const tof2 = (-vy - s) / (2 * ay);
  // console.log(`tof1: ${tof1} vs tof2: ${tof2}`);
  // TODO(@darzu): is this right?
  return Math.max(tof1, tof2);
}

export function projectileRange(
  angle: number,
  speed: number,
  y0: number,
  ay: number
) {
  const vy = Math.sin(angle) * speed;
  const tof = projectileTimeOfFlight(vy, y0, ay);
  const range = Math.cos(angle) * speed * tof;
  return range;
}

// TODO(@darzu): generalize into: invertFunctionAsParabola(fn: (x: number) => number, x0: number, x1: number, x2: number): (y: number) => number
export type ProjectileAngleFromRangeFn = (range: number) => number;
export function mkProjectileAngleFromRangeFn(
  y0: number,
  speed: number,
  ay: number
) {
  const data: vec2[] = []; // angle vs range
  for (let angle of [0, Math.PI / 8, Math.PI / 4]) {
    const range = projectileRange(angle, speed, y0, ay);
    data.push(V(range, angle));
  }

  assert(data.length == 3);
  const parabola = parabolaFromPoints(
    data[0][0],
    data[0][1],
    data[1][0],
    data[1][1],
    data[2][0],
    data[2][1]
  );

  const a = parabola[0],
    b = parabola[1],
    c = parabola[2];

  console.log(
    `mkProjectileAngleFromRangeFn parabola: ${a.toFixed(2)}*x^2 + ${b.toFixed(
      2
    )}*x + ${c.toFixed(2)}`
  );

  return (range: number) => a * range ** 2 + b * range + c;
}

// TODO-30: impl and test range->angle w/ polynomial approx
// TODO-30: graph a surface

// export function createBulletPreditor(vy: number, ay: number, y0: number) {
//   // TODO(@darzu):

//   const angleAndRange: [number, number][] = [];

//   const vy = Math.sin(angle) * speed;
//   const tof = bulletTimeOfFlight(vy, y0, -gravity);
//   const vel = vec3.scale(dir, speed);
//   const impact = predictBullet(
//     cannon.world.position,
//     vel,
//     tV(0, -gravity, 0),
//     tof
//   );
// }

// TODO(@darzu): IMPL
// export function bulletRangeToAngle(
//   initPos: vec3,
//   // TODO(@darzu): use velocity vector again so we can work in 3D?
//   initVel: number,
//   grav: vec3,
//   range: number,
//   out?: vec3
// ): number {
//   // range = initPos[0] + vel[0] * t + grav[0] * t * t;
//   // 0 = initPos[1] + vel[1] * t + grav[1] * t * t;
//   // return out;
// }
