import { Collider, ColliderDef } from "./collider.js";
import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { PhysicsTimerDef } from "../time.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
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
  aabbCenter,
  checkBroadphase,
  collisionPairs,
  copyAABB,
  createAABB,
  doesOverlap,
  doesTouch,
  getAABBFromPositions,
  Ray,
  RayHit,
  rayHitDist,
  resetCollidesWithSet,
} from "./broadphase.js";
import {
  Frame,
  IDENTITY_FRAME,
  PhysicsParent,
  PhysicsParentDef,
  PositionDef,
  ReadonlyFrame,
  TransformDef,
  updateFrameFromPosRotScale,
  updateFrameFromTransform,
} from "./transform.js";
import { assert } from "../test.js";

// TODO(@darzu): we use "object", "obj", "o" everywhere in here, we should use "entity", "ent", "e"

// TODO(@darzu): break up PhysicsResults
export const PhysicsResultsDef = EM.defineComponent("physicsResults", () => {
  return {
    collidesWith: new Map<number, number[]>() as CollidesWith,
    reboundData: new Map<IdPair, ReboundData>(),
    contactData: new Map<IdPair, ContactData>(),
    checkRay: (r: Ray) => [] as RayHit[],
  };
});
export type PhysicsResults = Component<typeof PhysicsResultsDef>;

function createFrame(): Frame {
  return {
    position: vec3.create(),
    rotation: quat.create(),
    scale: vec3.fromValues(1, 1, 1),
    transform: mat4.create(),
  };
}

export const WorldFrameDef = EM.defineComponent("world", () => createFrame());

export interface IndexedAABB {
  id: number;
  oId: number;
  aabb: AABB;
  pos: vec3;
  lastPos: vec3;
}

