import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { dbgDirOnce, __isSMI } from "../utils/util.js";
import {
  PhysCollider,
  PhysicsObject,
  PhysicsState,
  registerPhysicsContactSystems,
  registerPhysicsStateInit,
  registerUpdateInContactSystems,
  registerUpdateWorldAABBs,
} from "./nonintersection.js";
import { EntityManager } from "../ecs/entity-manager.js";
import { registerPhysicsDebuggerSystem } from "./phys-debug.js";
import {
  registerPhysicsClampVelocityByContact,
  registerPhysicsClampVelocityBySize,
} from "../motion/velocity-clamp.js";
import {
  Frame,
  registerUpdateLocalFromPosRotScale,
  registerUpdateWorldFromLocalAndParent,
} from "./transform.js";
import { Collider } from "./collider.js";
import { AABB, aabbCenter } from "./aabb.js";
import { registerNarrowPhaseSystems } from "./narrowphase.js";
import { assert } from "../utils/util.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import {
  registerPhysicsApplyLinearVelocity,
  registerPhysicsApplyAngularVelocity,
} from "../motion/velocity.js";
import { Phase } from "../ecs/sys-phase.js";

// TODO(@darzu): PHYSICS TODO:
// [ ] seperate rotation and motion w/ constraint checking between them
// [x] impl GJK
// [ ] keep simplifying the systems
// [ ] seperate out PhysicsResults and PhysicsState into component parts
// [ ] re-name and re-org files
// [ ] ensure all systems run together per step
// [ ] PERF: dont alloc new vecs in getAABBCorners
// [ ] PERF: use sweepAABBs again?
// [ ] layers and masks
// [ ] specify which objects may non-intersect; then do non-intersection heirarchachly
// [ ] PERF: matrix inversion should be done once per parent

export function registerPhysicsSystems(em: EntityManager) {
  registerPhysicsStateInit(em);

  registerPhysicsClampVelocityByContact(em);
  registerPhysicsClampVelocityBySize(em);
  registerPhysicsApplyLinearVelocity(em);
  registerPhysicsApplyAngularVelocity(em);
  registerUpdateLocalFromPosRotScale(em);
  registerUpdateWorldFromLocalAndParent(
    em,
    "1",
    Phase.PHYSICS_WORLD_FROM_LOCAL
  );
  registerUpdateWorldAABBs(em);
  registerUpdateInContactSystems(em);
  registerPhysicsContactSystems(em);
  // TODO(@darzu): positioning?
  registerNarrowPhaseSystems(em);
  // TODO(@darzu): get rid of this duplicate call?
  registerUpdateWorldFromLocalAndParent(em, "2", Phase.PHYSICS_FINISH_WORLD);

  registerPhysicsDebuggerSystem(em);
}

export type CollidesWith = Map<number, number[]>;
export interface ReboundData {
  aRebound: number;
  bRebound: number;
  aCId: number;
  bCId: number;
  parentOId: number;
}

export interface ContactData {
  bToANorm: vec3;
  dist: number;
  aCId: number;
  bCId: number;
  parentOId: number;
}

export const PAD = 0.001; // TODO(@darzu): not sure if we can get away without this

export function computeContactData(
  a: PhysCollider,
  b: PhysCollider
): ContactData {
  let aAABB = a.localAABB;
  let lastAPos = a.lastLocalPos;
  let bAABB = b.localAABB;
  let lastBPos = b.lastLocalPos;
  let parentOId = a.parentOId;

  if (a.parentOId === b.oId) {
    bAABB = b.selfAABB;
    lastBPos = aabbCenter(tempVec3(), b.selfAABB);
    parentOId = b.oId;
  } else if (b.parentOId === a.oId) {
    aAABB = a.selfAABB;
    lastAPos = aabbCenter(tempVec3(), a.selfAABB);
    parentOId = a.oId;
  } else {
    assert(
      a.parentOId === b.parentOId,
      `Cannot compute contact data between objs in different parent frames; ${a.parentOId} vs ${b.parentOId}`
    );
  }

  const res = computeContactDataInternal(aAABB, lastAPos, bAABB, lastBPos);
  return {
    ...res,
    aCId: a.id,
    bCId: b.id,
    parentOId,
  };
}

export function computeReboundData(
  a: PhysCollider,
  b: PhysCollider,
  itr: number
): ReboundData {
  let aAABB = a.localAABB;
  let lastAPos = a.lastLocalPos;
  let aPos = a.localPos;
  let bAABB = b.localAABB;
  let lastBPos = b.lastLocalPos;
  let bPos = b.localPos;
  let parentOId = a.parentOId;

  if (a.parentOId === b.oId) {
    bAABB = b.selfAABB;
    bPos = aabbCenter(tempVec3(), b.selfAABB);
    lastBPos = bPos;
    parentOId = b.oId;
  } else if (b.parentOId === a.oId) {
    aAABB = a.selfAABB;
    aPos = aabbCenter(tempVec3(), a.selfAABB);
    lastAPos = aPos;
    parentOId = a.oId;
  } else {
    assert(
      a.parentOId === b.parentOId,
      "Cannot compute rebound data between objs in different parent frames"
    );
  }

  const res = computeReboundDataInternal(
    aAABB,
    lastAPos,
    aPos,
    bAABB,
    lastBPos,
    bPos,
    itr
  );
  return {
    ...res,
    aCId: a.id,
    bCId: b.id,
    parentOId,
  };
}

