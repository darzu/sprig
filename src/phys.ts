import { Collider } from "./collider.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
import { _playerId } from "./main.js";
import {
  AABB,
  checkCollisions,
  collisionPairs,
  copyAABB,
  doesOverlap,
  doesTouch,
  resetCollidesWithSet,
} from "./phys_broadphase.js";
import {
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
  collider: Collider;
}
export interface PhysicsObject {
  id: number;
  motion: MotionProps;
  lastMotion: MotionProps;
  collider: Collider;
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

export interface AABBState {
  id: number;
  localAABB: AABB;
  worldAABB: AABB;
  motionAABB: AABB;
}

const _collisionRefl = vec3.create();

const _motionAABBs: { aabb: AABB; id: number }[] = [];

const _collidesWith: CollidesWith = new Map();
const _reboundData: Map<IdPair, ReboundData> = new Map();
const _contactData: Map<IdPair, ContactData> = new Map();

const _aabbState: Map<number, AABBState> = new Map();

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

  // init AABB state
  // TODO(@darzu): impl
  for (let o of objs) {
    if (!_aabbState.has(o.id)) {
      let localAABB: AABB;

      if (o.collider.shape === "AABB") {
        localAABB = copyAABB(o.collider.aabb);
      } else if (o.collider.shape === "Empty") {
        // TODO(@darzu): is this really how we want to handle empty colliders?
        localAABB = { min: [0, 0, 0], max: [0, 0, 0] };
      } else {
        throw `Unimplemented collider shape: ${o.collider.shape}`;
      }

      const worldAABB: AABB = copyAABB(localAABB);
      const motionAABB: AABB = copyAABB(localAABB);

      _aabbState.set(o.id, {
        id: o.id,
        localAABB,
        worldAABB,
        motionAABB,
      });
    }
  }
  // and clear out outdated AABB state
  for (let [id, _] of _aabbState) {
    if (!objDict[id]) _aabbState.delete(id);
  }

  // move objects
  moveObjects(objDict, _aabbState, dt, _collidesWith, _contactData);

  // update AABB state after motion
  for (let { id, motion, lastMotion } of objs) {
    const o = _aabbState.get(id)!;

    //update  motion sweep AABBs and "tight" AABBs
    for (let i = 0; i < 3; i++) {
      o.motionAABB.min[i] = Math.min(
        o.localAABB.min[i] + motion.location[i],
        o.localAABB.min[i] + lastMotion.location[i]
      );
      o.motionAABB.max[i] = Math.max(
        o.localAABB.max[i] + motion.location[i],
        o.localAABB.max[i] + lastMotion.location[i]
      );
    }

    // update "tight" AABBs
    vec3.add(o.worldAABB.min, o.localAABB.min, motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, motion.location);
  }

  // update in-contact pairs; this is seperate from collision or rebound
  for (let [abId, lastData] of _contactData) {
    const aId = lastData.aId;
    const bId = lastData.bId;
    const a = objDict[aId];
    const b = objDict[bId];
    if (!lastData || !a || !b) {
      // one of the objects might have been deleted since the last frame,
      // ignore this contact
      _contactData.delete(abId);
      continue;
    }
    const aAABBs = _aabbState.get(aId)!;
    const bAABBs = _aabbState.get(bId)!;

    // colliding again so we don't need any adjacency checks
    if (doesOverlap(aAABBs.worldAABB, bAABBs.worldAABB)) {
      const conData = computeContactData(a, aAABBs, b, bAABBs);
      _contactData.set(abId, conData);
      continue;
    }

    // check for adjacency even if not colliding
    // TODO(@darzu): do we need to consider relative motions?
    //    i.e. a check to see if the two objects are pressing into each other?
    if (doesTouch(aAABBs.worldAABB, bAABBs.worldAABB, 2 * PAD)) {
      const conData = computeContactData(a, aAABBs, b, bAABBs);
      _contactData.set(abId, conData);
      continue;
    }

    // else, this collision isn't valid any more
    if (aId === _playerId || bId === _playerId) {
      // TODO(@darzu): add gameplay events for ending contact?
      // console.log(`ending contact ${aId}-${bId} ${aTowardB}`);
    }
    _contactData.delete(abId);
  }