// TODO(@darzu): break this up into the specific use cases
export const PhysicsStateDef = EM.defineComponent("_phys", () => {
  return {
    // track last stats so we can diff
    lastPos: PositionDef.construct(),
    // Colliders
    // TODO(@darzu): actually just use pointers...
    localAABBs: [] as number[],
    worldAABBs: [] as number[],
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

const _collisionRefl = vec3.create();

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

// TODO(@darzu): PRECONDITION: assumes world frames are all up to date
export function registerUpdateWorldAABBs(em: EntityManager, s: string = "") {
  em.registerSystem(
    [PhysicsStateDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsBroadCollidersDef],
    (objs, res) => {
      for (let o of objs) {
        // update collider AABBs
        for (let i = 0; i < o._phys.worldAABBs.length; i++) {
          const lc = res._physBColliders.colliders[o._phys.localAABBs[i]];
          const wc = res._physBColliders.colliders[o._phys.worldAABBs[i]];
          // TODO(@darzu): highly inefficient
          const wCorners = getAABBCorners(lc.aabb).map((p) =>
            vec3.transformMat4(p, p, o.world.transform)
          );
          copyAABB(wc.aabb, getAABBFromPositions(wCorners));
          // TODO(@darzu): do we want to update lastPos here? different than obj last pos
          vec3.copy(wc.lastPos, wc.pos);
          aabbCenter(wc.pos, wc.aabb);
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

export function registerUpdateLocalPhysicsAfterRebound(
  em: EntityManager,
  s: string = ""
) {
  em.registerSystem(
    [PhysicsStateDef, WorldFrameDef, TransformDef],
    [PhysicsTimerDef, PhysicsResultsDef, PhysicsBroadCollidersDef],
    (objs, res) => {
      if (!res.physicsTimer.steps) return;

      // TODO(@darzu):  move this into reboundData?
      const hasRebound: Set<number> = new Set();
      for (let [_, data] of res.physicsResults.reboundData) {
        if (data.aRebound < Infinity)
          hasRebound.add(res._physBColliders.colliders[data.aCId].oId);
        if (data.bRebound < Infinity)
          hasRebound.add(res._physBColliders.colliders[data.bCId].oId);
      }

      for (let o of objs)
        if (hasRebound.has(o.id)) updateFrameFromPosRotScale(o.world);

      for (let o of objs) {
        if (!hasRebound.has(o.id)) continue;

        // find parent transforms
        // TODO(@darzu): matrix inversion should be done once per parent
        let worldToParent = mat4.IDENTITY;
        let parentToWorld = mat4.IDENTITY;
        if (PhysicsParentDef.isOn(o)) {
          const parent = EM.findEntity(o.physicsParent.id, [WorldFrameDef]);
          if (parent) {
            parentToWorld = parent.world.transform;
            worldToParent = mat4.invert(mat4.create(), parent.world.transform);
          }
        }

        const localToWorld = o.world.transform;
        mat4.multiply(o.transform, worldToParent, localToWorld);

        updateFrameFromTransform(o);
      }
    },
    "registerUpdateLocalPhysicsAfterRebound" + s
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
      nextId: 0,
      // TODO(@darzu): support removing colliders
      colliders: [] as IndexedAABB[],
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
    [ColliderDef],
    [PhysicsBroadCollidersDef],
    (objs, { _physBColliders }) => {
      for (let o of objs) {
        if (PhysicsStateDef.isOn(o)) continue;
        const _phys = em.addComponent(o.id, PhysicsStateDef);

        // AABBs (collider derived)
        // TODO(@darzu): handle scale
        if (o.collider.shape === "AABB") {
          _phys.worldAABBs.push(mkCollider(o.collider.aabb, o.id));
          _phys.localAABBs.push(mkCollider(o.collider.aabb, o.id));
        } else if (o.collider.shape === "Multi") {
          for (let c of o.collider.children) {
            if (c.shape !== "AABB")
              throw `Unimplemented child collider shape: ${c.shape}`;
            _phys.worldAABBs.push(mkCollider(c.aabb, o.id));
            _phys.localAABBs.push(mkCollider(c.aabb, o.id));
          }
        } else {
          throw `Unimplemented collider shape: ${o.collider.shape}`;
        }

        // copyAABB(_phys.localAABB, o.collider.aabb);
        // copyAABB(_phys.worldAABB, _phys.localAABB);
        // copyAABB(_phys.sweepAABB, _phys.localAABB);
      }

      function mkCollider(aabb: AABB, oId: number): number {
        const cId = _physBColliders.nextId++;
        _physBColliders.colliders.push({
          id: cId,
          oId,
          aabb: copyAABB(createAABB(), aabb),
          pos: aabbCenter(vec3.create(), aabb),
          lastPos: aabbCenter(vec3.create(), aabb),
        });
        return cId;
      }
    },
    "physicsInit"
  );
}

export function registerPhysicsContactSystems(em: EntityManager) {
  em.registerSystem(
    [ColliderDef, PhysicsStateDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsBroadCollidersDef],
    (objs, res) => {
      // TODO(@darzu): interestingly, this system doesn't need the step count
      if (!res.physicsTimer.steps) return;

      // build a dict
      _objDict.clear();
      for (let o of objs) _objDict.set(o.id, o);

      // get singleton data
      const { physicsResults } = EM.findSingletonComponent(PhysicsResultsDef)!;
      const { collidesWith, contactData, reboundData } = physicsResults;

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

        // colliding again so we don't need any adjacency checks
        if (doesOverlap(ac.aabb, bc.aabb)) {
          const newData = computeContactData(ac, ac.lastPos, bc, bc.lastPos);
          contactData.set(contactId, { ...lastData, ...newData });
          continue;
        }

        // check for adjacency even if not colliding
        // TODO(@darzu): do we need to consider relative motions?
        //    i.e. a check to see if the two objects are pressing into each other?
        //    for now I'm ignoring this b/c it doesn't seem harmful to consider non-pressing as contact
        if (doesTouch(ac.aabb, bc.aabb, 2 * PAD)) {
          const newData = computeContactData(ac, ac.lastPos, bc, bc.lastPos);
          contactData.set(contactId, { ...lastData, ...newData });
          continue;
        }

        // else, this collision isn't valid any more
        contactData.delete(contactId);
      }

      // reset collision data
      resetCollidesWithSet(collidesWith, objs);
      reboundData.clear();
      _collisionPairs.clear();

      // check for possible collisions using the motion swept AABBs
      // TODO(@darzu): cull out unused/deleted colliders
      const currColliders = objs
        .map((o) =>
          o._phys.worldAABBs.map((cId) => res._physBColliders.colliders[cId])
        )
        .reduce((p, n) => [...p, ...n], [] as IndexedAABB[]);
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

          // TODO(@darzu): this is one of the places we would replace with narrow-phase checking
          if (!doesOverlap(ac.aabb, bc.aabb)) {
            // a miss
            continue;
          }

          const a = _objDict.get(aOId)!;
          const b = _objDict.get(bOId)!;

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

          // compute contact info
          // TODO(@darzu): aggregate contact data as one dir per other obj
          // TODO(@darzu): maybe the winning direction in a multi-direction battle should be the one with the biggest rebound
          const contRes = computeContactData(ac, ac.lastPos, bc, bc.lastPos);
          const contData: ContactData = {
            ...contRes,
            aCId: aCId,
            bCId: bCId,
          };
          // TODO(@darzu): this just keeps the latest contact data, should we keep all?
          contactData.set(abCId, contData);

          // solid objects rebound
          if (a.collider.solid && b.collider.solid) {
            // compute rebound info
            // TODO(@darzu): rebound calc per collider, move-frac aggregated per object
            const rebData = computeReboundData(
              ac,
              ac.lastPos,
              ac.pos,
              bc,
              bc.lastPos,
              bc.pos,
              itr
            );
            reboundData.set(abCId, { ...rebData, aCId, bCId });

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
            // TODO(@darzu): MUTATING WORLD POS. We probably shouldn't do that here
            vec3.sub(_collisionRefl, o._phys.lastPos, o.world.position);
            vec3.scale(_collisionRefl, _collisionRefl, movFrac);
            vec3.add(o.world.position, o.world.position, _collisionRefl);

            // translate non-sweep AABBs
            for (let cId of o._phys.worldAABBs) {
              const c = res._physBColliders.colliders[cId];
              vec3.add(c.aabb.min, c.aabb.min, _collisionRefl);
              vec3.add(c.aabb.max, c.aabb.max, _collisionRefl);
              vec3.add(c.pos, c.pos, _collisionRefl);
            }

            // track that movement occured
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
      for (let o of objs) {
        vec3.copy(o._phys.lastPos, o.world.position);
      }

      // update out checkRay function
      physicsResults.checkRay = (r: Ray) => {
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
