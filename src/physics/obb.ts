import { EM } from "../ecs/ecs.js";
import { V, V3, mat3, mat4 } from "../matrix/sprig-matrix.js";
import { jitter } from "../utils/math.js";
import { range } from "../utils/util.js";
import { mat3Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { AABB, getCenterFromAABB, getHalfsizeFromAABB } from "./aabb.js";
import { Sphere } from "./broadphase.js";

// TODO(@darzu): ABSTRACTION. Maybe what we actually want is a bunch of helper functions
//    for working with local AABBs and a series of world transforms

/* 
REPRESENTATION:
  could express as rotation and x,y,z scale
  rotation could be: quat, yaw/pitch/roll, yaw/pitch, fwd/right/up, 3x3,
*/

/*
SCRATCH:
we transform aabb by getting 8 corners and doing mat4 mul
we could get matrix from model to orthographic "screenspace" of cannonball inclination perpendicular plane
then do a 2D 8-DOP test
gen random point, pick random DOP plane weighted by length, push point outside
OR
create 2D OBB after projection
  walk perimeter

take ea 8 point  
*/

interface _OBB1 {
  mat: mat3; // 3 axis orthonormal, normalized
  fwd: V3; // view into the mat3, y-axis
  right: V3; // view into the mat3, x-axis
  up: V3; // view into the mat3, z-axis
}
interface _OBB2 extends _OBB1 {
  halfw: V3;
  center: V3; // TODO(@darzu): have mat be a mat4 and center be a view on that? then we're just a mat4 + scale3
  // _inv: mat3 | undefined;
}

export interface OBB extends _OBB2 {
  vsSphere: (s: Sphere) => boolean;
  updateFromMat4: (aabb: AABB, m: mat4) => void;
}

const __tmp_vsSphere0 = V3.mk();
const __tmp_vsSphere1 = V3.mk();

export const OBBDef = EM.defineComponent(
  "obb",
  () => OBB.mk(),
  (p) => p
);

const _tempObbCorners: V3[] = range(8).map((_) => V3.mk());
const _t_fwd = V3.mk();
const _t_right = V3.mk();
const _t_up = V3.mk();
export function getOBBCornersTemp(obb: OBB): V3[] {
  // TODO(@darzu): hmm, this seems like too many ops
  const ts = _tempObbCorners;
  const right = V3.scale(obb.right, obb.halfw[0], _t_right);
  const fwd = V3.scale(obb.fwd, obb.halfw[1], _t_fwd);
  const up = V3.scale(obb.up, obb.halfw[2], _t_up);
  V3.copy(ts[0], obb.center);
  V3.copy(ts[1], obb.center);
  V3.copy(ts[2], obb.center);
  V3.copy(ts[3], obb.center);
  V3.copy(ts[4], obb.center);
  V3.copy(ts[5], obb.center);
  V3.copy(ts[6], obb.center);
  V3.copy(ts[7], obb.center);

  V3.add(ts[0], right, ts[0]);
  V3.add(ts[0], fwd, ts[0]);
  V3.add(ts[0], up, ts[0]);

  V3.add(ts[1], right, ts[1]);
  V3.add(ts[1], fwd, ts[1]);
  V3.sub(ts[1], up, ts[1]);

  V3.add(ts[2], right, ts[2]);
  V3.sub(ts[2], fwd, ts[2]);
  V3.add(ts[2], up, ts[2]);

  V3.add(ts[3], right, ts[3]);
  V3.sub(ts[3], fwd, ts[3]);
  V3.sub(ts[3], up, ts[3]);

  V3.sub(ts[4], right, ts[4]);
  V3.add(ts[4], fwd, ts[4]);
  V3.add(ts[4], up, ts[4]);

  V3.sub(ts[5], right, ts[5]);
  V3.add(ts[5], fwd, ts[5]);
  V3.sub(ts[5], up, ts[5]);

  V3.sub(ts[6], right, ts[6]);
  V3.sub(ts[6], fwd, ts[6]);
  V3.add(ts[6], up, ts[6]);

  V3.sub(ts[7], right, ts[7]);
  V3.sub(ts[7], fwd, ts[7]);
  V3.sub(ts[7], up, ts[7]);

  return ts;
}

export function getRandPointInOBB(b: OBB, scale: number, out?: V3): V3 {
  const x = jitter(b.halfw[0] * scale);
  const y = jitter(b.halfw[1] * scale);
  const z = jitter(b.halfw[2] * scale);
  out = out ?? V3.tmp();
  out[0] = b.right[0] * x + b.fwd[0] * y + b.up[0] * z + b.center[0];
  out[1] = b.right[1] * x + b.fwd[1] * y + b.up[1] * z + b.center[1];
  out[2] = b.right[2] * x + b.fwd[2] * y + b.up[2] * z + b.center[2];
  return out;
}

export module OBB {
  export type T = OBB;

  function _fromMat3(mat: mat3): _OBB1 {
    const right = new Float32Array(mat.buffer, 0, 3) as V3;
    const fwd = new Float32Array(mat.buffer, 12, 3) as V3;
    const up = new Float32Array(mat.buffer, 24, 3) as V3;
    return {
      mat,
      right,
      fwd,
      up,
    };
  }

  export function mk(): OBB {
    const b = _fromMat3(mat3.create());
    return _withMethods({
      ...b,
      center: V(0, 0, 0),
      halfw: V(0.5, 0.5, 0.5),
    });
  }

  function _withMethods(b: _OBB2): OBB {
    function vsSphere(s: Sphere): boolean {
      // bring sphere origin into OBB local space (so OBB center is 0,0,0)
      //  so we just need to test p vs AABB
      const p = V3.sub(s.org, b.center, __tmp_vsSphere0);
      V3.ttMat3(p, b.mat, p);

      // the problem is symetrical so mirror into 1st quadrant
      V3.abs(p, p);

      // clamp point onto AABB to find nearest AABB point
      const c = V3.copy(__tmp_vsSphere1, p);
      c[0] = Math.min(c[0], b.halfw[0]);
      c[1] = Math.min(c[1], b.halfw[1]);
      c[2] = Math.min(c[2], b.halfw[2]);

      // check the distance vs radius
      return V3.sqrDist(c, p) < s.rad ** 2;
    }

    function updateFromMat4(aabb: AABB, transform: mat4): void {
      // transformAABB(wc.localAABB, o.transform);
      mat3.fromMat4(transform, b.mat);

      const { fwd, right, up } = b;

      V3.norm(right, right);
      V3.norm(fwd, fwd);
      V3.norm(up, up);

      const center = getCenterFromAABB(aabb, b.center);
      V3.tMat4(center, transform, center);

      getHalfsizeFromAABB(aabb, b.halfw);
    }

    return {
      ...b,
      vsSphere,
      updateFromMat4,
    };
  }

  export function fromTransformedAABB(aabb: AABB, transform: mat4) {
    const b = mk();
    b.updateFromMat4(aabb, transform);
    return b;
  }

  export function copy(out: OBB, b: OBB): OBB {
    mat3.copy(out.mat, b.mat);
    V3.copy(out.halfw, b.halfw);
    V3.copy(out.center, b.center);
    // NOTE: we don't need to copy fwd/right/up b/c they're views into .mat
    return out;
  }
}

export function obbTests() {
  {
    // test vec view works
    const o = OBB.mk();
    console.log(mat3Dbg(o.mat));
    console.log(vec3Dbg(o.right));
    console.log(vec3Dbg(o.fwd));
    console.log(vec3Dbg(o.up));
    V3.scale(o.right, 1.1, o.right);
    V3.scale(o.fwd, 1.2, o.fwd);
    V3.scale(o.up, 1.3, o.up);
    console.log(mat3Dbg(o.mat));
    console.log(vec3Dbg(o.right));
    console.log(vec3Dbg(o.fwd));
    console.log(vec3Dbg(o.up));
  }
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
