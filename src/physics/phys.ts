import { vec3 } from "../gl-matrix.js";
import { __isSMI } from "../util.js";
import {
  PhysicsObject,
  PhysicsState,
  registerPhysicsContactSystems,
  registerPhysicsStateInit,
  registerUpdateLocalPhysicsAfterRebound,
  registerUpdateWorldAABBs,
} from "./nonintersection.js";
import { EntityManager } from "../entity-manager.js";
import { registerPhysicsDebuggerSystem } from "./phys-debug.js";
import {
  registerPhysicsClampVelocityByContact,
  registerPhysicsClampVelocityBySize,
  registerPhysicsApplyLinearVelocity,
  registerPhysicsApplyAngularVelocity,
} from "./velocity-system.js";
import {
  Frame,
  registerUpdateLocalFromPosRotScale,
  registerUpdateWorldFromLocalAndParent,
} from "./transform.js";
import { Collider } from "./collider.js";
import { AABB } from "./broadphase.js";

// TODO(@darzu): PHYSICS TODO:
// - seperate rotation and motion w/ constraint checking between them
// - impl GJK
// - keep simplifying the systems
// - seperate out PhysicsResults and PhysicsState into component parts
// - re-name and re-org files

export function registerPhysicsSystems(em: EntityManager) {
  registerPhysicsStateInit(em);

  registerPhysicsClampVelocityByContact(em);
  registerPhysicsClampVelocityBySize(em);
  registerPhysicsApplyLinearVelocity(em);
  registerPhysicsApplyAngularVelocity(em);
  registerUpdateLocalFromPosRotScale(em);
  registerUpdateWorldFromLocalAndParent(em);
  registerUpdateWorldAABBs(em);
  registerPhysicsContactSystems(em);
  // registerUpdateWorldFromPosRotScale(em);
  registerUpdateLocalPhysicsAfterRebound(em);
  // TODO(@darzu): get rid of this duplicate call?
  registerUpdateWorldFromLocalAndParent(em, "2");

  registerPhysicsDebuggerSystem(em);
}

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

export const PAD = 0.001; // TODO(@darzu): not sure if we can get away without this

export interface ContactObj {
  id: number;
  _phys: { lastWPos: vec3; worldAABB: AABB };
}

export function computeContactData(a: ContactObj, b: ContactObj): ContactData {
  let dist = -Infinity;
  let dim = -1;
  let dir = 0;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
    // determine who is to the left in this dimension
    let left: ContactObj;
    let right: ContactObj;
    if (a._phys.lastWPos[i] < b._phys.lastWPos[i]) {
      left = a;
      right = b;
    } else {
      left = b;
      right = a;
    }

    const newDist = right._phys.worldAABB.min[i] - left._phys.worldAABB.max[i];
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

export function computeReboundData(
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
    if (a._phys.lastWPos[i] < b._phys.lastWPos[i]) {
      left = a;
      right = b;
    } else {
      left = b;
      right = a;
    }

    const overlap = left._phys.worldAABB.max[i] - right._phys.worldAABB.min[i];
    if (overlap <= 0) continue; // no overlap to deal with

    const leftMaxContrib = Math.max(
      0,
      left.world.position[i] - left._phys.lastWPos[i]
    );
    const rightMaxContrib = Math.max(
      0,
      right._phys.lastWPos[i] - right.world.position[i]
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
      Math.sign(a._phys.lastWPos[aDim] - a.world.position[aDim]) * aOverlapNum;

  const bOverlap = vec3.fromValues(0, 0, 0);
  if (0 < bDim)
    bOverlap[bDim] =
      Math.sign(b._phys.lastWPos[bDim] - b.world.position[bDim]) * bOverlapNum;

  return { aId: a.id, bId: b.id, aRebound, bRebound, aOverlap, bOverlap };
}
