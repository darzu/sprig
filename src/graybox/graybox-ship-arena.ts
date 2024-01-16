import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM, Entities } from "../ecs/entity-manager.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, HexMesh } from "../meshes/mesh-list.js";
import { cloneMesh, normalizeMesh, scaleMesh3 } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { initGhost, initWorld } from "./graybox-helpers.js";
import {
  ObjDef,
  ObjEnt,
  ObjOpt,
  createObj,
  defineObj,
  mixinObj,
  testObjectTS,
} from "./objects.js";

const DBG_GHOST = true;
const DBG_GIZMO = true;

export async function initGrayboxShipArena() {
  initWorld();

  // ocean
  const ocean = createObj(
    [ColorDef, PositionDef, RenderableConstructDef, ScaleDef],
    [ENDESGA16.blue, V(0, 0, 0), [CubeMesh], V(100, 100, 0.1)]
  );

  createShip();

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  // testObjectTS();
}

const ShipObj = defineObj({
  name: "ship",
  components: [ColorDef, PositionDef, RenderableConstructDef, CameraFollowDef],
  physicsParentChildren: true,
  children: {
    box: [PositionDef, ScaleDef, ColorDef, RenderableConstructDef],
  },
} as const);

const HasSphereObj = defineObj({
  name: "hasPurple",
  components: [ColorDef],
  physicsParentChildren: true,
  children: {
    box: [PositionDef, ScaleDef, ColorDef, RenderableConstructDef],
  },
} as const);

function createShip() {
  const shipMesh = mkCubeMesh();
  scaleMesh3(shipMesh, [8, 16, 2]);

  const ship = ShipObj.new({
    args: {
      color: ENDESGA16.midBrown,
      position: [40, 40, 3],
      renderableConstruct: [shipMesh],
      cameraFollow: undefined,
    },
    children: {
      box: [[0, 0, 5], [4, 4, 4], ENDESGA16.red, [CubeMesh]],
    },
  });

  mixinObj(ship, HasSphereObj, {
    args: [ENDESGA16.yellow],
    children: {
      box: [[0, 0, 9], [4, 4, 4], ENDESGA16.darkGreen, [BallMesh]],
    },
  });

  vec3.copy(ship.cameraFollow.positionOffset, [0.0, -50.0, 0]);
  ship.cameraFollow.pitchOffset = -Math.PI * 0.25;

  if (DBG_GIZMO) addGizmoChild(ship, 10);

  // sail
}
