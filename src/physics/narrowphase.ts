import { V3, V } from "../matrix/sprig-matrix.js";
import { centroid, SupportFn } from "../utils/utils-3d.js";
import { PAD } from "./phys.js";
import { TupleN } from "../utils/util.js";

// GJK: convex vs convex collision testing
//  https://www.youtube.com/watch?v=ajv46BSqcK4
//  https://www.youtube.com/watch?v=MDusDn8oTSE
// Also, for OOB (object oriented bounding box) use
//    "separating axis theorem"

// TODO(@darzu): interfaces worth thinking about:
// export interface ContactData {
//     aId: number;
//     bId: number;
//     bToANorm: V3;
//     dist: number;
//   }
// export interface ReboundData {
//     aId: number;
//     bId: number;
//     aRebound: number;
//     bRebound: number;
//     aOverlap: V3;
//     bOverlap: V3;
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

export function registerNarrowPhaseSystems() {
  // TODO(@darzu):
}

export type Shape = {
  center: V3;
  support: SupportFn;
  travel: V3;
};

export function doesSimplexOverlapOrigin(s: V3[]) {
  if (s.length !== 4) return false;

  const tris = [
    [s[0], s[1], s[2]],
    [s[0], s[1], s[3]],
    [s[0], s[2], s[3]],
    [s[1], s[2], s[3]],
  ];

  const center = centroid(...s);

  for (let t of tris) {
    const [C, B, A] = t;
    const AB = V3.sub(B, A, V3.mk());
    const AC = V3.sub(C, A, V3.mk());
    const ABCperp = V3.cross(AB, AC, V3.mk());
    V3.norm(ABCperp, ABCperp);
    const triCenter = centroid(...t);
    const triCenterToSimplexCenter = V3.sub(center, triCenter, V3.mk());
    V3.norm(triCenterToSimplexCenter, triCenterToSimplexCenter);
    if (V3.dot(ABCperp, triCenterToSimplexCenter) < 0) V3.neg(ABCperp, ABCperp);
    const AO = V3.sub([0, 0, 0], A, V3.mk());
    if (V3.dot(ABCperp, AO) < 0) return false;
  }
  return true;
}

// minkowski difference support
function mSupport(s1: Shape, s2: Shape, d: V3): V3 {
  // TODO(@darzu):
  const nD = V3.neg(d);
  return V3.sub(s2.support(d), s1.support(nD));
}

// GJK visualization

// TODO(@darzu): so much perf to improve. #1: don't allocate
export function gjk(s1: Shape, s2: Shape): [V3, V3, V3, V3] | undefined {
  let d: V3 = V3.tmp();
  let simplex: V3[] = [];
  let distToOrigin = Infinity;

  V3.sub(s2.center, s1.center, d);
  V3.norm(d, d);
  simplex = [mSupport(s1, s2, d)];
  V3.sub([0, 0, 0], simplex[0], d);
  V3.norm(d, d);
  let step = 0;
  while (true) {
    const A = mSupport(s1, s2, d);
    if (V3.dot(A, d) < 0) {
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
    const newDist = V3.len(centroid(...simplex));
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
      return [...simplex] as TupleN<V3, 4>;
    }
  }

  function handleSimplex(): boolean {
    if (simplex.length === 2) {
      // line case
      const [B, A] = simplex;
      const AB = V3.sub(B, A);
      const AO = V3.sub([0, 0, 0], A);
      const ABperp = tripleProd(V3.tmp(), AB, AO, AB);
      V3.copy(d, ABperp);
      return false;
    } else if (simplex.length === 3) {
      // triangle case
      const [C, B, A] = simplex;
      const AB = V3.sub(B, A);
      const AC = V3.sub(C, A);
      const ABCperp = V3.cross(AB, AC);
      const AO = V3.sub([0, 0, 0], A);
      if (V3.dot(ABCperp, AO) < 0) V3.neg(ABCperp, ABCperp);
      V3.copy(d, ABCperp);
      return false;
    } else {
      // tetrahedron
      const [D, C, B, A] = simplex;
      const AB = V3.sub(B, A);
      const AC = V3.sub(C, A);
      const AD = V3.sub(D, A);
      const AO = V3.sub([0, 0, 0], A);

      const ABCperp = V3.cross(AB, AC);
      if (V3.dot(ABCperp, AD) > 0) {
        V3.neg(ABCperp, ABCperp);
      }
      const ACDperp = V3.cross(AC, AD);
      if (V3.dot(ACDperp, AB) > 0) {
        V3.neg(ACDperp, ACDperp);
      }
      const ADBperp = V3.cross(AD, AB);
      if (V3.dot(ADBperp, AC) > 0) {
        V3.neg(ADBperp, ADBperp);
      }

      if (V3.dot(ABCperp, AO) > 0) {
        simplex = [C, B, A];
        V3.copy(d, ABCperp);
        return false;
      }
      if (V3.dot(ACDperp, AO) > 0) {
        simplex = [D, C, A];
        V3.copy(d, ACDperp);
        return false;
      }
      if (V3.dot(ADBperp, AO) > 0) {
        simplex = [D, B, A];
        V3.copy(d, ADBperp);
        return false;
      }
      return true;
    }
  }
}

