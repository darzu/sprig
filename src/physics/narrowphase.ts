import { EntityManager, EntityW } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { ColorDef } from "../color.js";
import { LocalPlayerDef } from "../game/player.js";
import { vec3 } from "../gl-matrix.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { BoxCollider, Collider } from "./collider.js";
import { PhysicsObject, WorldFrameDef } from "./nonintersection.js";
import { PhysicsParentDef, PositionDef } from "./transform.js";
import { centroid, SupportFn, vec3Dbg } from "../utils-3d.js";
import { tempVec } from "../temp-pool.js";
import { PAD } from "./phys.js";
import { TupleN } from "../util.js";

// GJK: convex vs convex collision testing
//  https://www.youtube.com/watch?v=ajv46BSqcK4
//  https://www.youtube.com/watch?v=MDusDn8oTSE
// Also, for OOB (object oriented bounding box) use
//    "separating axis theorem"

// TODO(@darzu): interfaces worth thinking about:
// export interface ContactData {
//     aId: number;
//     bId: number;
//     bToANorm: vec3;
//     dist: number;
//   }
// export interface ReboundData {
//     aId: number;
//     bId: number;
//     aRebound: number;
//     bRebound: number;
//     aOverlap: vec3;
//     bOverlap: vec3;
//   }
// function computeReboundData(
//     a: PhysicsObject,
//     b: PhysicsObject,
//     itr: number
//   ): ReboundData {

/*
Box-based non-intersection
or
common-parent rotated AABBs non-intersection

leaning towards box-based as it's easier on the game dev.
needs seperate: rotation and translation non-intersection phases.
  likely we'll need pill colliders for players so they can rotate in a corner
*/

/*
TODO(@darzu):
Determine penetration
use EPA?
Hmm, I don't need the smallest vector, I need the vector along a particular direction
What if I just move my simplex towards that direction?
There is infact one distinct point of collision b/c the origin is a point 
  and the minkowski difference will travel towards the origin
Should this just be a ray cast from the origin back along the direction of travel towards
  the old minkowski difference?

EPA-ish:
  find the feature of the simplex in the dir we care about
  move past it
  check the next support point in that dir
  if it's not past the (new) origin, add it to the simplex and check that

*/

export function registerNarrowPhaseSystems(em: EntityManager) {
  // TODO(@darzu):
}

export type Shape = {
  center: vec3;
  support: SupportFn;
  travel: vec3;
};

export function doesSimplexOverlapOrigin(s: vec3[]) {
  if (s.length !== 4) return false;

  const tris = [
    [s[0], s[1], s[2]],
    [s[0], s[1], s[3]],
    [s[0], s[2], s[3]],
    [s[1], s[2], s[3]],
  ];

  const center = centroid(s);

  for (let t of tris) {
    const [C, B, A] = t;
    const AB = vec3.sub(vec3.create(), B, A);
    const AC = vec3.sub(vec3.create(), C, A);
    const ABCperp = vec3.cross(vec3.create(), AB, AC);
    vec3.normalize(ABCperp, ABCperp);
    const triCenter = centroid(t);
    const triCenterToSimplexCenter = vec3.sub(vec3.create(), center, triCenter);
    vec3.normalize(triCenterToSimplexCenter, triCenterToSimplexCenter);
    if (vec3.dot(ABCperp, triCenterToSimplexCenter) < 0)
      vec3.negate(ABCperp, ABCperp);
    const AO = vec3.sub(vec3.create(), [0, 0, 0], A);
    if (vec3.dot(ABCperp, AO) < 0) return false;
  }
  return true;
}

// minkowski difference support
function mSupport(s1: Shape, s2: Shape, d: vec3): vec3 {
  // TODO(@darzu):
  const nD = vec3.negate(tempVec(), d);
  return vec3.sub(tempVec(), s2.support(d), s1.support(nD));
}

// GJK visualization

