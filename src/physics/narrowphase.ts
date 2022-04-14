// TODO(@darzu): box vs box collision testing
// https://www.youtube.com/watch?v=ajv46BSqcK4
// https://www.youtube.com/watch?v=MDusDn8oTSE

import { EntityManager, EntityW } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { ColorDef } from "../color.js";
import { LocalPlayerDef } from "../game/player.js";
import { vec3 } from "../gl-matrix.js";
import { cloneMesh } from "../render/mesh-pool.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { BoxCollider, Collider } from "./collider.js";
import { PhysicsObject, WorldFrameDef } from "./nonintersection.js";
import { PhysicsParentDef, PositionDef } from "./transform.js";

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

export function registerNarrowPhaseSystems(em: EntityManager) {
  // TODO(@darzu):
}

export type SupportFn = (d: vec3) => vec3;

export function boxLocalPoints(m: vec3, s: vec3): vec3[] {
  return [
    vec3.fromValues(m[0] - s[0], m[1] - s[1], m[2] - s[2]),
    vec3.fromValues(m[0] - s[0], m[1] - s[1], m[2] + s[2]),
    vec3.fromValues(m[0] - s[0], m[1] + s[1], m[2] - s[2]),
    vec3.fromValues(m[0] - s[0], m[1] + s[1], m[2] + s[2]),
    vec3.fromValues(m[0] + s[0], m[1] - s[1], m[2] - s[2]),
    vec3.fromValues(m[0] + s[0], m[1] - s[1], m[2] + s[2]),
    vec3.fromValues(m[0] + s[0], m[1] + s[1], m[2] - s[2]),
    vec3.fromValues(m[0] + s[0], m[1] + s[1], m[2] + s[2]),
  ];
}

export function farthestPointInDir(points: vec3[], d: vec3): vec3 {
  let max = -Infinity;
  let maxP: vec3 | null = null;
  for (let p of points) {
    const n = vec3.dot(p, d);
    if (n > max) {
      max = n;
      maxP = p;
    }
  }
  return maxP!;
}

type Shape = {
  center: vec3;
  support: SupportFn;
};

// minkowski difference support
function mSupport(s1: Shape, s2: Shape, d: vec3): vec3 {
  // TODO(@darzu):
  return vec3.sub(vec3.create(), s1.support(d), s2.support(d));
}

// GJK visualization

let d: vec3 = vec3.create();
let simplex: vec3[] = [];
export function gjk(s1: Shape, s2: Shape): boolean {
  vec3.sub(d, s2.center, s1.center);
  vec3.normalize(d, d);
  simplex = [mSupport(s1, s2, d)];
  vec3.sub(d, [0, 0, 0], simplex[0]);
  while (true) {
    const A = mSupport(s1, s2, d);
    if (vec3.dot(A, d) < 0) return false;
    simplex.push(A);
    if (handleSimplex()) return true;
  }
}
function tripleProd(out: vec3, a: vec3, b: vec3, c: vec3): vec3 {
  vec3.cross(out, a, b);
  vec3.cross(out, out, c);
  return out;
}
function handleSimplex(): boolean {
  if (simplex.length === 2) {
    // line case
    const [B, A] = simplex;
    const AB = vec3.sub(vec3.create(), B, A);
    const AO = vec3.sub(vec3.create(), [0, 0, 0], A);
    const ABperp = tripleProd(vec3.create(), AB, AO, AB);
    vec3.copy(d, ABperp);
    return false;
  } else if (simplex.length === 3) {
    // triangle case
    const [C, B, A] = simplex;
    const AB = vec3.sub(vec3.create(), B, A);
    const AC = vec3.sub(vec3.create(), C, A);
    const ABCperp = vec3.cross(vec3.create(), AB, AC);
    const AO = vec3.sub(vec3.create(), [0, 0, 0], A);
    if (vec3.dot(ABCperp, AO) < 0) vec3.negate(ABCperp, ABCperp);
    vec3.copy(d, ABCperp);
    return false;
  } else {
    // tetrahedron
    const [D, C, B, A] = simplex;
    // TODO(@darzu):
    const AB = vec3.sub(vec3.create(), B, A);
    const AC = vec3.sub(vec3.create(), C, A);
    const AD = vec3.sub(vec3.create(), D, A);
    const AO = vec3.sub(vec3.create(), [0, 0, 0], A);

    const ABCperp = vec3.cross(vec3.create(), AB, AC);
    const ACDperp = vec3.cross(vec3.create(), AC, AD);
    const ADBperp = vec3.cross(vec3.create(), AD, AB);
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
