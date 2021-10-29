import { quat, vec3 } from "./gl-matrix.js";
import { MotionProps, VelocityProps } from "./phys_motion.js";

export interface BoatProps {
  speed: number;
  wheelDir: number;
}

export function createBoatProps(): BoatProps {
  return {
    speed: 0,
    wheelDir: 0,
  };
}

export interface BoatObj {
  id: number;
  boat: BoatProps;
  motion: MotionProps;
  desiredMotion: VelocityProps;
}

export function stepBoats(objDict: Record<number, BoatObj>, dt: number) {
  const objs = Object.values(objDict);

  for (let o of objs) {
    // TODO(@darzu): IMPLEMENT
    // o.desiredMotion.linearVelocity[0] = o.boat.speed;

    // TODO(@darzu): hack to init boat direction
    if (vec3.exactEquals(o.desiredMotion.linearVelocity, [0, 0, 0]))
      o.desiredMotion.linearVelocity[0] = 1.0;

    vec3.normalize(
      o.desiredMotion.linearVelocity,
      o.desiredMotion.linearVelocity
    );
    vec3.scale(
      o.desiredMotion.linearVelocity,
      o.desiredMotion.linearVelocity,
      o.boat.speed
    );

    const rad = o.boat.wheelDir * dt;

    vec3.rotateY(
      o.desiredMotion.linearVelocity,
      o.desiredMotion.linearVelocity,
      [0, 0, 0],
      rad
    );

    quat.rotateY(o.motion.rotation, o.motion.rotation, rad);
  }
}