// TODO(@darzu): so much perf to improve. #1: don't allocate
export function gjk(
  s1: Shape,
  s2: Shape
): [vec3, vec3, vec3, vec3] | undefined {
  let d: vec3 = tempVec();
  let simplex: vec3[] = [];
  let distToOrigin = Infinity;

  vec3.sub(d, s2.center, s1.center);
  vec3.normalize(d, d);
  simplex = [mSupport(s1, s2, d)];
  vec3.sub(d, [0, 0, 0], simplex[0]);
  vec3.normalize(d, d);
  let step = 0;
  while (true) {
    const A = mSupport(s1, s2, d);
    if (vec3.dot(A, d) < 0) {
      // console.log(`false on step: ${step}`);
      // console.log(`A: ${vec3Dbg(A)}, d: ${vec3Dbg(d)}`);
      // console.dir(simplex);
      return undefined;
    }
    step++;
    if (step > 100) {
      console.warn(`u oh, running too long`);
      return undefined;
    }
    // console.log(`adding: ${A}`);
    simplex.push(A);
    const newDist = vec3.len(centroid(simplex));
    // if (newDist > distToOrigin) {
    //   console.warn(`moving away from origin!`);
    // }
    distToOrigin = newDist;
    const intersects = handleSimplex();
    if (intersects) {
      if (!doesSimplexOverlapOrigin(simplex))
        console.error(`we dont think it actually overlaps origin`);
      // else console.log(`probably overlaps :)`);
      // console.log(`true on step: ${step}`);
      return [...simplex] as TupleN<vec3, 4>;
    }
  }

  function handleSimplex(): boolean {
    if (simplex.length === 2) {
      // line case
      const [B, A] = simplex;
      const AB = vec3.sub(tempVec(), B, A);
      const AO = vec3.sub(tempVec(), [0, 0, 0], A);
      const ABperp = tripleProd(tempVec(), AB, AO, AB);
      vec3.copy(d, ABperp);
      return false;
    } else if (simplex.length === 3) {
      // triangle case
      const [C, B, A] = simplex;
      const AB = vec3.sub(tempVec(), B, A);
      const AC = vec3.sub(tempVec(), C, A);
      const ABCperp = vec3.cross(tempVec(), AB, AC);
      const AO = vec3.sub(tempVec(), [0, 0, 0], A);
      if (vec3.dot(ABCperp, AO) < 0) vec3.negate(ABCperp, ABCperp);
      vec3.copy(d, ABCperp);
      return false;
    } else {
      // tetrahedron
      const [D, C, B, A] = simplex;
      const AB = vec3.sub(tempVec(), B, A);
      const AC = vec3.sub(tempVec(), C, A);
      const AD = vec3.sub(tempVec(), D, A);
      const AO = vec3.sub(tempVec(), [0, 0, 0], A);

      const ABCperp = vec3.cross(tempVec(), AB, AC);
      if (vec3.dot(ABCperp, AD) > 0) {
        vec3.negate(ABCperp, ABCperp);
      }
      const ACDperp = vec3.cross(tempVec(), AC, AD);
      if (vec3.dot(ACDperp, AB) > 0) {
        vec3.negate(ACDperp, ACDperp);
      }
      const ADBperp = vec3.cross(tempVec(), AD, AB);
      if (vec3.dot(ADBperp, AC) > 0) {
        vec3.negate(ADBperp, ADBperp);
      }

      if (vec3.dot(ABCperp, AO) > 0) {
        simplex = [C, B, A];
        vec3.copy(d, ABCperp);
        return false;
      }
      if (vec3.dot(ACDperp, AO) > 0) {
        simplex = [D, C, A];
        vec3.copy(d, ACDperp);
        return false;
      }
      if (vec3.dot(ADBperp, AO) > 0) {
        simplex = [D, B, A];
        vec3.copy(d, ADBperp);
        return false;
      }
      return true;
    }
  }
}

