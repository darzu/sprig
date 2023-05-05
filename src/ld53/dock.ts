import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import {
  appendBoard,
  dbgPathWithGizmos,
  lerpBetween,
  Path,
} from "../wood/shipyard.js";
import { getHalfsizeFromAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef } from "../physics/transform.js";
import { getAABBFromMesh, Mesh, validateMesh } from "../render/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { quat, V, vec3 } from "../sprig-matrix.js";
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

export function createDock() {
  const [mesh, wood] = createDockWood();

  const dock = EM.new();

  EM.ensureComponentOn(dock, PositionDef, V(0, 0, 0));

  EM.ensureComponentOn(dock, RenderableConstructDef, mesh);
  EM.ensureComponentOn(dock, WoodStateDef, wood);
  const timberHealth = createWoodHealth(wood);
  EM.ensureComponentOn(dock, WoodHealthDef, timberHealth);
  const timberAABB = getAABBFromMesh(mesh);
  timberAABB.min[1] = -100;
  timberAABB.max[1] = 100;
  EM.ensureComponentOn(dock, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: timberAABB,
  });
  EM.ensureComponentOn(dock, ColorDef, ENDESGA16.lightGreen);

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
    const end = V(x, 0, plankLength);

    const positions = lerpBetween(start, end, plankSegNum - 2);

    const path: Path = positions.map((pos) => ({
      pos,
      rot: quat.fromEuler(Math.PI / 2, 0, 0, quat.create()),
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
  _timberMesh.pos.forEach((v) => vec3.sub(v, size, v));

  _timberMesh.surfaceIds = _timberMesh.colors.map((_, i) => i);
  const timberState = getBoardsFromMesh(_timberMesh);
  verifyUnsharedProvokingForWood(_timberMesh, timberState);
  const timberMesh = _timberMesh as Mesh;
  timberMesh.usesProvoking = true;

  reserveSplinterSpace(timberState, 200);
  validateMesh(timberState.mesh);

  return [timberMesh, timberState];
}
