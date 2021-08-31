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

const _collisionVec = vec3.create();
const _collisionOverlap = vec3.create();
const _collisionAdjOverlap = vec3.create();
const _collisionRefl = vec3.create();

export function stepPhysics(
  objDict: Record<number, PhysicsObject>,
  dt: number
): PhysicsResults {
  const objs = Object.values(objDict);

  moveObjects(objs, dt);

  const ITRS = 1;

  let collidesWith: CollidesWith | null = null;

  for (let i = 0; i < ITRS; i++) {
    // update AABBs
    for (let o of objs) {
      vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
      vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
    }

    collidesWith = checkCollisions(objs);

    // solid object non-intersection
    for (let [aId, bId] of collisionPairs(collidesWith)) {
      const a = objDict[aId];
      const b = objDict[bId];

      // For AABB:
      // fixing collision means we end with two faces touching
      //    we figure out which faces,
      //    we can know which face was first pushed in based on the vector of collision,
      //    and the overlap of each face,

      // TODO(@darzu): consider mass
      const aMovRatio = 0.5;

      let minAdjOverlap = Infinity;
      let minAdjOverlapDim = 0;

      for (let i of [0, 1, 2]) {
        let aLastMov =
          a.motion.linearVelocity[i] ||
          a.motion.location[i] - a.lastMotion.location[i];
        let bLastMov =
          b.motion.linearVelocity[i] ||
          b.motion.location[i] - b.lastMotion.location[i];

        _collisionVec[i] = bLastMov - aLastMov;

        // if (_collisionVec[i] === 0) {
        //   _collisionOverlap[i] = 0; // x isn't responsible for this collision
        //   continue;
        // }

        _collisionOverlap[i] =
          _collisionVec[i] > 0
            ? b.worldAABB.max[i] - a.worldAABB.min[i]
            : b.worldAABB.min[i] - a.worldAABB.max[i];

        _collisionAdjOverlap[i] = Math.abs(
          _collisionOverlap[i] / _collisionVec[i]
        );

        if (_collisionAdjOverlap[i] < minAdjOverlap) {
          minAdjOverlap = _collisionAdjOverlap[i];
          minAdjOverlapDim = i;
        }
      }

      vec3.scale(
        _collisionRefl,
        _collisionVec,
        minAdjOverlap * aMovRatio * 1.01
      );
      vec3.add(a.motion.location, a.motion.location, _collisionRefl);
      vec3.scale(
        _collisionRefl,
        _collisionVec,
        minAdjOverlap * (1.0 - aMovRatio) * 1.01
      );
      vec3.sub(b.motion.location, b.motion.location, _collisionRefl);

      // a.motion.location[minAdjOverlapDim] +=
      //   _collisionOverlap[minAdjOverlapDim] * aMovRatio * 1.01;
      // b.motion.location[minAdjOverlapDim] -=
      //   _collisionOverlap[minAdjOverlapDim] * (1.0 - aMovRatio) * 1.01;
    }
  }

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith: collidesWith!,
  };
}
