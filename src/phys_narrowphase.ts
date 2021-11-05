// TODO(@darzu): box vs box collision testing
// https://www.youtube.com/watch?v=ajv46BSqcK4

import { quat, vec3 } from "./gl-matrix.js";
import { AABB } from "./phys_broadphase.js";

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

interface BoxCollider {
  motion: { location: vec3; rotation: quat };
  world: AABB;
}

function doesOverlap(a: BoxCollider, b: BoxCollider) {
  //
}
