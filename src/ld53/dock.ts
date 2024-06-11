import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { WoodObj, createWoodBuilder, lerpBetween } from "../wood/shipyard.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";
import { getHalfsizeFromAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef } from "../physics/transform.js";
import { getAABBFromMesh, Mesh, validateMesh } from "../meshes/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { quat, V, V3 } from "../matrix/sprig-matrix.js";
import {
  createEmptyMesh,
  createBoardBuilder,
  getBoardsFromMesh,
  reserveSplinterSpace,
  BoardBuilder,
  verifyUnsharedProvokingForWood,
  WoodState,
  WoodStateDef,
} from "../wood/wood-builder.js";
import { WoodHealthDef } from "../wood/wood-health.js";
import { createWoodHealth } from "../wood/wood-health.js";
import { Path } from "../utils/spline.js";
import { BLACK } from "../meshes/mesh-list.js";

export const DockDef = EM.defineComponent("dock", () => true);

// TODO(@darzu): MULTIPLAYER. Use netEntityHelper
export function createDock() {
  const { mesh, state: wood } = createDockWood();

  const dock = EM.mk();
  EM.set(dock, DockDef);
  EM.set(dock, PositionDef, V(0, 0, 0));
  EM.set(dock, RenderableConstructDef, mesh);
  EM.set(dock, WoodStateDef, wood);
  const timberHealth = createWoodHealth(wood);
  EM.set(dock, WoodHealthDef, timberHealth);
  const timberAABB = getAABBFromMesh(mesh);
  timberAABB.min[2] = -100;
  timberAABB.max[2] = 100;
  EM.set(dock, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: timberAABB,
  });
  EM.set(dock, ColorDef, ENDESGA16.lightGreen);

  return dock;
}

// const __tq1 = quat.create();
export function createDockWood(): WoodObj {
  const w = createWoodBuilder({ meshName: "dock" });
  w.startGroup("all");

  const numPlanks = 16;
  const plankWidth = 2.0;
  const plankDepth = 0.8;
  const plankGap = 0.05;
  const plankLength = 60;
  const segLen = 20 / 6;
  const plankSegNum = plankLength / segLen;
  w.b.setSize(plankWidth / 2 - plankGap, plankDepth / 2);
  for (let i = 0; i < numPlanks; i++) {
    const x = plankWidth * i;
    const start = V(x, 0, 0);
    const end = V(x, plankLength, 0);

    const positions = lerpBetween(start, end, plankSegNum - 2);

    const path: Path = positions.map((pos) => ({
      pos,
      rot: quat.fromEuler(0, 0, 0, quat.mk()),
    }));

    // dbgPathWithGizmos(path);

    w.addBoard(path, BLACK);
  }

  const obj = w.finish(200);

  // recenter
  const size = getHalfsizeFromAABB(getAABBFromMesh(obj.mesh));
  obj.mesh.pos.forEach((v) => V3.sub(v, size, v));

  return obj;
}