export function penetrationDepth(
  s1: Shape,
  s2: Shape,
  simplex: V3[],
  offset: V3 = V(0, 0, 0)
): number {
  if (V3.equals(s1.travel, s2.travel)) return Infinity;
  const forwardDir = V3.sub(s1.travel, s2.travel);
  V3.norm(forwardDir, forwardDir);
  const backwardDir = V3.neg(forwardDir);

  const [D, C, B, A] = simplex;
  const AB = V3.sub(B, A);
  const BC = V3.sub(B, C);
  const BD = V3.sub(B, D);
  const AC = V3.sub(C, A);
  const AD = V3.sub(D, A);
  const AO = V3.sub(A, offset);
  const BO = V3.sub(B, offset);

  const ABCperp = V3.cross(AB, AC);
  if (V3.dot(ABCperp, AD) > 0) {
    V3.neg(ABCperp, ABCperp);
  }
  const ACDperp = V3.cross(AC, AD);
  if (V3.dot(ACDperp, AB) > 0) {
    V3.neg(ACDperp, ACDperp);
  }
  const ABDperp = V3.cross(AD, AB);
  if (V3.dot(ABDperp, AC) > 0) {
    V3.neg(ABDperp, ABDperp);
  }
  const BCDperp = V3.cross(BC, BD);
  if (V3.dot(BCDperp, AB) < 0) {
    V3.neg(BCDperp, BCDperp);
  }

  let minD = Infinity;
  let minPerp: V3 = V(NaN, NaN, NaN);
  let minVs: V3[] = [];
  let minNotV: V3 = V(NaN, NaN, NaN);

  if (V3.dot(ABCperp, backwardDir) > 0) {
    const ABCnorm = V3.norm(ABCperp);
    const n = V3.dot(AO, ABCnorm);
    const d = n / V3.dot(ABCnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ABCperp;
      minVs = [C, B, A];
      minNotV = D;
    }
  }
  if (V3.dot(ACDperp, backwardDir) > 0) {
    const ACDnorm = V3.norm(ACDperp);
    const n = V3.dot(AO, ACDnorm);
    const d = n / V3.dot(ACDnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ACDperp;
      minVs = [D, C, A];
      minNotV = B;
    }
  }
  if (V3.dot(ABDperp, backwardDir) > 0) {
    const ABDnorm = V3.norm(ABDperp);
    const n = V3.dot(AO, ABDnorm);
    const d = n / V3.dot(ABDnorm, backwardDir);
    // console.log(d);
    if (d < minD) {
      minD = d;
      minPerp = ABDperp;
      minVs = [D, B, A];
      minNotV = C;
    }
  }
  // TODO(@darzu): can skip if `offset` === [0,0,0]
  if (V3.dot(BCDperp, backwardDir) > 0) {
    const BCDnorm = V3.norm(BCDperp);
    const n = V3.dot(BO, BCDnorm);
    const d = n / V3.dot(BCDnorm, backwardDir);
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
    vec3.dot(ABCperp, backwardDir): ${V3.dot(ABCperp, backwardDir)}
    vec3.dot(ACDperp, backwardDir): ${V3.dot(ACDperp, backwardDir)}
    vec3.dot(ABDperp, backwardDir): ${V3.dot(ABDperp, backwardDir)}
    vec3.dot(BCDperp, backwardDir): ${V3.dot(BCDperp, backwardDir)}
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

  const newTravel = V3.scale(backwardDir, minD);
  const newOffset = V3.add(offset, newTravel);

  const F = mSupport(s1, s2, minPerp);
  const Fs = V3.sub(F, newOffset);
  if (V3.dot(Fs, minPerp) <= 0) {
    // console.log(
    //   `done!` +
    //     (vec3.length(offset) > 0
    //       ? `${vec3.length(offset).toFixed(3)} + ${minD.toFixed(3)}`
    //       : ``)
    // );
    return V3.len(newOffset);
  }

  console.log(`more to do!`);

  return penetrationDepth(s1, s2, [...minVs, F], newOffset);

  // const Ns = [ABCperp, ACDperp, ABDperp, BCDperp]
  //   .map(n => V3.normalize(n, n));
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

function tripleProd(out: V3, a: V3, b: V3, c: V3): V3 {
  V3.cross(a, b, out);
  V3.cross(out, c, out);
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
