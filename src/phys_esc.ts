import { Collider, ColliderDef } from "./collider.js";
import { Component, EM, EntityManager } from "./entity-manager.js";
import { PhysicsTimerDef, Timer } from "./time.js";
import { mat4, quat, vec3 } from "./gl-matrix.js";
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
import { moveObjects } from "./phys_motion.js";
import {
  Position,
  PositionDef,
  Rotation,
  RotationDef,
  TransformWorld,
  TransformWorldDef,
} from "./transform.js";
import { tempQuat, tempVec } from "./temp-pool.js";
import {
  LinearVelocityDef,
  AngularVelocityDef,
  AngularVelocity,
  LinearVelocity,
} from "./motion.js";

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
    // TODO(@darzu): make these world positions
    worldPosition: PositionDef.construct(),
    lastWorldPosition: PositionDef.construct(),
    local: createAABB(),
    world: createAABB(),
    sweep: createAABB(),
  };
});
export type PhysicsState = Component<typeof PhysicsStateDef>;

export interface PhysicsObject {
  id: number;
  collider: Collider;
  position: Position; // TODO(@darzu): remove in favor of the one in _phys
  transformWorld: TransformWorld;
  _phys: PhysicsState;
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

  // update our working world state
  for (let { id, position, transformWorld, _phys } of objs) {
    vec3.transformMat4(_phys.worldPosition, [0, 0, 0], transformWorld);
    // TODO(@darzu):
    // vec3.copy(_phys.worldPosition, position);
  }

  // update AABB state after motion
  for (let {
    id,
    _phys: { worldPosition, lastWorldPosition, local, sweep, world },
  } of objs) {
    //update motion sweep AABBs
    for (let i = 0; i < 3; i++) {
      sweep.min[i] = Math.min(
        local.min[i] + worldPosition[i],
        local.min[i] + worldPosition[i]
      );
      sweep.max[i] = Math.max(
        local.max[i] + worldPosition[i],
        local.max[i] + lastWorldPosition[i]
      );
    }

    // update "tight" AABBs
    vec3.add(world.min, local.min, worldPosition);
    vec3.add(world.max, local.max, worldPosition);
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
          o._phys.lastWorldPosition,
          o._phys.worldPosition
        );
        vec3.scale(_collisionRefl, _collisionRefl, movFrac);
        vec3.add(o._phys.worldPosition, o._phys.worldPosition, _collisionRefl);

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
      _phys: { world, local, worldPosition },
    } of objs) {
      if (lastObjMovs[id]) {
        vec3.add(world.min, local.min, worldPosition);
        vec3.add(world.max, local.max, worldPosition);
      }
    }

    itr++;
  }

  // remember current state for next time
  for (let o of objs) {
    vec3.copy(o._phys.lastWorldPosition, o._phys.worldPosition);
  }

  // copy out changes we made
  for (let o of objs) {
    // TODO(@darzu): cache this inverse matrix?
    const oldWorldPos = vec3.transformMat4(
      tempVec(),
      [0, 0, 0],
      o.transformWorld
    );
    const delta = vec3.sub(tempVec(), o._phys.worldPosition, oldWorldPos);
    vec3.add(o.position, o.position, delta);
    // const worldInv = mat4.create();
    // mat4.invert(worldInv, o.transformWorld);
    // const delta = vec3.create();
    // vec3.transformMat4(delta, o._phys.worldPosition, worldInv);
    // vec3.add(o.position, o.position, delta);
    // TODO(@darzu):
    // vec3.copy(o.position, o._phys.worldPosition);
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

export function registerPhysicsMoveObjects(em: EntityManager) {
  em.registerSystem(
    [PositionDef, ColliderDef, PhysicsStateDef, TransformWorldDef],
    [PhysicsTimerDef, PhysicsResultsDef],
    (objs, res) => {
      for (let si = 0; si < res.physicsTimer.steps; si++) {
        // build a dict
        // TODO(@darzu): would be great of EntityManager handled this
        _objDict.clear();
        for (let o of objs) _objDict.set(o.id, o);

        // TODO(@darzu): moveObjects needs to be moved out so that we can update the
        //    world transform afterward
        // move objects
        moveObjects(
          _objDict,
          res.physicsTimer.period,
          res.physicsResults.contactData
        );
      }
    },
    "physicsMove"
  );
}

// ECS register
export function registerPhysicsSystems(em: EntityManager) {
  em.addSingletonComponent(PhysicsResultsDef);

  em.registerSystem(
    [PositionDef, ColliderDef],
    [],
    (objs) => {
      for (let o of objs)
        if (!PhysicsStateDef.isOn(o)) {
          const _phys = em.addComponent(o.id, PhysicsStateDef);

          vec3.copy(_phys.worldPosition, o.position);
          vec3.copy(_phys.lastWorldPosition, o.position);

          // AABBs (collider derived)
          if (o.collider.shape === "AABB") {
            _phys.local = copyAABB(o.collider.aabb);
          } else {
            throw `Unimplemented collider shape: ${o.collider.shape}`;
          }
          _phys.world = copyAABB(_phys.local);
          _phys.sweep = copyAABB(_phys.local);
        }
    },
    "initPhysics"
  );

  em.registerSystem(
    [PositionDef, ColliderDef, PhysicsStateDef, TransformWorldDef],
    [PhysicsTimerDef],
    (objs, res) => {
      for (let si = 0; si < res.physicsTimer.steps; si++) {
        stepsPhysics(objs, res.physicsTimer.period);
      }
    },
    "stepPhysics"
  );
}
