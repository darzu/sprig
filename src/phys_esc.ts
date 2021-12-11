import { Collider, ColliderDef } from "./collider.js";
import { Component, EM, EntityManager } from "./entity-manager.js";
import { PhysicsTimerDef, Timer } from "./time.js";
import { _playerId } from "./game/game.js";
import { quat, vec3 } from "./gl-matrix.js";
import {
  CollidesWith,
  computeContactData,
  computeReboundData,
  ContactData,
  idPair,
  IdPair,
  PAD,
  ReboundData,
} from "./phys.js";
import {
  AABB,
  checkBroadphase,
  collisionPairs,
  copyAABB,
  createAABB,
  doesOverlap,
  doesTouch,
  Ray,
  RayHit,
  rayHitDist,
  resetCollidesWithSet,
} from "./phys_broadphase.js";
import {
  copyMotionProps,
  Motion,
  MotionDef,
  moveObjects,
} from "./phys_motion.js";
import { MotionSmoothing, MotionSmoothingDef } from "./transform.js";
import { tempQuat } from "./temp-pool.js";

export const PhysicsResultsDef = EM.defineComponent("physicsResults", () => {
  return {
    collidesWith: new Map<number, number[]>() as CollidesWith,
    reboundData: new Map<IdPair, ReboundData>(),
    contactData: new Map<IdPair, ContactData>(),
    checkRay: (r: Ray) => [] as RayHit[],
  };
});
export type PhysicsResults = Component<typeof PhysicsResultsDef>;

export const PhysicsStateDef = EM.defineComponent("_phys", () => {
  return {
    lastMotion: MotionDef.construct(),
    init: false,
    local: createAABB(),
    world: createAABB(),
    sweep: createAABB(),
  };
});
export type PhysicsState = Component<typeof PhysicsStateDef>;

export interface PhysicsObject {
  id: number;
  motion: Motion;
  collider: Collider;
  _phys: PhysicsState;
}

function initPhysicsObj(o: PhysicsObject) {
  // TODO(@darzu): do we really need this?
  o._phys.init = true;

  copyMotionProps(o._phys.lastMotion, o.motion);

  // AABBs (collider derived)
  if (o.collider.shape === "AABB") {
    o._phys.local = copyAABB(o.collider.aabb);
  } else {
    throw `Unimplemented collider shape: ${o.collider.shape}`;
  }
  o._phys.world = copyAABB(o._phys.local);
  o._phys.sweep = copyAABB(o._phys.local);
}

export let __step = 0; // TODO(@darzu): singleton component this

const _collisionRefl = vec3.create();

const _motionAABBs: { aabb: AABB; id: number }[] = [];

const _collisionPairs: Set<IdPair> = new Set();

const _physObjects: Map<number, PhysicsObject> = new Map();

export let _motionPairsLen = 0; // TODO(@darzu): debug

const _objDict: Map<number, PhysicsObject> = new Map();

