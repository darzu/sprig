import { mat4, quat, vec3 } from "./gl-matrix.js";
import {
  AABB,
  checkCollisions,
  CollidesWith,
  collisionPairs,
  doesOverlap,
  resetCollidesWithSet,
} from "./phys_broadphase.js";
import {
  checkAtRest,
  copyMotionProps,
  createMotionProps,
  MotionProps,
  moveObjects,
} from "./phys_motion.js";

export interface PhysicsObjectUninit {
  id: number;
  motion: MotionProps;
  lastMotion?: MotionProps;
  localAABB: AABB;
  worldAABB: AABB;
  motionAABB: AABB;
}
export interface PhysicsObject {
  id: number;
  motion: MotionProps;
  lastMotion: MotionProps;
  localAABB: AABB;
  worldAABB: AABB;
  motionAABB: AABB;
}
export interface PhysicsResults {
  collidesWith: CollidesWith;
}

export let _motionPairsLen = 0;

const _collisionVec = vec3.create();
const _collisionOverlap = vec3.create();
const _collisionAdjOverlap = vec3.create();
const _collisionRefl = vec3.create();

const _motionAABBs: { aabb: AABB; id: number }[] = [];

const _collidesWith: CollidesWith = new Map();

export function stepPhysics(
  objDictUninit: Record<number, PhysicsObjectUninit>,
  dt: number
): PhysicsResults {
  // ensure all phys objects are fully initialized
  // TODO(@darzu): this is a little strange
  for (let o of Object.values(objDictUninit))
    if (!o.lastMotion)
      o.lastMotion = copyMotionProps(createMotionProps({}), o.motion);
  const objDict = objDictUninit as Record<number, PhysicsObject>;

  const objs = Object.values(objDict);

  // move objects
  moveObjects(objDict, dt, _collidesWith);

  // over approximation during motion
  let motionCollidesWith: CollidesWith | null = null;

  // actuall collisions
  resetCollidesWithSet(_collidesWith, objs);
  // TODO(@darzu): incorperate this into CollidesWith data struct?
  let collidesWithHashes: { [idSet: number]: boolean } = {};
  function idHash(aId: number, bId: number): number {
    // TODO(@darzu): need a better hash...
    return (aId << 16) & bId;
  }

  // update motion sweep AABBs
  for (let o of objs) {
    for (let i = 0; i < 3; i++) {
      o.motionAABB.min[i] = Math.min(
        o.localAABB.min[i] + o.motion.location[i],
        o.localAABB.min[i] + o.lastMotion.location[i]
      );
      o.motionAABB.max[i] = Math.max(
        o.localAABB.max[i] + o.motion.location[i],
        o.localAABB.max[i] + o.lastMotion.location[i]
      );
    }
  }

  // update "tight" AABBs
  for (let o of objs) {
    vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
  }

  // check for possible collisions using the motion swept AABBs
  if (_motionAABBs.length !== objs.length) _motionAABBs.length = objs.length;
  for (let i = 0; i < objs.length; i++) {
    if (!_motionAABBs[i]) {
      _motionAABBs[i] = {
        id: objs[i].id,
        aabb: objs[i].motionAABB,
      };
    } else {
      _motionAABBs[i].id = objs[i].id;
      _motionAABBs[i].aabb = objs[i].motionAABB;
    }
  }
  motionCollidesWith = checkCollisions(_motionAABBs);
  let motionPairs = [...collisionPairs(motionCollidesWith)];
  _motionPairsLen = motionPairs.length;

  // TODO(@darzu): DEBUG
  // console.log(`pairs: ${motionPairs.map((p) => p.join("v")).join(",")}`);

  // const PAD = 0.01;
  const PAD = 0.001; // TODO(@darzu): not sure if this is wanted
  const COLLISION_ITRS = 100;

  // we'll track which objects have moved each itr,
  // since we just ran dynamics assume everything has moved
  const lastObjMovs: { [id: number]: boolean } = {};
  for (let o of objs) lastObjMovs[o.id] = true;

  // we'll track how much each object should be adjusted each itr
  const nextObjMovFracs: { [id: number]: number } = {};

  // our loop condition
  let anyMovement = true;
  let itr = 0;

  while (anyMovement && itr < COLLISION_ITRS) {
    // TODO(@darzu): DEBUG
    // console.log(`itr: ${itr}`); // TODO(@darzu): DEBUG

    // enumerate the possible collisions, looking for objects that need to pushed apart
    for (let [aId, bId] of motionPairs) {
      // did one of these objects move?
      if (!lastObjMovs[aId] && !lastObjMovs[bId]) continue;

      const a = objDict[aId];
      const b = objDict[bId];

      // TODO(@darzu): IMPLEMENT
      // // is one of these objects dynamic?
      // if (a.motion.atRest && b.motion.atRest) continue;

      if (!doesOverlap(a.worldAABB, b.worldAABB)) {
        // TODO(@darzu): DEBUG
        // console.log(`motion miss ${aId}vs${bId}`);
        // a miss
        continue;
      }

      // record the real collision
      const h = idHash(aId, bId);
      if (!collidesWithHashes[h]) {
        _collidesWith.get(aId)!.push(bId);
        _collidesWith.get(bId)!.push(aId);
        collidesWithHashes[h] = true;
      }

      // determine how to readjust positions
      let aFrac = Infinity;
      let bFrac = Infinity;

      // for each of X,Y,Z dimensions
      // TODO(@darzu): DEBUG
      for (let i of [0, 1, 2]) {
        // determine who is to the left in this dimension
        let left: PhysicsObject;
        let right: PhysicsObject;
        if (a.lastMotion.location[i] < b.lastMotion.location[i]) {
          left = a;
          right = b;
        } else {
          left = b;
          right = a;
        }

        const overlap = left.worldAABB.max[i] - right.worldAABB.min[i];
        if (overlap <= 0) continue; // no overlap to deal with

        const leftMaxContrib = Math.max(
          0,
          left.motion.location[i] - left.lastMotion.location[i]
        );
        const rightMaxContrib = Math.max(
          0,
          right.lastMotion.location[i] - right.motion.location[i]
        );
        if (leftMaxContrib + rightMaxContrib < overlap - PAD * itr) {
          continue;
        }
        if (leftMaxContrib === 0 && rightMaxContrib === 0)
          // no movement possible or necessary
          continue;

        // TODO(@darzu): wait, these fractions are slightly wrong, I need to account for leftFracRemaining
        const f = Math.min(
          1.0,
          (overlap + PAD) / (leftMaxContrib + rightMaxContrib)
        );

        // update the dimension-spanning "a" and "b" fractions
        const aMaxContrib = left === a ? leftMaxContrib : rightMaxContrib;
        const bMaxContrib = left === b ? leftMaxContrib : rightMaxContrib;
        if (0 < aMaxContrib) {
          aFrac = Math.min(aFrac, f);
        }
        if (0 < bMaxContrib) {
          bFrac = Math.min(bFrac, f);
        }
      }

      if (aFrac < Infinity)
        nextObjMovFracs[aId] = Math.max(nextObjMovFracs[aId] || 0, aFrac);
      if (bFrac < Infinity)
        nextObjMovFracs[bId] = Math.max(nextObjMovFracs[bId] || 0, bFrac);
    }

    // adjust objects backward to compensate for collisions
    anyMovement = false;
    for (let o of objs) {
      let movFrac = nextObjMovFracs[o.id];
      if (movFrac) {
        // TODO(@darzu): use last location not linear velocity
        vec3.sub(_collisionRefl, o.lastMotion.location, o.motion.location);
        // vec3.scale(_collisionRefl, _collisionRefl, dt);
        vec3.scale(_collisionRefl, _collisionRefl, movFrac);
        vec3.add(o.motion.location, o.motion.location, _collisionRefl);
        // TODO(@darzu): DEBUG
        // console.log(`moving ${o.id}`);

        // track that movement occured
        anyMovement = true;
      }
    }

    // record which objects moved from this iteration,
    // reset movement fractions for next iteration
    for (let o of objs) {
      lastObjMovs[o.id] = !!nextObjMovFracs[o.id];
      nextObjMovFracs[o.id] = 0;
    }

    // update "tight" AABBs
    for (let o of objs) {
      if (lastObjMovs[o.id]) {
        // TODO(@darzu): DEBUG
        // console.log(`updating worldAABB for ${o.id}`);
        vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
        vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
      }
    }

    itr++;
  }

  // TODO(@darzu): IMPLEMENT "atRest"
  // // check for objects at rest
  // checkAtRest(objs, dt);

  // remember current state for next time
  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith: _collidesWith,
  };
}
