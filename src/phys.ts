import { mat4, quat, vec3 } from "./gl-matrix.js";
import {
  AABB,
  checkCollisions,
  CollidesWith,
  collisionPairs,
} from "./phys_broadphase.js";
import { copyMotionProps, MotionProps, moveObjects } from "./phys_motion.js";

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

const _aOverlap = vec3.create();
const _mov = vec3.create();

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

  const collidesWith: CollidesWith = checkCollisions(objs);

  // solid object non-intersection
  for (let [aId, bId] of collisionPairs(collidesWith)) {
    const a = objDict[aId];
    const b = objDict[bId];

    for (let i of [0, 1, 2]) {
      let aLastMov = a.motion.location[i] - a.lastMotion.location[i];
      let bLastMov = b.motion.location[i] - b.lastMotion.location[i];

      let aReflDir = Math.sign(bLastMov - aLastMov);
      if (aReflDir === 0) {
        _aOverlap[i] = 0; // x isn't responsible for this collision
        continue;
      }

      _aOverlap[i] =
        aReflDir > 0
          ? b.worldAABB.max[i] - a.worldAABB.min[i]
          : b.worldAABB.min[i] - a.worldAABB.max[i];
    }

    // TODO(@darzu): consider mass
    const aMovRatio = 0.5;

    vec3.add(
      a.motion.location,
      a.motion.location,
      vec3.scale(_mov, _aOverlap, aMovRatio)
    );
    vec3.sub(
      b.motion.location,
      b.motion.location,
      vec3.scale(_mov, _aOverlap, 1.0 - aMovRatio)
    );
  }

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith,
  };
}
