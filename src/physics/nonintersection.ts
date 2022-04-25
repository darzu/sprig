import { Collider, ColliderDef } from "./collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import {
  CollidesWith,
  computeContactData,
  computeReboundData,
  ContactData,
  PAD,
  ReboundData,
} from "./phys.js";
import {
  AABB,
  aabbCenter,
  checkBroadphase,
  collisionPairs,
  copyAABB,
  createAABB,
  doesOverlapAABB,
  doesTouchAABB,
  getAABBFromPositions,
  Ray,
  RayHit,
  rayHitDist,
  resetCollidesWithSet,
} from "./broadphase.js";
import {
  Frame,
  IDENTITY_FRAME,
  LocalFrameDefs,
  PhysicsParent,
  PhysicsParentDef,
  PositionDef,
  ReadonlyFrame,
  TransformDef,
  updateFrameFromPosRotScale,
  updateFrameFromTransform,
} from "./transform.js";
import { assert } from "../test.js";
import { IdPair, idPair } from "../util.js";
import { tempVec } from "../temp-pool.js";
import { aabbDbg, vec3Dbg } from "../utils-3d.js";
import { dbgLogOnce } from "../util.js";

// TODO(@darzu): we use "object", "obj", "o" everywhere in here, we should use "entity", "ent", "e"

// TODO(@darzu): break up PhysicsResults
// TODO(@darzu): rename "BroadphaseResults" ?
export const PhysicsResultsDef = EM.defineComponent("physicsResults", () => {
  return {
    collidesWith: new Map<number, number[]>() as CollidesWith,
    reboundData: new Map<IdPair, ReboundData>(),
    contactData: new Map<IdPair, ContactData>(),
    checkRay: (r: Ray) => [] as RayHit[],
  };
});
export type PhysicsResults = Component<typeof PhysicsResultsDef>;

export function createFrame(): Frame {
  return {
    position: vec3.create(),
    rotation: quat.create(),
    scale: vec3.fromValues(1, 1, 1),
    transform: mat4.create(),
  };
}

export const WorldFrameDef = EM.defineComponent("world", () => createFrame());

export interface PhysCollider {
  // NOTE: we use "id" and "aabb" here b/c broadphase looks for a struct with those
  id: number;
  oId: number;
  parentOId: number;
  aabb: AABB;
  localAABB: AABB;
  selfAABB: AABB;
  // TODO(@darzu): NARROW PHASE: add optional more specific collider types here
  // TODO(@darzu): pos, lastPos need to be tracked per parent space
  localPos: vec3;
  lastLocalPos: vec3;
}

const DUMMY_COLLIDER: PhysCollider = {
  id: 0,
  oId: 0,
  aabb: { min: [0, 0, 0], max: [0, 0, 0] },
  localAABB: { min: [0, 0, 0], max: [0, 0, 0] },
  selfAABB: { min: [0, 0, 0], max: [0, 0, 0] },
  parentOId: 0,
  localPos: [0, 0, 0],
  lastLocalPos: [0, 0, 0],
};

// TODO(@darzu): break this up into the specific use cases
export const PhysicsStateDef = EM.defineComponent("_phys", () => {
  return {
    // track last stats so we can diff
    lastLocalPos: PositionDef.construct(),
    // Colliders
    // NOTE: these can be many-to-one colliders-to-entities, hence the arrays
    colliders: [] as PhysCollider[],
    // TODO(@darzu): use sweepAABBs again?
  };
});
export type PhysicsState = Component<typeof PhysicsStateDef>;

export interface PhysicsObject {
  id: number;
  collider: Collider;
  _phys: PhysicsState;
  world: Frame;
}

const _collisionPairs: Set<IdPair> = new Set();

const _objDict: Map<number, PhysicsObject> = new Map();

function getParentFrame(
  o: Entity & { physicsParent?: PhysicsParent }
): ReadonlyFrame {
  if (o.physicsParent) {
    const parent = EM.findEntity(o.physicsParent.id, [WorldFrameDef]);
    if (parent) return parent.world;
  }
  return IDENTITY_FRAME;
}

