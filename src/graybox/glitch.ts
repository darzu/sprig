import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { RenderDataStdDef } from "../render/pipelines/std-scene.js";
import { RenderableDef, RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { randInt } from "../utils/math.js";
import { assert } from "../utils/util.js";

export const GlitchDef = EM.defineComponent("glitch", () => true);

EM.addSystem(
  "updateGlitchMeshIndices",
  Phase.GAME_WORLD,
  [RenderableDef, GlitchDef],
  [TimeDef],
  (es, res) => {
    if (res.time.step % 10 !== 0) return;

    for (let e of es) {
      const m = e.renderable.meshHandle.mesh;
      const pool = e.renderable.meshHandle.pool;
      const randVi = () => randInt(0, m.pos.length - 1);
      if (pool.ptr.prim === "tri") {
        m.tri.forEach((p) => {
          p[0] = randVi();
          p[1] = randVi();
          p[2] = randVi();
        });
        m.quad.forEach((p) => {
          p[0] = randVi();
          p[1] = randVi();
          p[2] = randVi();
          p[3] = randVi();
        });
        if (m.tri.length) pool.updateMeshTriInds(e.renderable.meshHandle, m);
        if (m.quad.length) pool.updateMeshQuadInds(e.renderable.meshHandle, m);
      } else if (pool.ptr.prim === "line") {
        assert(m.lines?.length);
        m.lines.forEach((p) => {
          p[0] = randVi();
          p[1] = randVi();
        });
        pool.updateMeshLineInds(e.renderable.meshHandle, m);
      } else {
        throw "TODO: GlitchDef for prim kind: " + pool.ptr.prim;
      }
    }
  }
);
