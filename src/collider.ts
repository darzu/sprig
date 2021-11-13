import { Component, EM } from "./entity-manager.js";
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

export const ColliderDef = EM.defineComponent("collider", () => {
  return {
    shape: "Empty",
    solid: false,
  } as Collider;
});
const COLLIDER_ASSERT: Component<typeof ColliderDef> extends Collider
  ? true
  : false = true;
