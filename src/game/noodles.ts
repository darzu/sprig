import { Component, EM, EntityManager } from "../entity-manager.js";
import {
  cloneMesh,
  mapMeshPositions,
  Mesh,
  scaleMesh,
  scaleMesh3,
  unshareProvokingVertices,
} from "../render/mesh.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer.js";
import { assert } from "../test.js";
import { RendererDef } from "../render/render_init.js";
import { vec3 } from "../gl-matrix.js";
import { vec3Dbg } from "../utils-3d.js";
import { CUBE_FACES, CUBE_MESH } from "./assets.js";

export interface NoodleSeg {
  pos: vec3;
  dir: vec3;
}

export const NoodleDef = EM.defineComponent(
  "noodle",
  (segments: NoodleSeg[]) => ({
    segments,
  })
);
export type Noodle = Component<typeof NoodleDef>;

// TODO(@darzu): DEBUGGING
export function debugCreateNoodles(em: EntityManager) {
  const e = em.newEntity();
  em.ensureComponentOn(e, NoodleDef, [
    {
      pos: [0, 0, 0],
      dir: [0, -1, 0],
    },
    {
      pos: [2, 2, 2],
      dir: [0, 1, 0],
    },
  ]);
  const m = createNoodleMesh(0.1, [0.2, 0.05, 0.05]);
  em.ensureComponentOn(e, RenderableConstructDef, m);
  em.ensureComponentOn(e, PositionDef, [5, -5, 0]);

  // TODO(@darzu): test cube faces (update: they are correct)
  // const cube = em.newEntity();
  // em.ensureComponentOn(cube, PositionDef, [0, -2, 0]);
  // const cubeM = cloneMesh(CUBE_MESH);
  // for (let triIdx of CUBE_FACES.bottom) {
  //   cubeM.colors[triIdx] = [0, 0, 0.5];
  // }
  // em.ensureComponentOn(cube, RenderableConstructDef, cubeM);
}

export function registerNoodleSystem(em: EntityManager) {
  const posIdxToSegIdx: Map<number, number> = new Map();
  CUBE_MESH.pos.forEach((p, i) => {
    if (p[1] > 0) posIdxToSegIdx.set(i, 0);
    else posIdxToSegIdx.set(i, 1);
  });

  em.registerSystem(
    [NoodleDef, RenderableDef],
    [RendererDef],
    (es, rs) => {
      for (let e of es) {
        const originalM = e.renderable.meshHandle.readonlyMesh;
        assert(!!originalM, "Cannot find mesh for noodle");
        // mapMeshPositions(m, (p, i) => p);
        // e.noodle.size *= 1.01;
        // vec3.add(e.noodle.segments[0], e.noodle.segments[0], [0.01, 0, 0.01]);
        const newM = mapMeshPositions(originalM, (p, i) => {
          const segIdx = posIdxToSegIdx.get(i);
          assert(segIdx !== undefined, `missing posIdxToSegIdx for ${i}`);
          const seg = e.noodle.segments[segIdx];
          // TODO(@darzu): PERF, don't create vecs here
          // TODO(@darzu): rotate around .dir
          return vec3.add(vec3.create(), p, seg.pos);
        });
        rs.renderer.renderer.updateMesh(e.renderable.meshHandle, newM);
      }
    },
    "updateNoodles"
  );
}

export function createNoodleMesh(thickness: number, color: vec3): Mesh {
  const m = cloneMesh(CUBE_MESH);
  m.colors.forEach((c) => vec3.copy(c, color));
  return scaleMesh3(m, [thickness, 0.0, thickness]);
}
