// TODO(@darzu): box vs box collision testing
// https://www.youtube.com/watch?v=ajv46BSqcK4

import { BoxCollider, Collider } from "./collider.js";
import { quat, vec3 } from "./gl-matrix.js";
import { PhysicsObject } from "./phys.js";
import { AABB } from "./phys_broadphase.js";
import { assert } from "./test.js";

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

type ObjWith<C extends Collider> = PhysicsObject & { collider: C };

function doesOverlap(a: ObjWith<BoxCollider>, b: ObjWith<BoxCollider>) {
  // TODO(@darzu): implement
  //
}

function points(c: ObjWith<BoxCollider>): vec3[] {
  const m = vec3.add(vec3.create(), c.motion.location, c.collider.center);
  const s = c.collider.halfsize;
  return [
    vec3.fromValues(m[0] - s[0], m[1] - s[1], m[2] - s[2]),
    vec3.fromValues(m[0] - s[0], m[1] - s[1], m[2] + s[2]),
    vec3.fromValues(m[0] - s[0], m[1] + s[1], m[2] - s[2]),
    vec3.fromValues(m[0] - s[0], m[1] + s[1], m[2] + s[2]),
    vec3.fromValues(m[0] + s[0], m[1] - s[1], m[2] - s[2]),
    vec3.fromValues(m[0] + s[0], m[1] - s[1], m[2] + s[2]),
    vec3.fromValues(m[0] + s[0], m[1] + s[1], m[2] - s[2]),
    vec3.fromValues(m[0] + s[0], m[1] + s[1], m[2] + s[2]),
  ]
}

// returns the point on shape which has the highest dot product with d
function support(c: ObjWith<BoxCollider>, d: vec3): vec3 {
  return supportInternal(points(c), d);
}

function supportInternal(points: vec3[], d: vec3): vec3 {
  let max = -Infinity;
  let maxP: vec3 | null = null;
  for (let p of points) {
    const n = vec3.dot(p, d)
    if (n > max) {
      max = n;
      maxP = p;
    }
  }
  return maxP!;
}

type Simplex = [vec3, vec3, vec3, vec3];

function nearestSimplex(s: Simplex): {
  newS: Simplex,
  newD: vec3,
  hasOrigin: boolean
} {
  // 
  throw 'TODO'
}

function moveSimplexToward(s: Simplex, d: vec3, newP: vec3): Simplex {
  const farthest = supportInternal(s, vec3.negate(vec3.create(), d));
  return [...s, newP].filter(p => p !== farthest) as Simplex;
}

function hasOrigin(s: Simplex): boolean {
  // TODO(@darzu): 
  // can only be in regions R_ab, R_abc, and R_ac if "a" is the newest point
  // dir_ab = (AC x AB) x AB
  //  if dir_ab * AO > 0, origin is in R_ab, remove c, D = R_ab
  throw `TODO`
}

function nextDir(s: Simplex): vec3 {
  throw `TODO`
}

// initial dir: vec between the two centers of the shapes (normalized)
function gjk(p: ObjWith<BoxCollider>, q: ObjWith<BoxCollider>, d: vec3): boolean {
  // https://en.wikipedia.org/wiki/Gilbert–Johnson–Keerthi_distance_algorithm
  let A: vec3 = vec3.sub(vec3.create(), support(p, d), support(q, vec3.negate(vec3.create(), d)));
  let s: Simplex = [A, A, A, A];
  let D: vec3 = vec3.negate(vec3.create(), A);

  // TODO(@darzu): max itrs?
  while (true) {
    A = vec3.sub(vec3.create(), support(p, D), support(q, vec3.negate(vec3.create(), D)));
    if (vec3.dot(A, D) < 0)
      return false;
    s = moveSimplexToward(s, D, A);
    if (hasOrigin(s))
      return true;
    D = nextDir(s);
  }
}

function handleSimplex(s: Simplex, d: vec3) {
  if (s.length === 2)
    return lineCase(s, d);
  return triangleCase(s, d);
}
function lineCase(s: Simplex, d: vec3) {
  let [B, A] = s;
  AB = B - A;
  AO = O - A;
  // TODO(@darzu): what does the triple product mean?
  ABPerp = tripleProd(AB, AO, AB);
  newD = ABPerp;
  return false;
}
function triangleCase(s: Simplex, d: vec3) {
  let [C,B,A] = s;
  AB = B - A;
  AC = C - A;
  AO = O - A;
  ABPerp = tripleProd(AC, AB, AB);
  ACPerp = tripleProd(AB, AC, AC);
  if (dot(ABPerp, AO) > 0) {
    s.remove(C);
    newD = ABPerp;
    return false;
  }
  else if (dot(ACPerp, AO) > 0) {
    s.remove(B);
    newD = ACPerp;
    return false;
  }
  return true;
}

// TODO(@darzu): GJK should tell u distance between objects

/*
from Godot:
    collision_layer
        This describes the layers that the object appears in. By default, all bodies are on layer 1.
    collision_mask
        This describes what layers the body will scan for collisions. If an object isn't in one of the mask layers, the body will ignore it. By default, all bodies scan layer 1.

sprig:
    objects can have 0 or 1 collider
    this collider can either participate in physics constraints or not
    either way, it will generate collision events
    if you need multiple colliders per object, either:
    - have one or more child objects (positioned relative to u) w/ a different collider
    - use a union composite collider type that is just one collider built out of the union of multiple other colliders (e.g. the ship)


*/
