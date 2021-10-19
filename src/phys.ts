import { mat4, quat, vec3 } from "./gl-matrix.js";
import { _playerId } from "./main.js";
import {
  AABB,
  checkCollisions,
  collisionPairs,
  doesOverlap,
  doesTouch,
  resetCollidesWithSet,
} from "./phys_broadphase.js";
import {
  checkAtRest,
  copyMotionProps,
  createMotionProps,
  MotionProps,
  moveObjects,
} from "./phys_motion.js";
import { __isSMI } from "./util.js";
import { vec3Dbg } from "./utils-3d.js";

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
  reboundData: Map<IdPair, ReboundData>;
  contactData: Map<IdPair, ContactData>;
}

// TODO(@darzu):
// CollidesWith usage:
//  is a object colliding?
//    which objects is it colliding with?
//  list all colliding pairs
export type CollidesWith = Map<number, number[]>;

export interface ReboundData {
  aId: number;
  bId: number;
  aRebound: number;
  bRebound: number;
  aOverlap: vec3;
  bOverlap: vec3;
}

export interface ContactData {
  aId: number;
  bId: number;
  bToANorm: vec3;
  dist: number;
}

export let _motionPairsLen = 0;

export type IdPair = number;
export function idPair(aId: number, bId: number): IdPair {
  // TODO(@darzu): need a better hash?
  // TODO(@darzu): for perf, ensure this always produces a V8 SMI when given two <2^16 SMIs.
  //                Also maybe constrain ids to <2^16
  const h = aId < bId ? (aId << 16) ^ bId : (bId << 16) ^ aId;
  // TODO(@darzu): DEBUGGING for perf, see comments in __isSMI
  if (!__isSMI(h)) console.error(`id pair hash isn't SMI: ${h}`);
  return h;
}

const _collisionRefl = vec3.create();

const _motionAABBs: { aabb: AABB; id: number }[] = [];

const _collidesWith: CollidesWith = new Map();
const _reboundData: Map<IdPair, ReboundData> = new Map();
const _contactData: Map<IdPair, ContactData> = new Map();

const PAD = 0.001; // TODO(@darzu): not sure if this is wanted

export let __step = 0; // TODO(@darzu): DEBUG