export function doesOverlap(a: PhysCollider, b: PhysCollider): boolean {
  // TODO(@darzu): use nearest-parent AABBs
  if (a.parentOId === b.parentOId)
    return doesOverlapAABB(a.localAABB, b.localAABB);
  else if (a.parentOId === b.oId)
    return doesOverlapAABB(a.localAABB, b.selfAABB);
  else if (a.oId === b.parentOId)
    return doesOverlapAABB(a.selfAABB, b.localAABB);
  else return doesOverlapAABB(a.aabb, b.aabb);
}

export function doesTouch(
  a: PhysCollider,
  b: PhysCollider,
  threshold: number
): boolean {
  if (a.parentOId === b.parentOId)
    return doesTouchAABB(a.localAABB, b.localAABB, threshold);
  else if (a.parentOId === b.oId)
    return doesTouchAABB(a.localAABB, b.selfAABB, threshold);
  else if (a.oId === b.parentOId)
    return doesTouchAABB(a.selfAABB, b.localAABB, threshold);
  else return doesTouchAABB(a.aabb, b.aabb, threshold);
}

function transformAABB(out: AABB, t: mat4) {
  // TODO(@darzu): highly inefficient. for one, this allocs new vecs
  const wCorners = getAABBCorners(out).map((p) => vec3.transformMat4(p, p, t));
  // TODO(@darzu): update localAABB too
  copyAABB(out, getAABBFromPositions(wCorners));
}

// PRECONDITION: assumes world frames are all up to date
export function registerUpdateWorldAABBs(em: EntityManager, s: string = "") {
  em.registerSystem(
    [PhysicsStateDef, WorldFrameDef, TransformDef],
    [],
    (objs, res) => {
      for (let o of objs) {
        // update collider AABBs
        for (let i = 0; i < o._phys.colliders.length; i++) {
          const wc = o._phys.colliders[i];
          copyAABB(wc.localAABB, wc.selfAABB);
          transformAABB(wc.localAABB, o.transform);
          copyAABB(wc.aabb, wc.selfAABB);
          transformAABB(wc.aabb, o.world.transform);
          // TODO(@darzu): update localAABB too
          // TODO(@darzu): do we want to update lastPos here? different than obj last pos
          vec3.copy(wc.lastLocalPos, wc.localPos);
          aabbCenter(wc.localPos, wc.localAABB);
        }
        // const { localAABB, worldAABB, lastWorldAABB, sweepAABB } = o._phys;

        // TODO(@darzu): bring back sweep AABBs?
        // update sweep AABBs
        // for (let i = 0; i < 3; i++) {
        //   sweepAABB.min[i] = Math.min(lastWorldAABB.min[i], worldAABB.min[i]);
        //   sweepAABB.max[i] = Math.max(lastWorldAABB.max[i], worldAABB.max[i]);
        // }
      }
    },
    "registerUpdateWorldAABBs" + s
  );
}

export function registerUpdateWorldFromPosRotScale(em: EntityManager) {
  em.registerSystem(
    [WorldFrameDef],
    [],
    (objs) => {
      for (let o of objs) updateFrameFromPosRotScale(o.world);
    },
    "updateWorldFromPosRotScale"
  );
}

function getAABBCorners(aabb: AABB): vec3[] {
  const points: vec3[] = [
    [aabb.max[0], aabb.max[1], aabb.max[2]],
    [aabb.max[0], aabb.max[1], aabb.min[2]],
    [aabb.max[0], aabb.min[1], aabb.max[2]],
    [aabb.max[0], aabb.min[1], aabb.min[2]],

    [aabb.min[0], aabb.max[1], aabb.max[2]],
    [aabb.min[0], aabb.max[1], aabb.min[2]],
    [aabb.min[0], aabb.min[1], aabb.max[2]],
    [aabb.min[0], aabb.min[1], aabb.min[2]],
  ];
  return points;
}

