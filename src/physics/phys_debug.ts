import { ColliderDef } from "./collider.js";
import { EM, EntityManager } from "../entity-manager.js";
import { AssetsDef, LocalMeshes } from "../game/assets.js";
import { BoatDef } from "../game/boat.js";
import { ColorDef } from "../game/game.js";
import { mat4, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { avg, mathMap } from "../math.js";
import { mapMeshPositions, Mesh, MeshHandleDef } from "../mesh-pool.js";
import { AABB } from "./phys_broadphase.js";
import { PhysicsStateDef, WorldFrameDef } from "./phys_nonintersection.js";
import { RenderableDef } from "../renderer.js";
import {
  copyFrame,
  PositionDef,
  ScaleDef,
  updateFrameFromPosRotScale,
} from "./transform.js";
import { RendererDef } from "../render_init.js";
import { tempVec } from "../temp-pool.js";

export const PhysicsDbgDef = EM.defineComponent("_physDbgState", () => {
  return {
    showAABBs: false,
    colliderMeshes: new Map() as Map<number, number>,
  };
});

export const DbgMeshDef = EM.defineComponent(
  "_physDbgMesh",
  (parent?: number) => {
    return {
      parent: parent || 0,
    };
  }
);

export function registerPhysicsDebuggerSystem(em: EntityManager) {
  em.addSingletonComponent(PhysicsDbgDef);

  // add collider meshes
  em.registerSystem(
    [ColliderDef],
    [PhysicsDbgDef, AssetsDef],
    (es, res) => {
      for (let e of es) {
        if (!res._physDbgState.colliderMeshes.has(e.id)) {
          if (e.collider.shape === "AABB") {
            // create debug entity
            const dbgE = em.newEntity();

            // with a wireframe mesh
            em.addComponent(
              dbgE.id,
              RenderableDef,
              res.assets.wireCube.proto,
              res._physDbgState.showAABBs,
              1
            );

            // colored
            em.addComponent(dbgE.id, ColorDef, [0, 1, 0]);

            // positioned and scaled
            em.ensureComponentOn(dbgE, PositionDef);
            em.ensureComponentOn(dbgE, ScaleDef);

            // NOTE: we don't use the normal parent transform mechanism b/c
            //  colliders especially AABBs are only translated, not full matrix
            //  transform'ed
            em.addComponent(dbgE.id, DbgMeshDef, e.id);

            // remember
            res._physDbgState.colliderMeshes.set(e.id, dbgE.id);
          }
          // TODO(@darzu): handle other collider shapes
        }
      }
    },
    "colliderMeshes"
  );

  // toggle debug meshes on and off
  em.registerSystem(
    [DbgMeshDef, RenderableDef],
    [InputsDef, PhysicsDbgDef],
    (es, res) => {
      if (res.inputs.keyClicks["5"]) {
        const newState = !res._physDbgState.showAABBs;
        res._physDbgState.showAABBs = newState;

        for (let e of es) {
          e.renderable.enabled = newState;
        }
      }
    },
    "debugMeshes"
  );

  // update transform based on parent collider
  em.registerSystem(
    [DbgMeshDef, PositionDef, ScaleDef, WorldFrameDef],
    [],
    (es, res) => {
      for (let e of es) {
        const parent = em.findEntity(e._physDbgMesh.parent, [
          PhysicsStateDef,
          WorldFrameDef,
        ]);
        if (parent) {
          for (let i = 0; i < 3; i++) {
            // e.position[i] = parent.world.position[i];
            e.position[i] =
              (parent._phys.worldAABB.min[i] + parent._phys.worldAABB.max[i]) *
              0.5;
          }
          for (let i = 0; i < 3; i++)
            // cube scale 1 means length 2 sides
            e.scale[i] =
              (parent._phys.worldAABB.max[i] - parent._phys.worldAABB.min[i]) *
              0.5;

          // ensure this debug mesh is up to date
          // NOTE: we can't wait for the normal local-world transform update cycle
          //  since we're trying to get debug info after all physics has run
          updateFrameFromPosRotScale(e);
          copyFrame(e.world, e);
        }
      }
    },
    "debugMeshTransform"
  );
}

// TODO(@darzu): use instancing
function meshFromAABB(aabb: AABB): Mesh {
  // resize
  let m = mapMeshPositions(LocalMeshes.cube, (p) => [
    mathMap(p[0], -1, 1, 0, aabb.max[0] - aabb.min[0]),
    mathMap(p[1], -1, 1, 0, aabb.max[1] - aabb.min[1]),
    mathMap(p[2], -1, 1, 0, aabb.max[2] - aabb.min[2]),
  ]);
  // drop the triangles (wireframe lines only)
  m = { ...m, tri: [], colors: [] };

  return m;
}
