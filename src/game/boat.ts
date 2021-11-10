import { DefineComponent, EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion } from "../phys_motion.js";

export interface Boat {
  speed: number;
  wheelSpeed: number;
  wheelDir: number;
}

export const BoatDef = DefineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
});

export function stepBoats(
  objs: { boat: Boat; motion: Motion }[],
  { time }: { time: { dt: number } }
) {
  for (let o of objs) {
    const rad = o.boat.wheelSpeed * time.dt;
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
