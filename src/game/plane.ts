import { ColliderDef } from "../collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec3, vec4 } from "../gl-matrix.js";
import { PhysicsStateDef } from "../phys_esc.js";
import { Motion, MotionDef } from "../phys_motion.js";
import {
  MotionSmoothingDef,
  ParentDef,
  RenderableDef,
  TransformDef,
} from "../renderer.js";
import { ColorDef } from "./game.js";
import {
  unshareProvokingVertices,
  getAABBFromMesh,
  Mesh,
  MeshHandle,
  MeshHandleDef,
  scaleMesh,
} from "../mesh-pool.js";
import {
  Sync,
  SyncDef,
  Authority,
  AuthorityDef,
  Me,
  MeDef,
} from "../net/components.js";
import { AABBCollider } from "../collider.js";
import { _renderer } from "../main.js";
import { Serializer, Deserializer } from "../serialize.js";
import { FinishedDef } from "../build.js";

const BLACK = vec3.fromValues(0, 0, 0);
const PLANE_MESH = unshareProvokingVertices(
  scaleMesh(
    {
      pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
      ],
      tri: [
        [0, 2, 3],
        [0, 3, 1], // top
        [3, 2, 0],
        [1, 3, 0], // bottom
      ],
      lines: [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ],
      colors: [BLACK, BLACK, BLACK, BLACK],
    },
    10
  )
);
const PLANE_AABB = getAABBFromMesh(PLANE_MESH);

export const PlaneConstructDef = EM.defineComponent(
  "planeConstruct",
  (location?: vec3, color?: vec3) => ({
    location: location ?? vec3.fromValues(0, 0, 0),
    color: color ?? vec3.fromValues(0, 0, 0),
  })
);

export type PlaneConstruct = Component<typeof PlaneConstructDef>;

function serializePlaneConstruct(
  planeConstruct: PlaneConstruct,
  buf: Serializer
) {
  buf.writeVec3(planeConstruct.location);
  buf.writeVec3(planeConstruct.color);
}

function deserializePlaneConstruct(
  planeConstruct: PlaneConstruct,
  buf: Deserializer
) {
  buf.readVec3(planeConstruct.location);
  buf.readVec3(planeConstruct.color);
}

EM.registerSerializerPair(
  PlaneConstructDef,
  serializePlaneConstruct,
  deserializePlaneConstruct
);

export function registerBuildPlanesSystem(em: EntityManager) {
  function buildPlanes(
    planes: { id: number; planeConstruct: PlaneConstruct }[],
    { me: { pid } }: { me: Me }
  ) {
    for (let plane of planes) {
      if (FinishedDef.isOn(plane)) continue;

      if (!MotionDef.isOn(plane)) {
        const motion = em.addComponent(plane.id, MotionDef);
        vec3.copy(motion.location, plane.planeConstruct.location);
      }
      if (!ColorDef.isOn(plane)) {
        const color = em.addComponent(plane.id, ColorDef);
        vec3.copy(color, plane.planeConstruct.color);
      }
      if (!TransformDef.isOn(plane)) em.addComponent(plane.id, TransformDef);
      if (!RenderableDef.isOn(plane)) {
        const renderable = em.addComponent(plane.id, RenderableDef);
        renderable.mesh = PLANE_MESH;
      }
      if (!PhysicsStateDef.isOn(plane))
        em.addComponent(plane.id, PhysicsStateDef);
      if (!ColliderDef.isOn(plane)) {
        const collider = em.addComponent(plane.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = true;
        (collider as AABBCollider).aabb = PLANE_AABB;
      }
      if (!AuthorityDef.isOn(plane))
        em.addComponent(plane.id, AuthorityDef, pid, pid);
      if (!SyncDef.isOn(plane)) {
        const sync = em.addComponent(plane.id, SyncDef);
        sync.fullComponents.push(PlaneConstructDef.id);
        sync.dynamicComponents.push(MotionDef.id);
      }
      em.addComponent(plane.id, FinishedDef);
    }
  }

  em.registerSystem([PlaneConstructDef], [MeDef], buildPlanes);
}