export function stepPhysics(
  objDictUninit: Record<number, PhysicsObjectUninit>,
  dt: number
): PhysicsResults {
  __step++;

  // ensure all phys objects are fully initialized
  // TODO(@darzu): this is a little strange
  for (let o of Object.values(objDictUninit))
    if (!o.lastMotion)
      o.lastMotion = copyMotionProps(createMotionProps({}), o.motion);
  const objDict = objDictUninit as Record<number, PhysicsObject>;

  const objs = Object.values(objDict);

  // move objects
  moveObjects(objDict, dt, _collidesWith, _contactData);

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

  // update in-contact pairs; this is seperate from collision or rebound

  // TODO(@darzu): instead of full reseting, we should check
  //  to see if each pair needs to be renewed
  // renewal check:
  //  are objects still adjacent to each other?
  //  is there any "push" towards each other?
  // TODO(@darzu): IMPLEMENT. Needs normal of collision and seperation
  // const toClear: number[] = [];
  for (let [abId, lastData] of _contactData) {
    // const abId = idPair(aId, bId);
    // const lastData = _contactData.get(abId);
    const aId = lastData.aId;
    const bId = lastData.bId;
    const a = objDict[aId];
    const b = objDict[bId];
    if (!lastData || !a || !b) {
      console.error(`missing contact data for ${aId}-${bId}`);
      _contactData.delete(abId);
      continue;
    }

    // colliding again so we don't need any adjacency checks
    if (doesOverlap(a.worldAABB, b.worldAABB)) {
      const conData = computeContactData(a, b);
      _contactData.set(abId, conData);
      continue;
    }

    // check for adjacency even if not colliding
    // d2 = ((ax + avx)-(bx + bvx))^2 + (ay-by)^2  < (ax-bx)^2 + (ay-by)^2
    const relMotion = vec3.sub(
      vec3.create(),
      a.motion.linearVelocity,
      b.motion.linearVelocity
    );
    const aSepB = vec3.sub(vec3.create(), b.motion.location, a.motion.location);
    const aTowardB = vec3.dot(relMotion, aSepB);
    const aHeadingTowardsB = aTowardB > 0;
    // TODO(@darzu): is the a towards b requirement important?
    // aHeadingTowardsB &&
    if (doesTouch(a.worldAABB, b.worldAABB, 2 * PAD)) {
      // TODO(@darzu): anything todo?
      // we'll keep old collision data
      const conData = computeContactData(a, b);
      _contactData.set(abId, conData);
      // TODO(@darzu): dbg
      // if (aId === _playerId || bId === _playerId)
      //   console.log(`maintaining contact ${aId}-${bId} ${aTowardB}`);
      continue;
    }

    // else, this collision isn't valid any more
    if (aId === _playerId || bId === _playerId)
      console.log(`ending contact ${aId}-${bId} ${aTowardB}`);
    _contactData.delete(abId);
  }

  // reset collision data
  resetCollidesWithSet(_collidesWith, objs);
  _reboundData.clear();
  // TODO(@darzu):
  // _contactData.clear();

  // check for possible collisions using the motion swept AABBs
  let motionCollidesWith: CollidesWith | null = null;
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
      if (bId < aId) throw `a,b id pair in wrong order ${bId} > ${aId}`;

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
      const h = idPair(aId, bId);
      // TODO(@darzu): DEBUG
      // if (_playerId === aId || _playerId === bId) {
      //   console.log(`new hash w/ ${aId}-${bId}: ${h}`);
      // }
      if (!_reboundData.has(h)) {
        _collidesWith.get(aId)!.push(bId);
        _collidesWith.get(bId)!.push(aId);

        // TODO(@darzu): DEBUG
        // if (_playerId === aId || _playerId === bId) {
        //   console.log(`new col w/ ${aId}-${bId}`);
        // }
      }

      // compute rebound info
      const rebData = computeReboundData(a, b, itr);
      _reboundData.set(h, rebData);

      // TODO(@darzu): DEBUG
      if (aId === _playerId || bId === _playerId) {
        // if (_contactData.has(h)) {
        console.log(
          // `rebounding player: ${rebData.aRebound}-${rebData.bRebound}`
          `${__step}: rebounding player in dir ${vec3Dbg(
            rebData.aOverlap
          )} or ${vec3Dbg(rebData.bOverlap)} by ${rebData.aRebound} or ${
            rebData.bRebound
          }`
        );
        // }
      }

      // compute contact info
      const contData = computeContactData(a, b);
      _contactData.set(h, contData);

      // update how much we need to rebound objects by
      const { aRebound, bRebound } = rebData;
      if (aRebound < Infinity)
        nextObjMovFracs[aId] = Math.max(nextObjMovFracs[aId] || 0, aRebound);
      if (bRebound < Infinity)
        nextObjMovFracs[bId] = Math.max(nextObjMovFracs[bId] || 0, bRebound);
    }

    // adjust objects Rebound to compensate for collisions
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
    reboundData: _reboundData,
    contactData: _contactData,
  };
}

function computeContactData(a: PhysicsObject, b: PhysicsObject): ContactData {
  let dist = -Infinity;
  let dim = -1;
  let dir = 0;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
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

    const newDist = right.worldAABB.min[i] - left.worldAABB.max[i];
    if (dist < newDist) {
      dist = newDist;
      dim = i;
      dir = a === left ? -1 : 1;
    }
  }

  // TODO(@darzu): debug
  // if (a.id === _playerId || b.id === _playerId) console.log(`dist: ${dist}`);

  const bToANorm = vec3.fromValues(0, 0, 0);
  if (dim >= 0) bToANorm[dim] = dir;

  return {
    aId: a.id,
    bId: b.id,
    bToANorm,
    dist,
  };
}

function computeReboundData(
  a: PhysicsObject,
  b: PhysicsObject,
  itr: number
): ReboundData {
  // determine how to readjust positions
  let aRebound = Infinity;
  let aDim = -1;
  let aOverlapNum = 0;
  let bRebound = Infinity;
  let bDim = -1;
  let bOverlapNum = 0;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
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
    if (leftMaxContrib + rightMaxContrib < overlap - PAD * itr) continue;
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
      if (f < aRebound) {
        aRebound = f;
        aDim = i;
        aOverlapNum = overlap;
      }
    }
    if (0 < bMaxContrib) {
      if (f < bRebound) {
        bRebound = f;
        bDim = i;
        bOverlapNum = overlap;
      }
    }
  }

  const aOverlap = vec3.fromValues(0, 0, 0); // TODO(@darzu): perf; unnecessary alloc
  if (0 < aDim)
    aOverlap[aDim] =
      Math.sign(a.lastMotion.location[aDim] - a.motion.location[aDim]) *
      aOverlapNum;

  const bOverlap = vec3.fromValues(0, 0, 0);
  if (0 < bDim)
    bOverlap[bDim] =
      Math.sign(b.lastMotion.location[bDim] - b.motion.location[bDim]) *
      bOverlapNum;

  return { aId: a.id, bId: b.id, aRebound, bRebound, aOverlap, bOverlap };
}