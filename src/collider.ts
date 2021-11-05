// TODO(@darzu):
//  we want to be able to define colliders seperate from meshes
//  further, we want perhaps many colliders per object, and they should be parented under the objects transform
//  perhaps most importantly, we need rotated box colliders, not just AABB

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

import { vec3 } from "./gl-matrix.js";
import { AABB } from "./phys_broadphase.js";

export type ColliderShape =
  | "Empty"
  | "AABB"
  | "Box"
  | "Sphere"
  | "Capsule"
  | "Union";

interface ColliderBase {
  shape: ColliderShape;
  solid: boolean;
}

export interface EmptyCollider extends ColliderBase {
  shape: "Empty";
}

export interface AABBCollider extends ColliderBase {
  shape: "AABB";
  aabb: AABB;
}

export interface BoxCollider extends ColliderBase {
  shape: "Box";
  center: vec3;
  size: vec3;
}

export interface SphereCollider extends ColliderBase {
  shape: "Sphere";
  center: vec3;
  radius: number;
}

export interface CapsuleCollider extends ColliderBase {
  shape: "Capsule";
  center: vec3;
  height: number;
  radius: number;
  axis: 0 | 1 | 2;
}

export interface UnionCollider extends ColliderBase {
  shape: "Union";
  children: Collider[];
}

export type Collider =
  | EmptyCollider
  | AABBCollider
  | BoxCollider
  | SphereCollider
  | CapsuleCollider
  | UnionCollider;