export const PhysicsBroadCollidersDef = EM.defineComponent(
  "_physBColliders",
  () => {
    return {
      // NOTE: we reserve the first collider as a dummy so that we can check
      //    cId truthiness
      // TODO(@darzu): support removing colliders
      nextId: 1,
      colliders: [DUMMY_COLLIDER],
    };
  }
);
export type PhysicsBroadColliders = Component<typeof PhysicsBroadCollidersDef>;

export function registerPhysicsStateInit(em: EntityManager) {
  em.addSingletonComponent(PhysicsResultsDef);
  em.addSingletonComponent(PhysicsBroadCollidersDef);

  // init the per-object physics state
  // TODO(@darzu): split this into different concerns
  em.registerSystem(
    [ColliderDef, PositionDef],
    [PhysicsBroadCollidersDef],
    (objs, { _physBColliders }) => {
      for (let o of objs) {
        if (PhysicsStateDef.isOn(o)) {
          // TODO(@darzu): PARENT. update collider parent IDs if necessary

          // ensure parents are up to date for existing colliders
          const parent = PhysicsParentDef.isOn(o) ? o.physicsParent.id : 0;
          for (let c of o._phys.colliders) {
            if (c.parentOId !== parent) {
              // update parent
              c.parentOId = parent;
              vec3.copy(c.localPos, o.position);
              vec3.copy(c.lastLocalPos, o.position);
            }
          }

          continue;
        }
        const parentId = PhysicsParentDef.isOn(o) ? o.physicsParent.id : 0;
        const _phys = em.addComponent(o.id, PhysicsStateDef);

        // AABBs (collider derived)
        // TODO(@darzu): handle scale
        if (o.collider.shape === "AABB") {
          _phys.colliders.push(mkCollider(o.collider.aabb, o.id, parentId));
        } else if (o.collider.shape === "Multi") {
          for (let c of o.collider.children) {
            if (c.shape !== "AABB")
              throw `Unimplemented child collider shape: ${c.shape}`;
            _phys.colliders.push(mkCollider(c.aabb, o.id, parentId));
          }
        } else {
          throw `Unimplemented collider shape: ${o.collider.shape}`;
        }

        // copyAABB(_phys.localAABB, o.collider.aabb);
        // copyAABB(_phys.worldAABB, _phys.localAABB);
        // copyAABB(_phys.sweepAABB, _phys.localAABB);
      }

      function mkCollider(
        selfAABB: AABB,
        oId: number,
        parentOId: number
      ): PhysCollider {
        const cId = _physBColliders.nextId;
        _physBColliders.nextId += 1;
        if (_physBColliders.nextId > 2 ** 15)
          console.warn(`Halfway through collider IDs!`);
        const c: PhysCollider = {
          id: cId,
          oId,
          parentOId,
          aabb: copyAABB(createAABB(), selfAABB),
          localAABB: copyAABB(createAABB(), selfAABB),
          selfAABB: copyAABB(createAABB(), selfAABB),
          localPos: aabbCenter(vec3.create(), selfAABB),
          lastLocalPos: aabbCenter(vec3.create(), selfAABB),
        };
        _physBColliders.colliders.push(c);
        return c;
      }
    },
    "physicsInit"
  );
}

