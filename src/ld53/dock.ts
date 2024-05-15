import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { appendBoard, lerpBetween } from "../wood/shipyard.js";
import { dbgPathWithGizmos } from "../debug/utils-gizmos.js";
import { getHalfsizeFromAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef } from "../physics/transform.js";
import { getAABBFromMesh, Mesh, validateMesh } from "../meshes/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { quat, V, V3 } from "../matrix/sprig-matrix.js";
import {
  createEmptyMesh,
  createTimberBuilder,
  createWoodHealth,
  getBoardsFromMesh,
  reserveSplinterSpace,
  TimberBuilder,
  verifyUnsharedProvokingForWood,
  WoodHealthDef,
  WoodState,
  WoodStateDef,
} from "../wood/wood.js";
import { Path } from "../utils/spline.js";

export const DockDef = EM.defineComponent("dock", () => true);

// TODO(@darzu): MULTIPLAYER. Use netEntityHelper
export function createDock() {
  const [mesh, wood] = createDockWood();

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
export function createDockWood(): [Mesh, WoodState] {
  const _timberMesh = createEmptyMesh("dock");

  const builder: TimberBuilder = createTimberBuilder(_timberMesh);

  const numPlanks = 16;
  const plankWidth = 2.0;
  const plankDepth = 0.8;
  const plankGap = 0.05;
  const plankLength = 60;
  const segLen = 20 / 6;
  const plankSegNum = plankLength / segLen;
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

    appendBoard(builder.mesh, {
      path: path,
      width: plankWidth / 2 - plankGap,
      depth: plankDepth / 2,
    });
  }

  // recenter
  const size = getHalfsizeFromAABB(getAABBFromMesh(_timberMesh));
  _timberMesh.pos.forEach((v) => V3.sub(v, size, v));

  _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
  const timberState = getBoardsFromMesh(_timberMesh);
  verifyUnsharedProvokingForWood(_timberMesh, timberState);
  const timberMesh = _timberMesh as Mesh;
  timberMesh.usesProvoking = true;

  reserveSplinterSpace(timberState, 200);
  validateMesh(timberState.mesh);

  return [timberMesh, timberState];
}
