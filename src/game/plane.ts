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
    location: location || vec3.fromValues(0, 0, 0),
    color: color || vec3.fromValues(0, 0, 0),
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
      if (em.hasComponents(plane, [FinishedDef])) continue;

      if (!em.hasComponents(plane, [MotionDef])) {
        const motion = em.addComponent(plane.id, MotionDef);
        vec3.copy(motion.location, plane.planeConstruct.location);
      }
      if (!em.hasComponents(plane, [ColorDef])) {
        const color = em.addComponent(plane.id, ColorDef);
        vec3.copy(color, plane.planeConstruct.color);
      }
      if (!em.hasComponents(plane, [MotionSmoothingDef]))
        em.addComponent(plane.id, MotionSmoothingDef);
      if (!em.hasComponents(plane, [TransformDef]))
        em.addComponent(plane.id, TransformDef);
      if (!em.hasComponents(plane, [ParentDef]))
        em.addComponent(plane.id, ParentDef);
      if (!em.hasComponents(plane, [RenderableDef])) {
        const renderable = em.addComponent(plane.id, RenderableDef);
        renderable.mesh = PLANE_MESH;
        // TODO: renderer system that adds mesh handles
        const meshHandle = _renderer.addMesh(renderable.mesh);
        em.addComponent(plane.id, MeshHandleDef, meshHandle);
      }
      if (!em.hasComponents(plane, [PhysicsStateDef]))
        em.addComponent(plane.id, PhysicsStateDef);
      if (!em.hasComponents(plane, [ColliderDef])) {
        const collider = em.addComponent(plane.id, ColliderDef);
        collider.shape = "AABB";
        collider.solid = false;
        (collider as AABBCollider).aabb = PLANE_AABB;
      }
      if (!em.hasComponents(plane, [AuthorityDef]))
        em.addComponent(plane.id, AuthorityDef, pid, pid);
      if (!em.hasComponents(plane, [SyncDef])) {
        const sync = em.addComponent(plane.id, SyncDef);
        sync.fullComponents.push(PlaneConstructDef.id);
        sync.dynamicComponents.push(MotionDef.id);
      }
      em.addComponent(plane.id, FinishedDef);
    }
  }

  em.registerSystem([PlaneConstructDef], [MeDef], buildPlanes);
}
