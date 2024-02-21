import { V3, mat3, quat } from "../matrix/sprig-matrix.js";
import { mat3Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { AABB } from "./aabb.js";
import { Sphere } from "./broadphase.js";
import { Frame } from "./transform.js";

/* 
REPRESENTATION:
  could express as rotation and x,y,z scale
  rotation could be: quat, yaw/pitch/roll, yaw/pitch, fwd/right/up, 3x3,
*/

export interface OBB {
  // TODO(@darzu): 3 axis + lengths
  mat: mat3;
  fwd: V3; // view into the mat3, y-axis
  right: V3; // view into the mat3, x-axis
  up: V3; // view into the mat3, z-axis
}

export module OBB {
  export type T = OBB;

  function fromMat3(mat: mat3): T {
    const right = new Float32Array(mat.buffer, 0, 3) as V3;
    const fwd = new Float32Array(mat.buffer, 12, 3) as V3;
    const up = new Float32Array(mat.buffer, 24, 3) as V3;
    return {
      mat,
      fwd,
      right,
      up,
    };
  }

  export function mk(): T {
    const mat = mat3.create();
    return fromMat3(mat);
  }

  export function fromRotatedAABB(aabb: AABB, rotation: quat, scale?: V3) {
    // TODO(@darzu):  IMPL
  }

  function vsSphere(s: Sphere) {
    // TODO(@darzu): use inverseTransformPoint ?
    // note
  }
}

export function obbTests() {
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
