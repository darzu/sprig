import { EM, EntityManager, TimeDef } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { Motion, MotionDef } from "../phys_motion.js";
import { Component } from "../renderer.js";

export const BoatDef = EM.defineComponent("boat", () => {
  return {
    speed: 0,
    wheelSpeed: 0,
    wheelDir: 0,
  };
});
export type Boat = Component<typeof BoatDef>;

function stepBoats(
  boats: { boat: Boat; motion: Motion }[],
  { time }: { time: { dt: number } }
) {
  for (let o of boats) {
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

export function registerStepBoats(em: EntityManager) {
  EM.registerSystem([BoatDef, MotionDef], [TimeDef], stepBoats);
}
