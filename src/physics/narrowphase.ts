// TODO(@darzu): box vs box collision testing
// https://www.youtube.com/watch?v=ajv46BSqcK4
// https://www.youtube.com/watch?v=MDusDn8oTSE

import { EntityManager } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { ColorDef } from "../color.js";
import { LocalPlayerDef } from "../game/player.js";
import { vec3 } from "../gl-matrix.js";
import { cloneMesh } from "../render/mesh-pool.js";
import { RenderableConstructDef } from "../render/renderer.js";
import { BoxCollider, Collider } from "./collider.js";
import { PhysicsObject } from "./nonintersection.js";
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
  return;

  console.log("NARROW PHASE DBG");

  em.registerOneShotSystem(null, [AssetsDef, LocalPlayerDef], (_, res) => {
    const b1 = em.newEntity();
    const m1 = cloneMesh(res.assets.cube.mesh);
    em.ensureComponentOn(b1, RenderableConstructDef, m1);
    em.ensureComponentOn(b1, ColorDef, [0.1, 0.2, 0.1]);
    em.ensureComponentOn(b1, PositionDef, [0, 0, 0]);

    const b2 = em.newEntity();
    const m2 = cloneMesh(res.assets.cube.mesh);
    em.ensureComponentOn(b2, RenderableConstructDef, m2);
    em.ensureComponentOn(b2, ColorDef, [0.1, 0.1, 0.2]);
    em.ensureComponentOn(b2, PositionDef, [0, 0, 0]);
    em.ensureComponentOn(b2, PhysicsParentDef, res.localPlayer.playerId);
  });
}

type ObjWith<C extends Collider> = PhysicsObject & { collider: C };

function doesOverlap(a: ObjWith<BoxCollider>, b: ObjWith<BoxCollider>) {
  // TODO(@darzu): implement
  //
}

function points(c: ObjWith<BoxCollider>): vec3[] {
  const m = vec3.add(vec3.create(), c.world.position, c.collider.center);
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
  ];
}

// returns the point on shape which has the highest dot product with d
function support(c: ObjWith<BoxCollider>, d: vec3): vec3 {
  return supportInternal(points(c), d);
}

function supportInternal(points: vec3[], d: vec3): vec3 {
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

type Simplex = [vec3, vec3, vec3, vec3];

function nearestSimplex(s: Simplex): {
  newS: Simplex;
  newD: vec3;
  hasOrigin: boolean;
} {
  //
  throw "TODO";
}

function moveSimplexToward(s: Simplex, d: vec3, newP: vec3): Simplex {
  const farthest = supportInternal(s, vec3.negate(vec3.create(), d));
  return [...s, newP].filter((p) => p !== farthest) as Simplex;
}

function hasOrigin(s: Simplex): boolean {
  // TODO(@darzu):
  // can only be in regions R_ab, R_abc, and R_ac if "a" is the newest point
  // dir_ab = (AC x AB) x AB
  //  if dir_ab * AO > 0, origin is in R_ab, remove c, D = R_ab
  throw `TODO`;
}

function nextDir(s: Simplex): vec3 {
  throw `TODO`;
}

// initial dir: vec between the two centers of the shapes (normalized)
function gjk(
  p: ObjWith<BoxCollider>,
  q: ObjWith<BoxCollider>,
  d: vec3
): boolean {
  // https://en.wikipedia.org/wiki/Gilbert–Johnson–Keerthi_distance_algorithm
  let A: vec3 = vec3.sub(
    vec3.create(),
    support(p, d),
    support(q, vec3.negate(vec3.create(), d))
  );
  let s: Simplex = [A, A, A, A];
  let D: vec3 = vec3.negate(vec3.create(), A);

  // TODO(@darzu): max itrs?
  while (true) {
    A = vec3.sub(
      vec3.create(),
      support(p, D),
      support(q, vec3.negate(vec3.create(), D))
    );
    if (vec3.dot(A, D) < 0) return false;
    s = moveSimplexToward(s, D, A);
    if (hasOrigin(s)) return true;
    D = nextDir(s);
  }
}

// function handleSimplex(s: Simplex, d: vec3) {
//   if (s.length === 2) return lineCase(s, d);
//   return triangleCase(s, d);
// }
// function lineCase(s: Simplex, d: vec3) {
//   let [B, A] = s;
//   AB = B - A;
//   AO = O - A;
//   // TODO(@darzu): what does the triple product mean?
//   ABPerp = tripleProd(AB, AO, AB);
//   newD = ABPerp;
//   return false;
// }
// function triangleCase(s: Simplex, d: vec3) {
//   let [C, B, A] = s;
//   AB = B - A;
//   AC = C - A;
//   AO = O - A;
//   ABPerp = tripleProd(AC, AB, AB);
//   ACPerp = tripleProd(AB, AC, AC);
//   if (dot(ABPerp, AO) > 0) {
//     s.remove(C);
//     newD = ABPerp;
//     return false;
//   } else if (dot(ACPerp, AO) > 0) {
//     s.remove(B);
//     newD = ACPerp;
//     return false;
//   }
//   return true;
// }

// TODO(@darzu): GJK should tell u distance between objects

/*
from Godot:
    collision_layer
        This describes the layers that the object appears in. By default, all bodies are on layer 1.
    collision_mask
        This describes what layers the body will scan for collisions. If an object isn't in one of the mask layers, the body will ignore it. By default, all bodies scan layer 1.
*/
