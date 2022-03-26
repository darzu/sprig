import { EM, EntityManager } from "../entity-manager.js";
import {
  createMeshPool_WebGPU,
  isMeshHandle,
  mapMeshPositions,
  Mesh,
  unshareProvokingVertices,
} from "../render/mesh-pool.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import { assert } from "../test.js";

export const NoodleDef = EM.defineComponent("noodle", () => {});

// TODO(@darzu): DEBUGGING
export function debugCreateNoodles(em: EntityManager) {
  const e = em.newEntity();
  const m = createNoodleMesh();
  em.ensureComponentOn(e, NoodleDef);
  em.ensureComponentOn(e, RenderableConstructDef, m);
  em.ensureComponentOn(e, PositionDef, [0, 0, 0]);

  em.registerSystem(
    [NoodleDef, RenderableDef],
    [],
    (es, rs) => {
      for (let e of es) {
        const m = e.renderable.meshHandle.readonlyMesh;
        assert(!!m, "Cannot find mesh for noodle");
        mapMeshPositions(m, (p, i) => p);
        // TODO(@darzu): update mesh data
        // const vOff = vByteOff + numVerts * Vertex.ByteSize;
        // Vertex.serialize(maps.verticesMap, vOff, pos, color, normal)
        //  [ ] we shouldn't have Mesh | MeshHandle; everything should have a MeshHandle
        //    and maybe a readonly view of the original Mesh
        //  - currently vertex serialization happens in the context of full mesh knowledge
        //    so vertices might be unshared etc. Normal calculations depend on neighbors.
        //  - how bad would it be if we just updated the whole mesh's data?
        //    - with hundreds of animated meshes moving around this would be pretty inefficient
        //  - what's the benefit of CPU-based just-in-time animations? Instead of having it
        //    part of asset creation (e.g. a fixed set of animations).
        //      - limb climbing stairs without IK
        //      - holding an obj, placing the hands in the right position
        //  - more generally, this is about morphing a mesh without a preconfigured animation
        //  - eventually we should have some heirarchy of mesh types e.g. DeformableMesh, StaticMesh, etc.
        //  - normals really complicate things
        //  - GOAL: deformable meshes, either GPU (grass, ocean) or CPU (limbs, sails?)

        // TODO: OR, we could have optional mesh offsets that are updated
        //
      }
    },
    "updateNoodles"
  );
}

function createNoodleMesh(): Mesh {
  const THICKNESS = 0.1;
  const LEN = 1;

  const m: Mesh = {
    pos: [
      [-LEN, THICKNESS, 0],
      [-LEN, -THICKNESS, 0],
      [+LEN, THICKNESS, 0],
      [+LEN, -THICKNESS, 0],
    ],
    tri: [
      [0, 1, 2],
      [1, 3, 2],
      // reverse, so visible from all directions
      // TODO(@darzu): just turn off back-face culling?
      [2, 1, 0],
      [2, 3, 1],
    ],
    colors: [
      [0.2, 0.05, 0.05],
      [0.2, 0.05, 0.05],
      [0.2, 0.05, 0.05],
      [0.2, 0.05, 0.05],
    ],
  };

  return unshareProvokingVertices(m);
}
