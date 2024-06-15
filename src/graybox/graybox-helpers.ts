import {
  CameraDef,
  CameraFollowDef,
  CameraSetting,
  applyCameraSettings,
  getCameraSettings,
} from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { GhostDef, createGhost } from "../debug/ghost.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { _ComponentDef } from "../net/components.js";
import { Phase } from "../ecs/sys-phase.js";
import { quat, V3 } from "../matrix/sprig-matrix.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  MeshLike,
} from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { Intersect, assert } from "../utils/util.js";
import { vec3Dbg, vec4Dbg } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj } from "../ecs/em-objects.js";
import { GAME_LOADER } from "../game-loader.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { InputsDef } from "../input/inputs.js";
import { CanvasDef } from "../render/canvas.js";
import { clamp } from "../utils/math.js";

export function createSun(pos?: V3.InputT) {
  const sun = createObj(
    [PointLightDef, ColorDef, PositionDef, RenderableConstructDef] as const,
    [
      {
        constant: 1.0,
        linear: 0.0,
        quadratic: 0.0,
        ambient: V(0.2, 0.2, 0.2),
        diffuse: V(0.5, 0.5, 0.5),
      },
      [1, 1, 1],
      pos ?? [50, 10, 300],
      [CubeMesh, false],
    ]
  );

  return sun;
}

// hover near origin
const defaultCam: CameraSetting = {
  position: [7.97, -12.45, 10.28],
  rotation: [0.0, 0.0, 0.27, 0.96],
  positionOffset: [0.0, 0.0, 0.0],
  yawOffset: 0.0,
  pitchOffset: -0.55,
};

// TODO(@darzu): collapse w/ createGhost
export function initGhost(mesh?: MeshLike) {
  const g = createGhost(mesh ?? CubeMesh);
  g.controllable.speed *= 10;
  g.controllable.sprintMul = 0.2;

  const gameName = GAME_LOADER.getGameName()!;

  // TODO(@darzu): ABSTRACT / GENERALIZE so other systems can save/load state
  const storageKey = `ghostCam_${gameName}`;

  let ghostCam: CameraSetting;
  let ghostCamStr = localStorage.getItem(storageKey);
  if (!ghostCamStr) {
    ghostCam = defaultCam;
  } else {
    // TODO(@darzu): VALIDATE!
    ghostCam = JSON.parse(ghostCamStr) as CameraSetting;
  }
  applyCameraSettings(g, ghostCam);

  let _lastSettings = "";
  EM.addSystem(
    "saveGhostCamera",
    Phase.GAME_WORLD,
    [GhostDef, PositionDef, RotationDef, CameraFollowDef],
    [TimeDef],
    (es, res) => {
      // save once every ~second
      if (res.time.step % 60 !== 0) return;
      if (!es.length) return;
      assert(es.length === 1);
      const e = es[0];

      // get settings
      const settings = getCameraSettings(e);
      const str = JSON.stringify(settings);

      // have settings changed?
      if (str == _lastSettings) return;

      // save
      localStorage.setItem(storageKey, str);
    }
  );

  return g;
}

export function initStdGrid() {
  // TODO(@darzu): BUG. we shouldn't need to do these overrides in this way
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

  const cameraViewDist = 1000;

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * cameraViewDist, 2 * cameraViewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );
}

export async function initDemoPanCamera() {
  const g = EM.mk();
  EM.set(g, CameraFollowDef, 1);
  V3.set(0, -50, 0, g.cameraFollow.positionOffset);
  g.cameraFollow.yawOffset = -2.088;
  g.cameraFollow.pitchOffset = -0.553;

  // TODO(@darzu): wish we didn't need these
  EM.set(g, PositionDef);
  EM.set(g, RotationDef);
  EM.set(g, RenderableConstructDef, CubeMesh, false);

  const turnSpeed = 0.0003;
  const zoomSpeed = 0.1;

  const { htmlCanvas } = await EM.whenResources(CanvasDef);
  htmlCanvas.shouldLockMouseOnClick = false;
  htmlCanvas.unlockMouse();

  EM.addSystem(
    "demoPanCamera",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, CanvasDef, TimeDef],
    (_, { inputs, htmlCanvas, time }) => {
      if (inputs.ldown) {
        g.cameraFollow.yawOffset += inputs.mouseMov[0] * turnSpeed * time.dt;
        g.cameraFollow.pitchOffset += -inputs.mouseMov[1] * turnSpeed * time.dt;
      }
      g.cameraFollow.positionOffset[1] +=
        -inputs.mouseWheel * zoomSpeed * time.dt;
      g.cameraFollow.positionOffset[1] = clamp(
        g.cameraFollow.positionOffset[1],
        -200,
        -5
      );
    }
  );
}
