import { Component, EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AABB } from "./aabb.js";

export type Layer = number;

export const DefaultLayer = 0;
let _nextLayer = 1;
export function DefineLayer(): Layer {
  if (_nextLayer >= 16) throw `Can't define another layer; already 16!`;
  return _nextLayer++;
}

export type ColliderShape =
  | "Empty"
  | "AABB"
  | "Box"
  | "Sphere"
  | "Capsule"
  | "Multi";

interface ColliderBase {
  shape: ColliderShape;
  // TODO(@darzu): rename "solid" to "non-intersection?" or move this to physics systems options somewhere
  solid: boolean;
  myLayers?: Layer[];
  targetLayers?: Layer[];
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

const NonCollider: EmptyCollider = {
  shape: "Empty",
  solid: false,
};

// TODO(@darzu): ensure we support swapping colliders?
export const ColliderDef = EM.defineComponent(
  "collider",
  () => {
    return {
      shape: "Empty",
      solid: false,
    } as Collider;
  },
  (p, c?: Collider) => {
    // TODO(@darzu): PERF. In most cases this is creating an empty collider and immediately throwing that away
    if (c) return c;
    return p;
  }
);

const __COLLIDER_ASSERT: Component<typeof ColliderDef> extends Collider
  ? true
  : false = true;
