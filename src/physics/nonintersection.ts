import { Collider, ColliderDef, DefaultLayer, Layer } from "./collider.js";
import { Entity } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import {
  CollidesWith,
  computeContactData,
  computeReboundData,
  ContactData,
  PAD,
  ReboundData,
} from "./phys.js";
import {
  checkBroadphase,
  collisionPairs,
  Ray,
  RayHit,
  rayVsAABBHitDist,
  resetCollidesWithSet,
} from "./broadphase.js";
import {
  AABB,
  aabbCenter,
  copyAABB,
  createAABB,
  doesOverlapAABB,
  doesTouchAABB,
  transformAABB,
} from "./aabb.js";
import {
  Frame,
  IDENTITY_FRAME,
  PhysicsParent,
  PhysicsParentDef,
  PositionDef,
  ReadonlyFrame,
  TransformDef,
  createFrame,
  updateFrameFromPosRotScale,
} from "./transform.js";
import { IdPair, idPair } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
import { vec3Dbg } from "../utils/utils-3d.js";

const DBG_FIRST_FRAME_MOV = true;

// TODO(@darzu): we use "object", "obj", "o" everywhere in here, we should use "entity", "ent", "e"

// TODO(@darzu): break up PhysicsResults
// TODO(@darzu): rename "BroadphaseResults" ?
export const PhysicsResultsDef = EM.defineResource("physicsResults", () => {
  return {
    collidesWith: new Map<number, number[]>() as CollidesWith,
    reboundData: new Map<IdPair, ReboundData>(),
    contactData: new Map<IdPair, ContactData>(),
    checkRay: (r: Ray) => [] as RayHit[],
  };
});
export type PhysicsResults = Component<typeof PhysicsResultsDef>;

// TODO(@darzu): MOVE!
export const WorldFrameDef = EM.defineComponent("world", () => createFrame());

export interface PhysCollider {
  // NOTE: we use "id" and "aabb" here b/c broadphase looks for a struct with those
  id: number;
  oId: number;
  parentOId: number;
  // TODO(@darzu): RENAME. Which is worldAABB?
  aabb: AABB;
  localAABB: AABB;
  selfAABB: AABB;
  // TODO(@darzu): NARROW PHASE: add optional more specific collider types here
  // TODO(@darzu): pos, lastPos need to be tracked per parent space
  localPos: V3;
  lastLocalPos: V3;
  // each of these is a 16 bit mask
  myLayer: number;
  targetLayer: number;
}

const DUMMY_COLLIDER: PhysCollider = {
  id: 0,
  oId: 0,
  aabb: { min: V(0, 0, 0), max: V(0, 0, 0) },
  localAABB: { min: V(0, 0, 0), max: V(0, 0, 0) },
  selfAABB: { min: V(0, 0, 0), max: V(0, 0, 0) },
  parentOId: 0,
  localPos: V(0, 0, 0),
  lastLocalPos: V(0, 0, 0),
  myLayer: DefaultLayer,
  targetLayer: DefaultLayer,
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
    // for debugging when objects start w/ intersecting each other
    dbgFirstFrame: true,
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

// PRECONDITION: assumes world frames are all up to date
export function registerUpdateWorldAABBs(s: string = "") {
  EM.addSystem(
    "updateWorldAABBs",
    Phase.PHYSICS_WORLD_FROM_LOCAL,
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
          // TODO(@darzu): do we want to update lastPos here? different than obj last pos
          V3.copy(wc.lastLocalPos, wc.localPos);
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
    }
  );
}

export const PhysicsBroadCollidersDef = EM.defineResource(
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

export function registerPhysicsStateInit() {
  EM.addResource(PhysicsResultsDef);
  EM.addResource(PhysicsBroadCollidersDef);

  // TODO(@darzu): actually, this doesn't seem needed? delete?
  // // rectify dead objects with the physics system.
  // // TODO(@darzu): idk about this DeadDef thing
  // EM.registerSystem(
  //   [ColliderDef, PositionDef, DeadDef],
  //   [PhysicsBroadCollidersDef],
  //   (objs, { _physBColliders }) => {
  //     for (let o of objs) {
  //       // reset collider state for dead objects so that the last frame
  //       // of their previous life doesn't impact them
  //       if (PhysicsStateDef.isOn(o)) {
  //         for (let c of o._phys.colliders) {
  //           vec3.zero(c.localPos);
  //           vec3.zero(c.lastLocalPos);
  //         }
  //       }
  //     }
  //   },
  //   "physicsDeadStuff"
  // );

  // init the per-object physics state
  // TODO(@darzu): split this into different concerns
  EM.addSystem(
    "physicsInit",
    Phase.PRE_PHYSICS,
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
              V3.copy(c.localPos, o.position);
              V3.copy(c.lastLocalPos, o.position);
            }
          }

          continue;
        }
        const parentId = PhysicsParentDef.isOn(o) ? o.physicsParent.id : 0;
        EM.set(o, PhysicsStateDef);
        const _phys = o._phys;

        // AABBs (collider derived)
        // TODO(@darzu): handle scale
        if (o.collider.shape === "AABB") {
          _phys.colliders.push(
            mkCollider(
              o.collider.aabb,
              o.id,
              parentId,
              o.collider.myLayer,
              o.collider.targetLayer
            )
          );
        } else if (o.collider.shape === "Multi") {
          for (let c of o.collider.children) {
            if (c.shape !== "AABB")
              throw `Unimplemented child collider shape: ${c.shape}`;
            _phys.colliders.push(
              mkCollider(
                c.aabb,
                o.id,
                parentId,
                o.collider.myLayer,
                o.collider.targetLayer
              )
            );
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
        parentOId: number,
        myLayer?: Layer,
        targetLayer?: Layer
      ): PhysCollider {
        const cId = _physBColliders.nextId;
        _physBColliders.nextId += 1;
        if (_physBColliders.nextId > 2 ** 15)
          console.warn(`Halfway through collider IDs!`);

        // figure out layers
        const my = myLayer ?? DefaultLayer;
        const target = targetLayer ?? DefaultLayer;

        // TODO(@darzu): debugging layers
        // console.log(
        //   `${cId}:\nme${toBinary(my, 16)}\ntr${toBinary(target, 16)}`
        // );

        const c: PhysCollider = {
          id: cId,
          oId,
          parentOId,
          aabb: copyAABB(createAABB(), selfAABB),
          localAABB: copyAABB(createAABB(), selfAABB),
          selfAABB: copyAABB(createAABB(), selfAABB),
          localPos: aabbCenter(V3.mk(), selfAABB),
          lastLocalPos: aabbCenter(V3.mk(), selfAABB),
          myLayer: my,
          targetLayer: target,
        };
        _physBColliders.colliders.push(c);
        return c;
      }
    }
  );
}

