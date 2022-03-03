import { EM, EntityManager } from "../entity-manager.js";
import {
  createMeshPool_WebGPU,
  Mesh,
  unshareProvokingVertices,
} from "../render/mesh-pool.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableDef } from "../render/renderer.js";

// function createNoodleMesh(numPoints: number): Mesh {
//   const radius = 0.2;
//   const segments = 6;
// }

/*
create mesh, 

#1:
  each joint has an orientation, 
  each vertice is assigned to a joint

#2:
  plan a whole path for the vertices
  write the whole animation, plus a time component

#3:
  bezier curve

simple start:
  one line, two end points, you just control the position of those two points
  noodle renderer has a uniform that places the two end points
  endpoints are always the same orientation (for now)

create a mesh with a seperate render pass

mega shader ideas:
 - verts can have target locations, a smoothing function, and a time component

w/o shaders:

update positions in the mesh, like Doug


*/

// TODO(@darzu): abstract/generalize into a multi-shader renderables system
const NoodlePool = EM.defineComponent("noodlePool", () => {
  // TODO(@darzu): we need a way to get access to mesh pools besides just the
  //  singleton one currently in renderable
  // TODO(@darzu): if we were to unravel the mesh pool abstraction, we'd need
  //  a way to pack vertex, index, and uniform buffers ourselves
  // TODO(@darzu): do we really need a custom vertex format? or even uniform?
  //    the simplest thing would be to start with a mega shader.
  //  But do I want things like water, noodles, grass, and anything else that
  //    has interesting vertex behavior to be in one shader?
  //  Could always split it up later. Shouldn't be hard to copy-paste the shader,
  //    trimming out what I don't need.
  return {
    // pool: createMeshPool_WebGPU(
  };
});

// TODO(@darzu): DEBUGGING
export function testCreateNoodles(em: EntityManager) {
  const e = em.newEntity();
  const m = createNoodleMesh();
  em.ensureComponentOn(e, RenderableDef, m);
  em.ensureComponentOn(e, PositionDef, [0, 0, 0]);
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
