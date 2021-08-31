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

  let collidesWith: CollidesWith | null = null;

  // update AABBs
  for (let o of objs) {
    vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
  }

  collidesWith = checkCollisions(objs);

  const PAD = 0.01;
  const objMovFracs: { [id: number]: number } = {};

  // solid object order maintenance
  for (let [aId, bId] of collisionPairs(collidesWith)) {
    const a = objDict[aId];
    const b = objDict[bId];

    // for each of X,Y,Z dimensions
    for (let i of [0, 1, 2]) {
      const left = a.lastMotion.location[i] < b.lastMotion.location[i] ? a : b;
      const right = a.lastMotion.location[i] < b.lastMotion.location[i] ? b : a;

      const overlap = left.worldAABB.max[i] - right.worldAABB.min[i];
      if (overlap < 0) continue; // no overlap to deal with

      const leftMaxContrib = Math.max(
        0,
        left.motion.location[i] - left.lastMotion.location[i]
      );
      const rightMaxContrib = Math.max(
        0,
        right.lastMotion.location[i] - right.motion.location[i]
      );
      if (leftMaxContrib + rightMaxContrib < overlap)
        // we can't get unstuck going backward, so don't try
        // maybe we'll tunnel through
        continue;
      if (leftMaxContrib === 0 && rightMaxContrib === 0)
        // no movement possible or necessary
        continue;

      // TODO(@darzu): wait, these fractions are slightly wrong, I need to account for leftFracRemaining
      // find F such that F * (leftMaxContrib + rightMaxContrib) >= overlap
      const f = Math.min(1.0, overlap / (leftMaxContrib + rightMaxContrib));
      if (f <= 0 || 1 < f)
        // TODO(@darzu): DEBUG
        console.error(
          `Invalid fraction: ${f}, overlap: ${overlap}, leftMaxContrib: ${leftMaxContrib} rightMaxContrib: ${rightMaxContrib}`
        );

      console.log(
        `f: ${f}, o: ${overlap}, l: ${leftMaxContrib}, r: ${rightMaxContrib}`
      );

      if (0 < leftMaxContrib)
        objMovFracs[left.id] = Math.max(objMovFracs[left.id] || 0, f);
      if (0 < rightMaxContrib)
        objMovFracs[right.id] = Math.max(objMovFracs[right.id] || 0, f);
    }
  }

  // adjust objects backward to compensate for collisions
  for (let a of objs) {
    let movFrac = objMovFracs[a.id];
    if (movFrac) {
      // TODO(@darzu): use last location not linear velocity
      vec3.scale(_collisionRefl, a.motion.linearVelocity, -movFrac * dt);
      vec3.add(a.motion.location, a.motion.location, _collisionRefl);
    }
  }

  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith: collidesWith!,
  };
}