export function penetrationDepth(
  s1: Shape,
  s2: Shape,
  simplex: vec3[],
  offset: vec3 = [0, 0, 0]
): number {
  if (vec3.equals(s1.travel, s2.travel)) return Infinity;
  const forwardDir = vec3.sub(tempVec(), s1.travel, s2.travel);
  vec3.normalize(forwardDir, forwardDir);
  const backwardDir = vec3.negate(tempVec(), forwardDir);

  const [D, C, B, A] = simplex;
  const AB = vec3.sub(tempVec(), B, A);
  const BC = vec3.sub(tempVec(), B, C);
  const BD = vec3.sub(tempVec(), B, D);
  const AC = vec3.sub(tempVec(), C, A);
  const AD = vec3.sub(tempVec(), D, A);
  const AO = vec3.sub(tempVec(), A, offset);
  const BO = vec3.sub(tempVec(), B, offset);

  const ABCperp = vec3.cross(tempVec(), AB, AC);
  if (vec3.dot(ABCperp, AD) > 0) {
    vec3.negate(ABCperp, ABCperp);
  }
  const ACDperp = vec3.cross(tempVec(), AC, AD);
  if (vec3.dot(ACDperp, AB) > 0) {
    vec3.negate(ACDperp, ACDperp);
  }
  const ABDperp = vec3.cross(tempVec(), AD, AB);
  if (vec3.dot(ABDperp, AC) > 0) {
    vec3.negate(ABDperp, ABDperp);
  }
  const BCDperp = vec3.cross(tempVec(), BC, BD);
  if (vec3.dot(BCDperp, AB) < 0) {
    vec3.negate(BCDperp, BCDperp);
  }

  let minD = Infinity;
  let minPerp: vec3 = [NaN, NaN, NaN];
  let minVs: vec3[] = [];
  let minNotV: vec3 = [NaN, NaN, NaN];

  if (vec3.dot(ABCperp, backwardDir) > 0) {
    const ABCnorm = vec3.normalize(tempVec(), ABCperp);
    const n = vec3.dot(AO, ABCnorm);
    const d = n / vec3.dot(ABCnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ABCperp;
      minVs = [C, B, A];
      minNotV = D;
    }
  }
  if (vec3.dot(ACDperp, backwardDir) > 0) {
    const ACDnorm = vec3.normalize(tempVec(), ACDperp);
    const n = vec3.dot(AO, ACDnorm);
    const d = n / vec3.dot(ACDnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ACDperp;
      minVs = [D, C, A];
      minNotV = B;
    }
  }
  if (vec3.dot(ABDperp, backwardDir) > 0) {
    const ABDnorm = vec3.normalize(tempVec(), ABDperp);
    const n = vec3.dot(AO, ABDnorm);
    const d = n / vec3.dot(ABDnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ABDperp;
      minVs = [D, B, A];
      minNotV = C;
    }
  }
  // TODO(@darzu): can skip if `offset` === [0,0,0]
  if (vec3.dot(BCDperp, backwardDir) > 0) {
    const BCDnorm = vec3.normalize(tempVec(), BCDperp);
    const n = vec3.dot(BO, BCDnorm);
    const d = n / vec3.dot(BCDnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = BCDperp;
      minVs = [D, C, B];
      minNotV = A;
    }
  }

  if (minD === Infinity) {
    console.error("uh oh!");
    console.error(`
    vec3.dot(ABCperp, backwardDir): ${vec3.dot(ABCperp, backwardDir)}
    vec3.dot(ACDperp, backwardDir): ${vec3.dot(ACDperp, backwardDir)}
    vec3.dot(ABDperp, backwardDir): ${vec3.dot(ABDperp, backwardDir)}
    vec3.dot(BCDperp, backwardDir): ${vec3.dot(BCDperp, backwardDir)}
      `);
    console.log(
      JSON.stringify({
        A,
        B,
        C,
        D,
        ABCperp,
        ACDperp,
        ABDperp,
        BCDperp,
        offset,
        backwardDir,
      })
    );
    return Infinity;
  }

  minD += PAD;

  const newTravel = vec3.scale(tempVec(), backwardDir, minD);
  const newOffset = vec3.add(tempVec(), offset, newTravel);

  const F = mSupport(s1, s2, minPerp);
  const Fs = vec3.sub(tempVec(), F, newOffset);
  if (vec3.dot(Fs, minPerp) <= 0) {
    console.log(
      `done!` +
        (vec3.len(offset) > 0
          ? `${vec3.len(offset).toFixed(3)} + ${minD.toFixed(3)}`
          : ``)
    );
    return vec3.len(newOffset);
  }

  console.log(`more to do!`);

  return penetrationDepth(s1, s2, [...minVs, F], newOffset);

  // const Ns = [ABCperp, ACDperp, ABDperp, BCDperp]
  //   .map(n => vec3.normalize(n, n));
  // const dist = Infinity;
  // for (let N of Ns) {
  //   const dn = vec3.dot(N, backwardDir);
  //   if (dn < 0)
  //     continue;

  // }

  // if (vec3.dot(ABCperp, AO) > 0) {
  //   simplex = [C, B, A];
  //   vec3.copy(d, ABCperp);
  //   return false;
  // }
  // if (vec3.dot(ACDperp, AO) > 0) {
  //   simplex = [D, C, A];
  //   vec3.copy(d, ACDperp);
  //   return false;
  // }
  // if (vec3.dot(ADBperp, AO) > 0) {
  //   simplex = [D, B, A];
  //   vec3.copy(d, ADBperp);
  //   return false;
  // }
}