export function registerUpdateInContactSystems() {
  EM.addSystem(
    "updatePhysInContact",
    Phase.PHYSICS_CONTACT,
    [ColliderDef, PhysicsStateDef, WorldFrameDef],
    [PhysicsBroadCollidersDef, PhysicsResultsDef],
    (objs, res) => {
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
    }
  );
}

export function registerPhysicsContactSystems() {
  // TODO(@darzu): split this system
  EM.addSystem(
    "physicsStepContact",
    Phase.PHYSICS_CONTACT,
    [ColliderDef, PhysicsStateDef, PositionDef, WorldFrameDef],
    [PhysicsBroadCollidersDef, PhysicsResultsDef],
    (objs, res) => {
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
      // TODO(@darzu): I'd be great to have some sort of dbg flag that let us know when objects were moved during game init
      let anyMovement = true;
      let itr = 0;

      while (anyMovement /*or first itr*/ && itr < COLLISION_MAX_ITRS) {
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

          // did one of these objects move (or is it the first iteration)?
          if (!lastObjMovs[aOId] && !lastObjMovs[bOId]) continue;

          // are these objects interested in each other?
          const aTargetsB = (ac.targetLayer & bc.myLayer) !== 0b0;
          const bTargetsA = (bc.targetLayer & ac.myLayer) !== 0b0;
          if (!aTargetsB && !bTargetsA) continue;

          if (!doesOverlap(ac, bc)) {
            // a miss
            continue;
          }

          // IT IS A COLLISION!

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
          const objDoesMov = !!movFrac;
          if (objDoesMov) {
            // TODO(@darzu): PARENT. this needs to rebound in the parent frame, not world frame
            const refl = V3.tmp();
            V3.sub(o._phys.lastLocalPos, o.position, refl);
            V3.scale(refl, movFrac, refl);
            V3.add(o.position, refl, o.position);

            // translate non-sweep AABBs
            for (let c of o._phys.colliders) {
              // TODO(@darzu): PARENT. translate world AABBs?
              V3.add(c.localAABB.min, refl, c.localAABB.min);
              V3.add(c.localAABB.max, refl, c.localAABB.max);
              V3.add(c.localPos, refl, c.localPos);
            }

            // track that some movement occured
            anyMovement = true;

            if (DBG_FIRST_FRAME_MOV && o._phys.dbgFirstFrame)
              console.warn(
                `Object '${o.id}' is being moved ${vec3Dbg(
                  refl
                )} by contact constraints on its first frame.` +
                  ` Consider using ColliderBase.myLayer/.targetLayer or TeleportDef.`
              );
          }

          // record which objects moved from this iteration,
          // reset movement fractions for next iteration
          lastObjMovs[o.id] = objDoesMov;
          nextObjMovFracs[o.id] = 0;
        }

        itr++;
      }

      // remember current state for next time
      // TODO(@darzu): needed any more since colliders track these now?
      // TODO(@darzu): it'd be great to expose this to e.g. phys sandboxes
      for (let o of objs) {
        V3.copy(o._phys.lastLocalPos, o.position);
      }

      // update output checkRay function
      res.physicsResults.checkRay = (r: Ray) => {
        const motHits = collidersCheckRay(r);
        const hits: RayHit[] = [];
        for (let mh of motHits) {
          // NOTE: the IDs in the RayHits from collidersCheckRay
          //  are collider indices not entity IDs
          const c = res._physBColliders.colliders[mh.id];
          // TODO(@darzu): this is one of the places we would replace with narrow phase
          const dist = rayVsAABBHitDist(c.aabb, r);
          if (!isNaN(dist)) hits.push({ id: c.oId, dist });
        }
        return hits;
      };

      if (DBG_FIRST_FRAME_MOV)
        for (let o of objs) o._phys.dbgFirstFrame = false;
    }
  );
}