export function registerUpdateInContactSystems(em: EntityManager) {
  em.registerSystem(
    [ColliderDef, PhysicsStateDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsBroadCollidersDef, PhysicsResultsDef],
    (objs, res) => {
      // TODO(@darzu): interestingly, this system doesn't need the step count
      if (!res.physicsTimer.steps) return;

      // build a dict
      // TODO(@darzu): would be nice if the query could provide this
      _objDict.clear();
      for (let o of objs) _objDict.set(o.id, o);

      // get singleton data
      const contactData = res.physicsResults.contactData;

      // TODO(@darzu): NARROW: needs to be updated to consider more precise colliders, GJK etc
      // update in-contact pairs; this is seperate from collision or rebound
      for (let [contactId, lastData] of contactData) {
        const ac = res._physBColliders.colliders[lastData.aCId];
        const bc = res._physBColliders.colliders[lastData.bCId];
        const a = _objDict.get(ac.oId);
        const b = _objDict.get(bc.oId);
        if (!a || !b) {
          // one of the objects might have been deleted since the last frame,
          // ignore this contact
          contactData.delete(contactId);
          continue;
        }
        const aParent = PhysicsParentDef.isOn(a) ? a.physicsParent.id : 0;
        const bParent = PhysicsParentDef.isOn(b) ? b.physicsParent.id : 0;
        if (
          (aParent !== lastData.parentOId && a.id !== lastData.parentOId) ||
          (bParent !== lastData.parentOId && b.id !== lastData.parentOId)
        ) {
          // TODO(@darzu): warn
          console.warn(`Deleting old contact`);
          contactData.delete(contactId);
          continue;
        }

        // colliding again so we don't need any adjacency checks
        if (doesOverlap(ac, bc)) {
          const newData = computeContactData(ac, bc);
          contactData.set(contactId, newData);
          continue;
        }

        // check for adjacency even if not colliding
        // TODO(@darzu): do we need to consider relative motions?
        //    i.e. a check to see if the two objects are pressing into each other?
        //    for now I'm ignoring this b/c it doesn't seem harmful to consider non-pressing as contact
        if (doesTouch(ac, bc, 2 * PAD)) {
          const newData = computeContactData(ac, bc);
          contactData.set(contactId, newData);
          continue;
        }

        // else, this collision isn't valid any more
        contactData.delete(contactId);
      }
    },
    "updatePhysInContact"
  );
}