function stepsPhysics(objs: PhysicsObject[], dt: number): void {
  __step++; // TODO(@darzu): hack for debugging purposes

  // build a dict
  _objDict.clear();
  for (let o of objs) _objDict.set(o.id, o);

  // get singleton data
  const { physicsResults } = EM.findSingletonComponent(PhysicsResultsDef)!;
  const { collidesWith, contactData, reboundData } = physicsResults;

  // move objects
  moveObjects(_objDict, dt, collidesWith, contactData);

  // update AABB state after motion
  for (let {
    id,
    motion,
    _phys: { lastMotion, local, sweep, world },
  } of objs) {
    //update motion sweep AABBs
    for (let i = 0; i < 3; i++) {
      sweep.min[i] = Math.min(
        local.min[i] + motion.location[i],
        local.min[i] + lastMotion.location[i]
      );
      sweep.max[i] = Math.max(
        local.max[i] + motion.location[i],
        local.max[i] + lastMotion.location[i]
      );
    }

    // update "tight" AABBs
    vec3.add(world.min, local.min, motion.location);
    vec3.add(world.max, local.max, motion.location);
  }

  // update in-contact pairs; this is seperate from collision or rebound
  for (let [abId, lastData] of contactData) {
    const aId = lastData.aId;
    const bId = lastData.bId;
    const a = _objDict.get(aId);
    const b = _objDict.get(bId);
    if (!lastData || !a || !b) {
      // one of the objects might have been deleted since the last frame,
      // ignore this contact
      contactData.delete(abId);
      continue;
    }

    // colliding again so we don't need any adjacency checks
    if (doesOverlap(a._phys.world, b._phys.world)) {
      const conData = computeContactData(a, b);
      contactData.set(abId, conData);
      continue;
    }

    // check for adjacency even if not colliding
    // TODO(@darzu): do we need to consider relative motions?
    //    i.e. a check to see if the two objects are pressing into each other?
    if (doesTouch(a._phys.world, b._phys.world, 2 * PAD)) {
      const conData = computeContactData(a, b);
      contactData.set(abId, conData);
      continue;
    }

    // else, this collision isn't valid any more
    if (aId === _playerId || bId === _playerId) {
      // TODO(@darzu): add gameplay events for ending contact?
      // console.log(`ending contact ${aId}-${bId} ${aTowardB}`);
    }
    contactData.delete(abId);
  }

  // reset collision data
  resetCollidesWithSet(collidesWith, objs);
  reboundData.clear();
  _collisionPairs.clear();

  // check for possible collisions using the motion swept AABBs
  if (_motionAABBs.length !== objs.length) _motionAABBs.length = objs.length;
  for (let i = 0; i < objs.length; i++) {
    const {
      id,
      _phys: { world: aabb },
    } = objs[i];
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
  const { collidesWith: motionCollidesWith, checkRay: motionCheckRay } =
    checkBroadphase(_motionAABBs);
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

      const a = _objDict.get(aId)!;
      const b = _objDict.get(bId)!;

      if (!doesOverlap(a._phys.world, b._phys.world)) {
        // a miss
        continue;
      }

      // record the real collision
      const h = idPair(aId, bId);
      if (!_collisionPairs.has(h)) {
        _collisionPairs.add(h);
        collidesWith.get(aId)!.push(bId);
        collidesWith.get(bId)!.push(aId);
      }

      // compute contact info
      const contData = computeContactData(a, b);
      contactData.set(h, contData);

      // solid objects rebound
      if (a.collider.solid && b.collider.solid) {
        // compute rebound info
        const rebData = computeReboundData(a, b, itr);
        reboundData.set(h, rebData);

        // update how much we need to rebound objects by
        const { aRebound, bRebound } = rebData;
        if (aRebound < Infinity)
          nextObjMovFracs[aId] = Math.max(nextObjMovFracs[aId] || 0, aRebound);
        if (bRebound < Infinity)
          nextObjMovFracs[bId] = Math.max(nextObjMovFracs[bId] || 0, bRebound);
      }
    }

    // adjust objects Rebound to compensate for collisions
    anyMovement = false;
    for (let o of objs) {
      let movFrac = nextObjMovFracs[o.id];
      if (movFrac) {
        vec3.sub(
          _collisionRefl,
          o._phys.lastMotion.location,
          o.motion.location
        );
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
    for (let {
      id,
      motion,
      _phys: { world, local },
    } of objs) {
      if (lastObjMovs[id]) {
        vec3.add(world.min, local.min, motion.location);
        vec3.add(world.max, local.max, motion.location);
      }
    }

    itr++;
  }

  // remember current state for next time
  for (let o of objs) {
    copyMotionProps(o._phys.lastMotion, o.motion);
  }

  // update out checkRay function
  physicsResults.checkRay = (r: Ray) => {
    const motHits = motionCheckRay(r);
    const hits: RayHit[] = [];
    for (let mh of motHits) {
      const o = _objDict.get(mh.id)!;
      const dist = rayHitDist(o._phys.world, r);
      if (!isNaN(dist)) hits.push({ id: o.id, dist });
    }
    return hits;
  };
}

function updateLocSmoothingTarget(
  oldTarget: vec3,
  diff: vec3,
  newTarget: vec3
) {
  vec3.add(oldTarget, oldTarget, diff);
  vec3.sub(oldTarget, oldTarget, newTarget);
  // The order of these copies is important. At this point, the calculated
  // location error actually lives in loc. So we copy it over
  // to locErr, then copy the new location into loc.
  vec3.copy(diff, oldTarget);
  vec3.copy(oldTarget, newTarget);
}
function updateRotSmoothingTarget(
  oldTarget: quat,
  diff: quat,
  newTarget: quat
) {
  quat.mul(oldTarget, oldTarget, diff);
  // sort of a hack--reuse our current rotation error quat to store the
  // rotation inverse to avoid a quat allocation
  quat.invert(diff, newTarget);
  quat.mul(oldTarget, oldTarget, diff);
  // The order of these copies is important--see the similar comment in
  // snapLocation above.
  quat.copy(diff, oldTarget);
  oldTarget = quat.copy(oldTarget, newTarget);
}

function updateSmoothingTargetSmoothChange(
  objs: {
    motion: Motion;
    motionSmoothing: MotionSmoothing;
  }[]
) {
  for (let o of objs) {
    updateLocSmoothingTarget(
      o.motionSmoothing.locationTarget,
      o.motionSmoothing.locationDiff,
      o.motion.location
    );
    updateRotSmoothingTarget(
      o.motionSmoothing.rotationTarget,
      o.motionSmoothing.rotationDiff,
      o.motion.rotation
    );
  }
}
function updateSmoothingTargetSnapChange(
  objs: {
    motion: Motion;
    motionSmoothing: MotionSmoothing;
  }[]
) {
  for (let o of objs) {
    vec3.copy(o.motionSmoothing.locationTarget, o.motion.location);
    quat.copy(o.motionSmoothing.rotationTarget, o.motion.rotation);
  }
}

const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;

function updateSmoothingLerp(
  objs: {
    motionSmoothing: MotionSmoothing;
  }[],
  resources: { physicsTimer: Timer }
) {
  const {
    physicsTimer: { period: dt },
  } = resources;

  for (let o of objs) {
    // lerp location
    const { locationDiff, rotationDiff } = o.motionSmoothing;
    vec3.scale(locationDiff, locationDiff, ERROR_SMOOTHING_FACTOR ** dt);
    let location_error_magnitude = vec3.length(locationDiff);
    if (location_error_magnitude !== 0 && location_error_magnitude < EPSILON) {
      //console.log(`Object ${id} reached 0 location error`);
      vec3.set(locationDiff, 0, 0, 0);
    }

    // lerp rotation
    const identity_quat = quat.identity(tempQuat());
    quat.slerp(
      rotationDiff,
      rotationDiff,
      identity_quat,
      1 - ERROR_SMOOTHING_FACTOR ** dt
    );
    quat.normalize(rotationDiff, rotationDiff);
    let rotation_error_magnitude = Math.abs(
      quat.getAngle(rotationDiff, identity_quat)
    );
    if (rotation_error_magnitude !== 0 && rotation_error_magnitude < EPSILON) {
      //console.log(`Object ${id} reached 0 rotation error`);
      quat.copy(rotationDiff, identity_quat);
    }
  }
}

export function registerUpdateSmoothingTargetSnapChange(em: EntityManager) {
  em.registerSystem(
    [MotionDef, MotionSmoothingDef],
    [],
    updateSmoothingTargetSnapChange
  );
}
export function registerUpdateSmoothingTargetSmoothChange(em: EntityManager) {
  em.registerSystem(
    [MotionDef, MotionSmoothingDef],
    [],
    updateSmoothingTargetSmoothChange
  );
}
export function registerUpdateSmoothingLerp(em: EntityManager) {
  em.registerSystem(
    [MotionSmoothingDef],
    [PhysicsTimerDef],
    (objs, res) => {
      for (let i = 0; i < res.physicsTimer.steps; i++)
        updateSmoothingLerp(objs, res);
    },
    "updateSmoothingLerp"
  );
}

// ECS register
export function registerPhysicsSystems(em: EntityManager) {
  em.addSingletonComponent(PhysicsResultsDef);

  em.registerSystem(
    [MotionDef, ColliderDef, PhysicsStateDef],
    [],
    (objs) => {
      for (let o of objs) if (!o._phys.init) initPhysicsObj(o);
    },
    "initPhysics"
  );

  em.registerSystem(
    [MotionDef, ColliderDef, PhysicsStateDef],
    [PhysicsTimerDef],
    (objs, res) => {
      for (let si = 0; si < res.physicsTimer.steps; si++) {
        stepsPhysics(objs, res.physicsTimer.period);
      }
    },
    "stepPhysics"
  );
}