function tripleProd(out: vec3, a: vec3, b: vec3, c: vec3): vec3 {
  vec3.cross(out, a, b);
  vec3.cross(out, out, c);
  return out;
}

function obbCollision() {
  // https://gamedev.stackexchange.com/questions/44500/how-many-and-which-axes-to-use-for-3d-obb-collision-with-sat
  // https://www.geometrictools.com/Documentation/DynamicCollisionDetection.pdf
  // 15 axis:
  // given two OBBs, A and B, where x, y and z refer to the basis vectors / three unique normals. 0 = x axis, 1 = y axis, 2 = z axis
  // a0
  // a1
  // a2
  // b0
  // b1
  // b2
  // cross( a0, b0 )
  // cross( a0, b1 )
  // cross( a0, b2 )
  // cross( a1, b0 )
  // cross( a1, b1 )
  // cross( a1, b2 )
  // cross( a2, b0 )
  // cross( a2, b1 )
  // cross( a2, b2 )
}
/*
private static bool IntersectsWhenProjected( Vector3[] aCorn, Vector3[] bCorn, Vector3 axis ) {

    // Handles the cross product = {0,0,0} case
    if( axis == Vector3.zero ) 
        return true;

    float aMin = float.MaxValue;
    float aMax = float.MinValue;
    float bMin = float.MaxValue;
    float bMax = float.MinValue;

    // Define two intervals, a and b. Calculate their min and max values
    for( int i = 0; i < 8; i++ ) {
        float aDist = Vector3.Dot( aCorn[i], axis );
        aMin = ( aDist < aMin ) ? aDist : aMin;
        aMax = ( aDist > aMax ) ? aDist : aMax;
        float bDist = Vector3.Dot( bCorn[i], axis );
        bMin = ( bDist < bMin ) ? bDist : bMin;
        bMax = ( bDist > bMax ) ? bDist : bMax;
    }

    // One-dimensional intersection test between a and b
    float longSpan = Mathf.Max( aMax, bMax ) - Mathf.Min( aMin, bMin );
    float sumSpan = aMax - aMin + bMax - bMin;
    return longSpan < sumSpan; // Change this to <= if you want the case were they are touching but not overlapping, to count as an intersection
}
*/