export function registerPhysicsContactSystems(em: EntityManager) {
  // TODO(@darzu): split this system
  em.registerSystem(
    [ColliderDef, PhysicsStateDef, PositionDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsBroadCollidersDef, PhysicsResultsDef],
    (objs, res) => {
      // TODO(@darzu): interestingly, this system doesn't need the step count
      if (!res.physicsTimer.steps) return;

      // build a dict
      // TODO(@darzu): would be nice if the query could provide this
      _objDict.clear();
      for (let o of objs) _objDict.set(o.id, o);

      // get singleton data
      const { collidesWith, contactData, reboundData } = res.physicsResults;

      // reset collision data
      resetCollidesWithSet(collidesWith, objs);
      reboundData.clear();
      _collisionPairs.clear();

      // BROADPHASE: check for possible collisions
      // TODO(@darzu): cull out unused/deleted colliders
      // TODO(@darzu): use motion sweep AABBs again?
      const currColliders = objs
        .map((o) => o._phys.colliders)
        .reduce((p, n) => [...p, ...n], [] as PhysCollider[]);
      const { collidesWith: colliderCollisions, checkRay: collidersCheckRay } =
        checkBroadphase(currColliders);
      // TODO(@darzu): perf: big array creation
      let colliderPairs = [...collisionPairs(colliderCollisions)];

      const COLLISION_MAX_ITRS = 100;

      // we'll track which objects have moved each itr,
      // since we just ran dynamics assume everything has moved
      // TODO(@darzu): perf: would narrowing this to actually moved objs help?
      const lastObjMovs: { [id: number]: boolean } = {};
      for (let o of objs) lastObjMovs[o.id] = true;

      // we'll track how much each object should be adjusted each itr
      const nextObjMovFracs: { [id: number]: number } = {};

      // our loop condition
      let anyMovement = true;
      let itr = 0;

      while (anyMovement && itr < COLLISION_MAX_ITRS) {
        // enumerate the possible collisions, looking for objects that need to pushed apart
        for (let [aCId, bCId] of colliderPairs) {
          if (bCId < aCId) throw `a,b id pair in wrong order ${bCId} < ${aCId}`;

          const ac = res._physBColliders.colliders[aCId];
          const bc = res._physBColliders.colliders[bCId];

          // find our object IDs from our collider indices
          const aOId = ac.oId;
          const bOId = bc.oId;

          // self collision, ignore
          if (aOId === bOId) continue;

          // did one of these objects move?
          if (!lastObjMovs[aOId] && !lastObjMovs[bOId]) continue;

          if (!doesOverlap(ac, bc)) {
            // a miss
            continue;
          }

          const a = _objDict.get(aOId)!;
          const b = _objDict.get(bOId)!;

          // NOTE: if we make it to here, we consider this a collision that needs rebound

          // uniquely identify this pair of objects
          const abOId = idPair(aOId, bOId);

          // uniquely identify this pair of colliders
          const abCId = idPair(aCId, bCId);

          // record the real collision, per objects
          if (!_collisionPairs.has(abOId)) {
            _collisionPairs.add(abOId);
            collidesWith.get(aOId)!.push(bOId);
            collidesWith.get(bOId)!.push(aOId);
          }

          // solid objects rebound
          if (a.collider.solid && b.collider.solid) {
            // we only support rebound for objects within the same parent reference frame
            if (
              ac.parentOId !== bc.parentOId &&
              ac.parentOId !== bc.oId &&
              bc.parentOId !== ac.oId
            )
              continue;

            // compute contact info
            // TODO(@darzu): do we need to calculate contact data for non-solids?
            // TODO(@darzu): aggregate contact data as one dir per other obj
            // TODO(@darzu): maybe the winning direction in a multi-direction battle should be the one with the biggest rebound
            // TODO(@darzu): NARROW PHASE: we need to use GJK-based contact data calc
            const contData = computeContactData(ac, bc);
            // TODO(@darzu): this just keeps the latest contact data, should we keep all?
            contactData.set(abCId, contData);

            // compute rebound info
            // TODO(@darzu): rebound calc per collider, move-frac aggregated per object
            // TODO(@darzu): NARROW PHASE: we need to use GJK-based rebound data calc
            const rebData = computeReboundData(ac, bc, itr);
            reboundData.set(abCId, rebData);

            // TODO(@darzu): PARENT. obj movement needs to be done in the right parent frame

            // update how much we need to rebound objects by
            const { aRebound, bRebound } = rebData;
            if (aRebound < Infinity)
              nextObjMovFracs[aOId] = Math.max(
                nextObjMovFracs[aOId] || 0,
                aRebound
              );
            if (bRebound < Infinity)
              nextObjMovFracs[bOId] = Math.max(
                nextObjMovFracs[bOId] || 0,
                bRebound
              );
          }
        }

        // adjust objects Rebound to compensate for collisions
        anyMovement = false;
        for (let o of objs) {
          let movFrac = nextObjMovFracs[o.id];
          if (movFrac) {
            // TODO(@darzu): PARENT. this needs to rebound in the parent frame, not world frame
            const refl = tempVec();
            vec3.sub(refl, o._phys.lastLocalPos, o.position);
            vec3.scale(refl, refl, movFrac);
            vec3.add(o.position, o.position, refl);

            // translate non-sweep AABBs
            for (let c of o._phys.colliders) {
              // TODO(@darzu): PARENT. translate world AABBs?
              vec3.add(c.localAABB.min, c.localAABB.min, refl);
              vec3.add(c.localAABB.max, c.localAABB.max, refl);
              vec3.add(c.localPos, c.localPos, refl);
            }

            // track that some movement occured
            anyMovement = true;
          }

          // record which objects moved from this iteration,
          // reset movement fractions for next iteration
          lastObjMovs[o.id] = !!nextObjMovFracs[o.id];
          nextObjMovFracs[o.id] = 0;
        }

        itr++;
      }

      // remember current state for next time
      // TODO(@darzu): needed any more since colliders track these now?
      // TODO(@darzu): it'd be great to expose this to e.g. phys sandboxes
      for (let o of objs) {
        vec3.copy(o._phys.lastLocalPos, o.position);
      }

      // update out checkRay function
      res.physicsResults.checkRay = (r: Ray) => {
        const motHits = collidersCheckRay(r);
        const hits: RayHit[] = [];
        for (let mh of motHits) {
          // NOTE: the IDs in the RayHits from collidersCheckRay
          //  are collider indices not entity IDs
          const c = res._physBColliders.colliders[mh.id];
          // TODO(@darzu): this is one of the places we would replace with narrow phase
          const dist = rayHitDist(c.aabb, r);
          if (!isNaN(dist)) hits.push({ id: c.oId, dist });
        }
        return hits;
      };
    },
    "physicsStepContact"
  );
}
