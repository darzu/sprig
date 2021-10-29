import { quat, vec3 } from "./gl-matrix.js";
import { MotionProps } from "./phys_motion.js";

export interface BoatProps {
  speed: number;
  wheelSpeed: number;
  wheelDir: number;
}

export function createBoatProps(): BoatProps {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
}

export interface BoatObj {
  id: number;
  boat: BoatProps;
  motion: MotionProps;
}

export function stepBoats(objDict: Record<number, BoatObj>, dt: number) {
  const objs = Object.values(objDict);

  for (let o of objs) {
    const rad = o.boat.wheelSpeed * dt;
    o.boat.wheelDir += rad;

    // rotate
    quat.rotateY(o.motion.rotation, o.motion.rotation, rad);

    // rotate velocity
    vec3.rotateY(
      o.motion.linearVelocity,
      [o.boat.speed, 0, 0],
      [0, 0, 0],
      o.boat.wheelDir
    );
  }
}
