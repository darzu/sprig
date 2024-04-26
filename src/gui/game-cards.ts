import { CameraDef } from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { V3, V4, V } from "../matrix/sprig-matrix.js";
import { ButtonsStateDef } from "./button.js";
import { PositionDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { BallMesh } from "../meshes/mesh-list.js";
import { makePlaneMesh, mkLineSegs } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { SVG, compileSVG, svgToLineSeg } from "../utils/svg.js";
import {
  LineUniDef,
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { CHAR_SVG, MISSING_CHAR_SVG } from "./svg-font.js";
import { registerUICameraSys } from "./game-font.js";
import { initGhost } from "../graybox/graybox-helpers.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { CY, CyTexturePtr } from "../render/gpu-registry.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { DevConsoleDef } from "../debug/console.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { createRenderTextureToQuad } from "../render/gpu-helper.js";
import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { FONT_JFA_MASK } from "../render/pipeline-masks.js";
import { FontDef, fontJfa, fontLineSdfExampleTex } from "./font.js";
import { createObj } from "../ecs/em-objects.js";

const DBG_GIZMOS = true;

const DBG_3D = true; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

// prittier-ignore
const dbgGrid = [
  [fontJfa._inputMaskTex, fontJfa._uvMaskTex],
  [fontJfa.sdfTex, fontLineSdfExampleTex],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

export async function initCardsGame() {
  // console.log(`panel ${PANEL_W}x${PANEL_H}`);

  const res = await EM.whenResources(RendererDef, FontDef);

  // res.renderer.pipelines = [
  //   // ...shadowPipelines,
  //   stdRenderPipeline,
  //   alphaRenderPipeline,
  //   outlineRender,
  //   deferredPipeline,
  //   postProcess,
  // ];
  EM.addSystem(
    "gameCardsPipelines",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        stdMeshPipe,
        alphaRenderPipeline,
        outlineRender,
        deferredPipeline,

        pointPipe,
        linePipe,

        postProcess,

        // pipeFontLineRender,
        // ...fontJfa.allPipes(),

        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    }
  );

  const sunlight = EM.mk();
  EM.set(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  V3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  EM.set(sunlight, PositionDef, V(10, 10, 100));
  // TODO(@darzu): weird, why does renderable need to be on here?
  EM.set(sunlight, RenderableConstructDef, BallMesh, false);

  const panel = EM.mk();
  const panelMesh = makePlaneMesh(
    -PANEL_W * 0.5,
    PANEL_W * 0.5,
    -PANEL_H * 0.5,
    PANEL_H * 0.5
  );
  // panelMesh.colors[0] = [0.1, 0.3, 0.1];
  // panelMesh.colors[1] = [0.1, 0.1, 0.3];
  panelMesh.colors[0] = V3.clone(ENDESGA16.darkGreen);
  panelMesh.colors[1] = V3.clone(ENDESGA16.darkRed); // underside
  EM.set(panel, RenderableConstructDef, panelMesh);
  // EM.set(panel, ColorDef, ENDESGA16.red);
  EM.set(panel, PositionDef, V(0, 0, 0));

  if (DBG_GIZMOS) addWorldGizmo(V(-PANEL_W * 0.5, -PANEL_H * 0.5, 0));

  if (DBG_3D) {
    // const g = createGhost(BallMesh);
    // V3.copy(g.position, [-21.83, -25.01, 21.79]);
    // quat.copy(g.rotation, [0.0, 0.0, -0.31, 0.95]);
    // V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.685;
    const g = initGhost();
    g.controllable.speed *= 0.4;
  }

  {
    const { camera } = await EM.whenResources(CameraDef);
    camera.fov = Math.PI * 0.5;
    camera.targetId = 0;
    // const cameraTarget = EM.new();
    // EM.set(cameraTarget, PositionDef, V(0, 0, 0));
    // EM.set(cameraTarget, RotationDef);
    // EM.set(cameraTarget, CameraFollowDef);
    // cameraTarget.cameraFollow.pitchOffset = -0.5 * Math.PI;
  }

  // TODO(@darzu): mouse lock?
  if (!DBG_3D)
    EM.whenResources(CanvasDef).then((canvas) =>
      canvas.htmlCanvas.unlockMouse()
    );

  registerUICameraSys();

  // test quads
  // TODO(@darzu): TEXT
  // {
  //   const m =
  //   const ent = createObj([PositionDef, RenderableConstructDef] as const, {
  //     position: [0, 0, 0],
  //     renderableConstruct: [],
  //   });
  // }
}