  // reset collision data
  resetCollidesWithSet(_collidesWith, objs);
  _reboundData.clear();

  // check for possible collisions using the motion swept AABBs
  let motionCollidesWith: CollidesWith | null = null;
  if (_motionAABBs.length !== objs.length) _motionAABBs.length = objs.length;
  for (let i = 0; i < objs.length; i++) {
    const id = objs[i].id;
    const aabb = _aabbState.get(id)!.motionAABB;
    if (!_motionAABBs[i]) {
      _motionAABBs[i] = {
        id: id,
        aabb: aabb,
      };
    } else {
      _motionAABBs[i].id = id;
      _motionAABBs[i].aabb = aabb;
    }
  }
  motionCollidesWith = checkCollisions(_motionAABBs);
  let motionPairs = [...collisionPairs(motionCollidesWith)];
  _motionPairsLen = motionPairs.length;

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
    // enumerate the possible collisions, looking for objects that need to pushed apart
    for (let [aId, bId] of motionPairs) {
      if (bId < aId) throw `a,b id pair in wrong order ${bId} > ${aId}`;

      // did one of these objects move?
      if (!lastObjMovs[aId] && !lastObjMovs[bId]) continue;

      const a = objDict[aId];
      const b = objDict[bId];
      const aAABBs = _aabbState.get(aId)!;
      const bAABBs = _aabbState.get(bId)!;

      if (!doesOverlap(aAABBs.worldAABB, bAABBs.worldAABB)) {
        // a miss
        continue;
      }

      // record the real collision
      const h = idPair(aId, bId);
      if (!_reboundData.has(h)) {
        _collidesWith.get(aId)!.push(bId);
        _collidesWith.get(bId)!.push(aId);
      }

      // compute rebound info
      const rebData = computeReboundData(a, aAABBs, b, bAABBs, itr);
      _reboundData.set(h, rebData);

      // compute contact info
      const contData = computeContactData(a, aAABBs, b, bAABBs);
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
        vec3.sub(_collisionRefl, o.lastMotion.location, o.motion.location);
        vec3.scale(_collisionRefl, _collisionRefl, movFrac);
        vec3.add(o.motion.location, o.motion.location, _collisionRefl);

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
    for (let { id, motion } of objs) {
      if (lastObjMovs[id]) {
        const o = _aabbState.get(id)!;
        vec3.add(o.worldAABB.min, o.localAABB.min, motion.location);
        vec3.add(o.worldAABB.max, o.localAABB.max, motion.location);
      }
    }

    itr++;
  }

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

function computeContactData(
  a: PhysicsObject,
  aC: AABBState,
  b: PhysicsObject,
  bC: AABBState
): ContactData {
  let dist = -Infinity;
  let dim = -1;
  let dir = 0;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
    // determine who is to the left in this dimension
    let left: PhysicsObject;
    let leftC: AABBState;
    let right: PhysicsObject;
    let rightC: AABBState;
    if (a.lastMotion.location[i] < b.lastMotion.location[i]) {
      left = a;
      leftC = aC;
      right = b;
      rightC = bC;
    } else {
      left = b;
      leftC = bC;
      right = a;
      rightC = aC;
    }

    const newDist = rightC.worldAABB.min[i] - leftC.worldAABB.max[i];
    if (dist < newDist) {
      dist = newDist;
      dim = i;
      dir = a === left ? -1 : 1;
    }
  }

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
  aC: AABBState,
  b: PhysicsObject,
  bC: AABBState,
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
    let leftC: AABBState;
    let right: PhysicsObject;
    let rightC: AABBState;
    if (a.lastMotion.location[i] < b.lastMotion.location[i]) {
      left = a;
      leftC = aC;
      right = b;
      rightC = bC;
    } else {
      left = b;
      leftC = bC;
      right = a;
      rightC = aC;
    }

    const overlap = leftC.worldAABB.max[i] - rightC.worldAABB.min[i];
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
