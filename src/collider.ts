// TODO(@darzu):
//  we want to be able to define colliders seperate from meshes
//  further, we want perhaps many colliders per object, and they should be parented under the objects transform
//  perhaps most importantly, we need rotated box colliders, not just AABB

import { vec3 } from "./gl-matrix.js";
import { AABB } from "./phys_broadphase.js";

export type ColliderShape = "AABB" | "Sphere" | "Box" | "Capsule";

export interface Collider {
  shape: ColliderShape;
}

export interface AABBCollider extends Collider {
  shape: "AABB";
  aabb: AABB;
}

export interface BoxCollider extends Collider {
  shape: "Box";
  center: vec3;
  size: vec3;
}

export interface SphereCollider extends Collider {
  shape: "Sphere";
  center: vec3;
  radius: number;
}

export interface CapsuleCollider extends Collider {
  shape: "Capsule";
  center: vec3;
  height: number;
  radius: number;
  axis: 0 | 1 | 2;
}
