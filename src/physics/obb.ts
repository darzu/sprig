import { V3, mat3, quat } from "../matrix/sprig-matrix.js";
import { assert } from "../utils/util.js";
import { mat3Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { AABB } from "./aabb.js";
import { Sphere } from "./broadphase.js";

/* 
REPRESENTATION:
  could express as rotation and x,y,z scale
  rotation could be: quat, yaw/pitch/roll, yaw/pitch, fwd/right/up, 3x3,
*/

interface _OBB {
  // TODO(@darzu): 3 axis + lengths
  mat: mat3;
  // TODO(@darzu): wait r these from the center or bottom-back-left corner ?
  fwd: V3; // view into the mat3, y-axis
  right: V3; // view into the mat3, x-axis
  up: V3; // view into the mat3, z-axis
  halfw: V3;
  center: V3;
}

export interface OBB extends _OBB {
  width: () => number;
  length: () => number;
  height: () => number;
  sqrWidth: () => number;
  sqrLength: () => number;
  sqrHeight: () => number;

  vsSphere: (s: Sphere) => boolean;
}

export module OBB {
  export type T = OBB;

  function fromMat3(mat: mat3): T {
    const right = new Float32Array(mat.buffer, 0, 3) as V3;
    const fwd = new Float32Array(mat.buffer, 12, 3) as V3;
    const up = new Float32Array(mat.buffer, 24, 3) as V3;

    // TODO(@darzu): IMPL!!
    const center = V3.mk();
    const halfw = V3.mk();

    return _withMethods({
      mat,
      fwd,
      right,
      up,
      center,
      halfw,
    });
  }

  function _withMethods(b: _OBB): OBB {
    const width = () => V3.len(b.right);
    const height = () => V3.len(b.up);
    const length = () => V3.len(b.fwd);
    const sqrWidth = () => V3.sqrLen(b.right);
    const sqrHeight = () => V3.sqrLen(b.up);
    const sqrLength = () => V3.sqrLen(b.fwd);

    function vsSphere(s: Sphere) {
      throw "TODO: wrong impl.";
      // TODO(@darzu): PERF. Make more efficient by using the transpose.
      //    Orthogonal matrix transpose = inverse
      const inv = mat3.invert(b.mat);
      assert(inv);
      const p = V3.tMat3(s.org, inv);
      return (
        p[0] * p[0] < sqrWidth() &&
        p[1] * p[1] < sqrLength() &&
        p[2] * p[2] < sqrHeight()
      );
    }

    return {
      ...b,
      width,
      height,
      length,
      sqrWidth,
      sqrHeight,
      sqrLength,
      vsSphere,
    };
  }

  export function mk(): T {
    const mat = mat3.create();
    return fromMat3(mat);
  }

  export function fromRotatedAABB(aabb: AABB, rotation: quat, scale?: V3) {
    // TODO(@darzu):  IMPL
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
