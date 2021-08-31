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

      // approaches:
      // 1. use velocity constraints
      // 2. use position constraints
      //    This is what we're doing now. why doesn't it work?
      //    Can it work? We could maintain the invariant that
      //      no object can move backward farther than it started
      // 3. step progress movement and collision detection

      // TODO(@darzu): consider mass

      let allMovFrac = 1.0; // TODO(@darzu): needs to be per-object across all collisions

      for (let i of [0, 1, 2]) {
        _collisionVec[i] =
          b.motion.linearVelocity[i] - a.motion.linearVelocity[i];

        _collisionOverlap[i] =
          _collisionVec[i] > 0
            ? b.worldAABB.max[i] - a.worldAABB.min[i]
            : b.worldAABB.min[i] - a.worldAABB.max[i];

        if (_collisionOverlap[i] > 0) {
          let movFrac = Math.min(
            Math.abs(
              (_collisionOverlap[i] + 0.1) /
                (a.motion.linearVelocity[i] - b.motion.linearVelocity[i])
            ),
            1.0
          );
          allMovFrac = Math.min(movFrac, allMovFrac);
        }
      }

      // TODO(@darzu): DEBUGGING
      // console.log(
      //   `${allMovFrac}` +
      //     ` A:(${a.motion.linearVelocity.join(",")})` +
      //     ` B:(${b.motion.linearVelocity.join(",")})`
      // );

      vec3.scale(_collisionRefl, a.motion.linearVelocity, -allMovFrac * dt);
      vec3.add(a.motion.location, a.motion.location, _collisionRefl);
      vec3.scale(_collisionRefl, b.motion.linearVelocity, -allMovFrac * dt);
      console.log(_collisionRefl);
      vec3.add(b.motion.location, b.motion.location, _collisionRefl);
    }
  }

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith: collidesWith!,
  };
}
