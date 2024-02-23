import { V, V3, mat3, mat4 } from "../matrix/sprig-matrix.js";
import { mat3Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { AABB, getCenterFromAABB, getHalfsizeFromAABB } from "./aabb.js";
import { Sphere } from "./broadphase.js";

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
  center: V3;
  // _inv: mat3 | undefined;
}

export interface OBB extends _OBB2 {
  vsSphere: (s: Sphere) => boolean;
}

const __tmp_vsSphere = V3.mk();

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
      // TODO(@darzu): Verify transpose is safe!
      // const inv = b._inv ?? (b._inv = mat3.invert(b.mat));
      const p = V3.sub(s.org, b.center, __tmp_vsSphere);
      V3.ttMat3(p, b.mat, p);

      return (
        p[0] * p[0] < b.halfw[0] * b.halfw[0] * 2 &&
        p[1] * p[1] < b.halfw[0] * b.halfw[0] * 2 &&
        p[2] * p[2] < b.halfw[0] * b.halfw[0] * 2
      );
    }

    return {
      ...b,
      vsSphere,
    };
  }

  export function fromTransformedAABB(aabb: AABB, transform: mat4) {
    // transformAABB(wc.localAABB, o.transform);
    const mat = mat3.fromMat4(transform, mat3.create());
    const { right, fwd, up } = _fromMat3(mat);

    V3.norm(right, right);
    V3.norm(fwd, fwd);
    V3.norm(up, up);

    const center = getCenterFromAABB(aabb);
    V3.tMat4(center, transform, center);
    const halfw = getHalfsizeFromAABB(aabb);

    return _withMethods({
      mat,
      fwd,
      right,
      up,
      center,
      halfw,
    });
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
