import { Component, EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { AABB } from "./broadphase.js";

export type ColliderShape =
  | "Empty"
  | "AABB"
  | "Box"
  | "Sphere"
  | "Capsule"
  | "Multi";

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
  halfsize: vec3;
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

export interface MultiCollider extends ColliderBase {
  shape: "Multi";
  children: Collider[];
}

export type Collider =
  | EmptyCollider
  | AABBCollider
  | BoxCollider
  | SphereCollider
  | CapsuleCollider
  | MultiCollider;

export const ColliderDef = EM.defineComponent("collider", (c?: Collider) => {
  return (
    c ??
    ({
      shape: "Empty",
      solid: false,
    } as Collider)
  );
});
const __COLLIDER_ASSERT: Component<typeof ColliderDef> extends Collider
  ? true
  : false = true;
