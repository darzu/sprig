import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, mat4, vec3 } from "../matrix/sprig-matrix.js";
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

export const HealthDef = EM.defineComponent(
  "health",
  () => ({
    min: 0,
    max: 100,
    value: 80,
  }),
  (p, min: number, max: number, value: number) => {
    p.min = min;
    p.max = max;
    p.value = value;
    return p;
  },
  { multiArg: true }
);

export const HealthBarDef = EM.defineComponent("healthBar", () => ({
  lastRenderedValue: -1,
}));

export interface MultiBarOpts {
  width: number;
  length: number;
  centered: boolean;
  fullColor: vec3;
  missingColor: vec3;
}

export function createMultiBarMesh({
  width,
  length,
  centered,
  fullColor,
  missingColor,
}: MultiBarOpts): Mesh {
  const mesh = createEmptyMesh("statBar");

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
    const c = vec3.create();
    if (i <= part1Qidx) vec3.copy(c, fullColor);
    else vec3.copy(c, missingColor);
    mesh.colors.push(c);
  });
  mesh.surfaceIds = mesh.colors.map((_, i) => i + 1);

  const _mesh = unshareProvokingVertices(mesh, true) as Mesh;
  // const _mesh = mesh as Mesh;

  // const _mesh = mesh as Mesh;
  // _mesh.usesProvoking = true;

  return _mesh;
}

EM.addEagerInit([HealthDef], [], [], () => {
  const offset = V(2, 0, 0);
  const hasBar = new Set<number>();

  const barMesh = createMultiBarMesh({
    width: 0.2,
    length: 3.0,
    centered: true,
    fullColor: ENDESGA16.red,
    missingColor: ENDESGA16.darkRed,
  });

  EM.addSystem(
    "createHealthBars",
    Phase.GAME_WORLD,
    [HealthDef],
    [],
    (hs, res) => {
      for (let h of hs) {
        if (!hasBar.has(h.id)) {
          // TODO(@darzu): create bar
          const bar = EM.new();
          const mesh = cloneMesh(barMesh);
          EM.set(bar, RenderableConstructDef, mesh);
          EM.set(bar, PositionDef, vec3.clone(offset));
          EM.set(bar, PhysicsParentDef, h.id);
          EM.set(bar, HealthBarDef);

          hasBar.add(h.id);
        }
      }
    }
  );

  EM.addSystem(
    "renderHealthBars",
    Phase.GAME_WORLD,
    [HealthBarDef, RenderableDef, PhysicsParentDef],
    [RendererDef],
    (hs, res) => {
      const startPosIdx = 4; // TODO(@darzu): these magic numbers come from the mesh; better way?
      const lastPosIdx = startPosIdx + 3;
      for (let h of hs) {
        const parent = EM.findEntity(h.physicsParent.id, [HealthDef]);
        if (!parent) {
          console.warn(
            `HealthBar ${h.id} missing parent ${h.physicsParent.id}`
          );
          continue;
        }

        if (h.healthBar.lastRenderedValue === parent.health.value) continue; // nothing to do
        h.healthBar.lastRenderedValue = parent.health.value;

        const percent = clamp(
          unlerp(parent.health.min, parent.health.max, parent.health.value),
          0,
          1
        );

        const handle = h.renderable.meshHandle;
        assert(handle.mesh);
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
