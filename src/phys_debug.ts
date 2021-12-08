import { ColliderDef } from "./collider.js";
import { EM, EntityManager } from "./entity-manager.js";
import { CUBE_MESH } from "./game/assets.js";
import { BoatDef } from "./game/boat.js";
import { ColorDef } from "./game/game.js";
import { mat4, vec3 } from "./gl-matrix.js";
import { InputsDef } from "./inputs.js";
import { mathMap } from "./math.js";
import { mapMeshPositions, Mesh, MeshHandleDef } from "./mesh-pool.js";
import { AABB } from "./phys_broadphase.js";
import { PhysicsStateDef } from "./phys_esc.js";
import { MotionDef } from "./phys_motion.js";
import { ParentDef, RenderableDef, TransformDef } from "./renderer.js";
import { RendererDef } from "./render_init.js";

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
  em.registerSystem([ColliderDef], [PhysicsDbgDef], (es, res) => {
    for (let e of es) {
      if (!res._physDbgState.colliderMeshes.has(e.id)) {
        if (e.collider.shape === "AABB") {
          // create debug entity
          const dbgE = em.newEntity();

          // with a wireframe mesh
          const m = meshFromAABB(e.collider.aabb);
          em.addComponent(
            dbgE.id,
            RenderableDef,
            m,
            res._physDbgState.showAABBs,
            1
          );

          // colored
          em.addComponent(dbgE.id, ColorDef, [0, 1, 0]);

          // transformed
          em.addComponent(dbgE.id, TransformDef);

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
  });

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
    }
  );

  // update transform based on parent collider
  em.registerSystem([DbgMeshDef, TransformDef], [], (es, res) => {
    for (let e of es) {
      const parent = em.findEntity(e._physDbgMesh.parent, [
        PhysicsStateDef,
      ])?._phys;
      if (parent) {
        mat4.fromTranslation(e.transform, parent.world.min);
      }
    }
  });
}

// TODO(@darzu): use instancing
function meshFromAABB(aabb: AABB): Mesh {
  // resize
  let m = mapMeshPositions(CUBE_MESH, (p) => [
    mathMap(p[0], -1, 1, 0, aabb.max[0] - aabb.min[0]),
    mathMap(p[1], -1, 1, 0, aabb.max[1] - aabb.min[1]),
    mathMap(p[2], -1, 1, 0, aabb.max[2] - aabb.min[2]),
  ]);
  // drop the triangles (wireframe lines only)
  m = { ...m, tri: [], colors: [] };

  return m;
}
