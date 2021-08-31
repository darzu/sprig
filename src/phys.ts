import { mat4, quat, vec3 } from "./gl-matrix.js";
import { AABB, checkCollisions, CollidesWith } from "./phys_broadphase.js";
import {
  copyMotionProps,
  MotionProps,
  moveAndCheckObjects as moveObjects,
} from "./phys_motion.js";

export interface PhysicsObject {
  id: number;
  motion: MotionProps;
  lastMotion: MotionProps;
  localAABB: AABB;
  worldAABB: AABB;
}
export interface PhysicsResults {
  collidesWith: CollidesWith;
}

export function stepPhysics(objs: PhysicsObject[], dt: number): PhysicsResults {
  moveObjects(objs, dt);

  // update AABBs
  for (let o of objs) {
    vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
  }

  const collidesWith = checkCollisions(objs);

  // TODO(@darzu): physics overlaps

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith,
  };
}
