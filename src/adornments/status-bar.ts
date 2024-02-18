import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, mat4, V3 } from "../matrix/sprig-matrix.js";
import {
  Mesh,
  cloneMesh,
  createEmptyMesh,
  unshareProvokingVertices,
} from "../meshes/mesh.js";
import { PositionDef, PhysicsParentDef } from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { clamp, unlerp, lerp } from "../utils/math.js";
import { assert } from "../utils/util.js";
import { createTimberBuilder } from "../wood/wood.js";

const DBG_STAT_BAR = true;

export const StatBarDef = EM.defineComponent(
  "statBar",
  () => ({
    min: 0,
    max: 100,
    value: 80,

    _lastRenderedValue: -1,
  }),
  (p, min: number, max: number, value: number) => {
    p.min = min;
    p.max = max;
    p.value = value;
    return p;
  },
  { multiArg: true }
);

export interface MultiBarOpts {
  width: number;
  length: number;
  centered: boolean;
  fullColor: V3.InputT;
  missingColor: V3.InputT;
}

const statBarMeshName = "statBar";

export function createMultiBarMesh({
  width,
  length,
  centered,
  fullColor,
  missingColor,
}: MultiBarOpts): Mesh {
  const mesh = createEmptyMesh(statBarMeshName);

  const builder = createTimberBuilder(mesh);
  builder.width = width; // +X
  builder.depth = width; // +Z (after rotate below)

  // point toward -Z
  // mat4.rotateX(builder.cursor, -Math.PI * 0.5, builder.cursor);

  const halflen = length * 0.5;

  if (centered)
    mat4.translate(builder.cursor, [0, -halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addEndQuad(true);
  mat4.translate(builder.cursor, [0, halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addSideQuads();
  const part1Qidx = mesh.quad.length - 1;
  mat4.translate(builder.cursor, [0, halflen, 0], builder.cursor);
  builder.addLoopVerts();
  builder.addSideQuads();
  builder.addEndQuad(false);
  // const part2Qidx = mesh.quad.length;

  mesh.quad.forEach((_, i) => {
    const c = V3.mk();
    if (i <= part1Qidx) V3.copy(c, fullColor);
    else V3.copy(c, missingColor);
    mesh.colors.push(c);
  });
  mesh.surfaceIds = mesh.colors.map((_, i) => i + 1);

  const _mesh = unshareProvokingVertices(mesh, true) as Mesh;
  // const _mesh = mesh as Mesh;

  // const _mesh = mesh as Mesh;
  // _mesh.usesProvoking = true;

  return _mesh;
}

EM.addEagerInit([StatBarDef], [], [], () => {
  // const mesh = cloneMesh(barMesh);

  EM.addSystem(
    "renderStatBars",
    Phase.GAME_WORLD,
    [StatBarDef, RenderableDef],
    [RendererDef],
    (hs, res) => {
      const startPosIdx = 4; // TODO(@darzu): these magic numbers come from the mesh; better way?
      const lastPosIdx = startPosIdx + 3;

      for (let h of hs) {
        const { statBar } = h;

        // exit early if nothing to do
        if (statBar._lastRenderedValue === statBar.value) continue;
        statBar._lastRenderedValue = statBar.value;

        const percent = clamp(
          unlerp(statBar.min, statBar.max, statBar.value),
          0,
          1
        );

        const handle = h.renderable.meshHandle;
        assert(handle.mesh);
        assert(
          handle.mesh.dbgName === statBarMeshName,
          "StatBar entities must use createMultiBarMesh mesh"
        );
        const mesh = handle.mesh;
        const min = mesh.pos.at(0)![1]; // first
        const max = mesh.pos.at(-1)![1]; // last
        const lerped = lerp(min, max, percent);
        mesh.pos.forEach((p, i) => {
          if (startPosIdx <= i && i <= lastPosIdx) {
            p[1] = lerped;
          }
        });

        res.renderer.renderer.stdPool.updateMeshVertices(
          handle,
          mesh,
          startPosIdx,
          4
        );
      }
    }
  );
});
