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

export function stepPhysics(
  objDict: Record<number, PhysicsObject>,
  dt: number
): PhysicsResults {
  const objs = Object.values(objDict);

  moveObjects(objs, dt);

  // update AABBs
  for (let o of objs) {
    vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
  }

  const collidesWith = checkCollisions(objs);

  // TODO(@darzu): fix physics overlaps

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith,
  };
}

function fixOverlaps(
  objs: Record<number, PhysicsObject>,
  collidesWith: CollidesWith
) {}