function computeContactDataInternal(
  a: AABB,
  aLastPos: vec3,
  b: AABB,
  bLastPos: vec3
): {
  bToANorm: vec3;
  dist: number;
} {
  let dist = -Infinity;
  let dim = -1;
  let dir = 0;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
    // determine who is to the left in this dimension
    let left: AABB;
    let right: AABB;
    if (aLastPos[i] < bLastPos[i]) {
      left = a;
      right = b;
    } else {
      left = b;
      right = a;
    }

    // update min distance and its dimension
    const newDist = right.min[i] - left.max[i];
    if (dist < newDist) {
      dist = newDist;
      dim = i;
      dir = a === left ? -1 : 1;
    }
  }

  const bToANorm = V(0, 0, 0);
  if (dim >= 0) bToANorm[dim] = dir;

  return {
    bToANorm,
    dist,
  };
}
function computeReboundDataInternal(
  a: AABB,
  aLastPos: vec3,
  aCurrPos: vec3,
  b: AABB,
  bLastPos: vec3,
  bCurrPos: vec3,
  itr: number
): {
  aRebound: number;
  bRebound: number;
} {
  // determine how to readjust positions
  let aRebound = Infinity;
  let bRebound = Infinity;

  // for each of X,Y,Z dimensions
  for (let i = 0; i < 3; i++) {
    // determine who is to the left in this dimension
    const aIsLeft = aLastPos[i] < bLastPos[i];
    const left = aIsLeft ? a : b;
    const leftLastPos = aIsLeft ? aLastPos : bLastPos;
    const leftCurrPos = aIsLeft ? aCurrPos : bCurrPos;
    const right = !aIsLeft ? a : b;
    const rightLastPos = !aIsLeft ? aLastPos : bLastPos;
    const rightCurrPos = !aIsLeft ? aCurrPos : bCurrPos;

    // check overlap
    const overlap = left.max[i] - right.min[i];
    if (overlap <= 0) continue; // no overlap to deal with

    // determine possible contributions
    const leftMaxContrib = Math.max(0, leftCurrPos[i] - leftLastPos[i]);
    const rightMaxContrib = Math.max(0, rightLastPos[i] - rightCurrPos[i]);
    if (leftMaxContrib + rightMaxContrib < overlap - PAD * itr)
      // rebounding wouldn't fix our collision so don't try
      continue;
    if (leftMaxContrib === 0 && rightMaxContrib === 0)
      // no movement possible or necessary
      continue;

    const f = Math.min(
      1.0,
      (overlap + PAD) / (leftMaxContrib + rightMaxContrib)
    );

    // update the dimension-spanning "a" and "b" fractions
    const aMaxContrib = left === a ? leftMaxContrib : rightMaxContrib;
    const bMaxContrib = left === b ? leftMaxContrib : rightMaxContrib;
    if (0 < aMaxContrib && f < aRebound) aRebound = f;
    if (0 < bMaxContrib && f < bRebound) bRebound = f;
  }

  return { aRebound, bRebound };
}

// TODO(@darzu): Do we ever need overlap?
// export function computeOverlapData(
//   a: ReboundObj,
//   b: ReboundObj,
//   itr: number
// ): ReboundData {
//   // determine how to readjust positions
//   let aRebound = Infinity;
//   let aDim = -1;
//   let aOverlapNum = 0;
//   let bRebound = Infinity;
//   let bDim = -1;
//   let bOverlapNum = 0;

//   // for each of X,Y,Z dimensions
//   for (let i = 0; i < 3; i++) {
//     // determine who is to the left in this dimension
//     let left: ReboundObj;
//     let right: ReboundObj;
//     if (a.lastPos[i] < b.lastPos[i]) {
//       left = a;
//       right = b;
//     } else {
//       left = b;
//       right = a;
//     }

//     const overlap = left.aabb.max[i] - right.aabb.min[i];
//     if (overlap <= 0) continue; // no overlap to deal with

//     const leftMaxContrib = Math.max(
//       0,
//       left.currPos[i] - left.lastPos[i]
//     );
//     const rightMaxContrib = Math.max(
//       0,
//       right.lastPos[i] - right.currPos[i]
//     );
//     if (leftMaxContrib + rightMaxContrib < overlap - PAD * itr) continue;
//     if (leftMaxContrib === 0 && rightMaxContrib === 0)
//       // no movement possible or necessary
//       continue;

//     // TODO(@darzu): wait, these fractions are slightly wrong, I need to account for leftFracRemaining
//     const f = Math.min(
//       1.0,
//       (overlap + PAD) / (leftMaxContrib + rightMaxContrib)
//     );

//     // update the dimension-spanning "a" and "b" fractions
//     const aMaxContrib = left === a ? leftMaxContrib : rightMaxContrib;
//     const bMaxContrib = left === b ? leftMaxContrib : rightMaxContrib;
//     if (0 < aMaxContrib) {
//       if (f < aRebound) {
//         aRebound = f;
//         aDim = i;
//         aOverlapNum = overlap;
//       }
//     }
//     if (0 < bMaxContrib) {
//       if (f < bRebound) {
//         bRebound = f;
//         bDim = i;
//         bOverlapNum = overlap;
//       }
//     }
//   }

//   const aOverlap = V(0, 0, 0); // TODO(@darzu): perf; unnecessary alloc
//   if (0 < aDim)
//     aOverlap[aDim] =
//       Math.sign(a.lastPos[aDim] - a.currPos[aDim]) * aOverlapNum;

//   const bOverlap = V(0, 0, 0);
//   if (0 < bDim)
//     bOverlap[bDim] =
//       Math.sign(b.lastPos[bDim] - b.currPos[bDim]) * bOverlapNum;

//   return { aId: a.id, bId: b.id, aRebound, bRebound, aOverlap, bOverlap };
// }
