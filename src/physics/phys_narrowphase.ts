// TODO(@darzu): box vs box collision testing
// https://www.youtube.com/watch?v=ajv46BSqcK4

import { BoxCollider } from "./collider.js";
import { quat, vec3 } from "../gl-matrix.js";
import { AABB } from "./phys_broadphase.js";

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

function doesOverlap(a: BoxCollider, b: BoxCollider) {
  // TODO(@darzu): implement
}

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
