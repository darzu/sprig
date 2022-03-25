import { EM, EntityManager } from "../entity-manager.js";
import {
  createMeshPool_WebGPU,
  isMeshHandle,
  Mesh,
  unshareProvokingVertices,
} from "../render/mesh-pool.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableDef } from "../render/renderer.js";
import { assert } from "../test.js";

export const NoodleDef = EM.defineComponent("noodle", () => {});

// TODO(@darzu): DEBUGGING
export function debugCreateNoodles(em: EntityManager) {
  const e = em.newEntity();
  const m = createNoodleMesh();
  em.ensureComponentOn(e, NoodleDef);
  em.ensureComponentOn(e, RenderableDef, m);
  em.ensureComponentOn(e, PositionDef, [0, 0, 0]);

  em.registerSystem([NoodleDef, RenderableDef], [], (es, rs) => {
    // TODO(@darzu): update the noodle mesh
    for (let e of es) {
      assert(
        !isMeshHandle(e.renderable.meshOrProto),
        "noodle setup with a mesh handle"
      );
      const m: Mesh = e.renderable.meshOrProto;
      // m.
    }
  });
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
