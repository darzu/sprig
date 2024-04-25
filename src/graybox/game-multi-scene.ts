import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { cloudBurstSys } from "../particle/particle.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { CanvasDef } from "../render/canvas.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import {
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { sketch } from "../utils/sketch.js";
import { assert } from "../utils/util-no-import.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createSun, initGhost } from "./graybox-helpers.js";
import { createObj } from "./objects.js";

const DBG_GHOST = true;

export async function initMultiSceneGame() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

  EM.addEagerInit([], [RendererDef], [], (res) => {
    res.renderer.renderer.submitPipelines([], [cloudBurstSys.pipeInit]);

    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdMeshPipe,
      outlineRender,
      deferredPipeline,
      pointPipe,
      linePipe,

      cloudBurstSys.pipeRender,
      cloudBurstSys.pipeUpdate,

      stdGridRender,

      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // sun
  createSun();

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  // pedestal
  const pedestal = EM.mk();
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGreen);
  EM.set(pedestal, PositionDef, V(0, 0, -10));
  EM.set(pedestal, ScaleDef, V(10, 10, 10));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  EM.addSystem(
    "repeatSpawn",
    Phase.GAME_WORLD,
    null,
    [TimeDef, RendererDef],
    (_, res) => {
      if (res.time.step % (60 * 3) === 0) {
        res.renderer.renderer.submitPipelines([], [cloudBurstSys.pipeInit]);
      }
    }
  );

  // TODO(@darzu): change particle color based on current canvas!

  const blurbs = [...document.getElementsByClassName("demo-and-blurb")].map(
    (b) => {
      assert(b.tagName === "DIV", `Element isn't a div, it's a: ${b.tagName}`);
      return b as HTMLDivElement;
    }
  );
  let _hoverIdx = 0;
  let _activeIdx = 0;
  blurbs.forEach(
    (b, i) =>
      (b.onmousemove = () => {
        _hoverIdx = i;
      })
  );

  EM.addSystem(
    "canvasSwitch",
    Phase.GAME_WORLD,
    [],
    [CanvasDef, InputsDef],
    (_, res) => {
      if (res.inputs.keyClicks["1"]) {
        _activeIdx = 0;
        res.htmlCanvas.setCanvas("canvas-1");
      } else if (res.inputs.keyClicks["2"]) {
        _activeIdx = 1;
        res.htmlCanvas.setCanvas("canvas-2");
      }

      if (_hoverIdx !== _activeIdx) {
        res.htmlCanvas.setCanvas(`canvas-${_hoverIdx + 1}`);
        _activeIdx = _hoverIdx;
      }
    }
  );
}
