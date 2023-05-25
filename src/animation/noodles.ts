import { Component, EM, EntityManager } from "../ecs/entity-manager.js";
import {
  cloneMesh,
  mapMeshPositions,
  Mesh,
  normalizeMesh,
  scaleMesh,
  scaleMesh3,
} from "../meshes/mesh.js";
import { PositionDef } from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { CUBE_MESH } from "../meshes/primatives.js";
import { Phase } from "../ecs/sys_phase";

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
  const e = em.new();
  em.ensureComponentOn(e, NoodleDef, [
    {
      pos: V(0, 0, 0),
      dir: V(0, -1, 0),
    },
    {
      pos: V(2, 2, 2),
      dir: V(0, 1, 0),
    },
  ]);
  const m = createNoodleMesh(0.1, V(0.2, 0.05, 0.05));
  em.ensureComponentOn(e, RenderableConstructDef, m);
  em.ensureComponentOn(e, PositionDef, V(5, -5, 0));

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

  em.registerSystem2(
    "updateNoodles",
    Phase.GAME_WORLD,
    [NoodleDef, RenderableDef],
    [RendererDef],
    (es, rs) => {
      for (let e of es) {
        const mesh = e.renderable.meshHandle.mesh;
        assert(!!mesh, "Cannot find mesh for noodle");
        // mapMeshPositions(m, (p, i) => p);
        // e.noodle.size *= 1.01;
        // vec3.add(e.noodle.segments[0], e.noodle.segments[0], [0.01, 0, 0.01]);
        mapMeshPositions(mesh, (p, i) => {
          const segIdx = posIdxToSegIdx.get(i);
          assert(segIdx !== undefined, `missing posIdxToSegIdx for ${i}`);
          const seg = e.noodle.segments[segIdx];
          // TODO(@darzu): PERF, don't create vecs here
          // TODO(@darzu): rotate around .dir
          return vec3.add(p, seg.pos, vec3.create());
        });
        rs.renderer.renderer.stdPool.updateMeshVertices(
          e.renderable.meshHandle,
          mesh
        );
      }
    }
  );
}

export function createNoodleMesh(thickness: number, color: vec3): Mesh {
  const m = cloneMesh(CUBE_MESH);
  m.colors.forEach((c) => vec3.copy(c, color));
  scaleMesh3(m, V(thickness, 0.0, thickness));
  return normalizeMesh(m);
}
