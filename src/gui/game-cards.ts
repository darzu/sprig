import {
  CameraDef,
  CameraComputedDef,
  CameraFollowDef,
} from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { dbg } from "../debug/debugger.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { ButtonDef, ButtonsStateDef } from "./button.js";
import { initMeshEditor, MeshEditorDef } from "./mesh-editor.js";
import { lineStuff } from "./path-editor.js";
import { exportObj } from "../meshes/import-obj.js";
import { InputsDef } from "../input/inputs.js";
import { remap } from "../utils/math.js";
import { copyAABB, createAABB } from "../physics/aabb.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { MeshReserve } from "../render/mesh-pool.js";
import { cloneMesh, Mesh, scaleMesh, stringifyMesh } from "../meshes/mesh.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { randNormalPosVec3 } from "../utils/utils-3d.js";
import { BallMesh } from "../meshes/mesh-list.js";
import { GameMesh, gameMeshFromMesh } from "../meshes/mesh-loader.js";
import { createGhost, gameplaySystems } from "../debug/ghost.js";
import { TextDef } from "./ui.js";
import { makePlaneMesh, mkLineSegs } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { SVG, compileSVG, svgToLineSeg } from "../utils/svg.js";
import { sketchLines, sketchSvg } from "../utils/sketch.js";
import {
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { CHAR_SVG, MISSING_CHAR_SVG } from "./svg-font.js";
import { UICursorDef, registerUICameraSys } from "./game-font.js";
import { initGhost } from "../graybox/graybox-helpers.js";

const DBG_GIZMOS = true;

const DBG_3D = true; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

const CHAR_STR = `1023456789JQKA`;
const CHARS = CHAR_STR.split("");

const svg_x: SVG = [
  { i: "M", x: -0.5, y: -0.5 },
  { i: "m", dx: 1, dy: 1 },
  { i: "M", x: -0.5, y: 0.5 },
  { i: "m", dx: 1, dy: -1 },
];

export async function initCardsGame() {
  // console.log(`panel ${PANEL_W}x${PANEL_H}`);

  const res = await EM.whenResources(RendererDef, ButtonsStateDef);

  // res.renderer.pipelines = [
  //   // ...shadowPipelines,
  //   stdRenderPipeline,
  //   alphaRenderPipeline,
  //   outlineRender,
  //   deferredPipeline,
  //   postProcess,
  // ];
  res.renderer.pipelines = [
    stdMeshPipe,
    alphaRenderPipeline,
    outlineRender,
    deferredPipeline,

    pointPipe,
    linePipe,

    postProcess,
  ];

  const sunlight = EM.new();
  EM.set(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  V3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  EM.set(sunlight, PositionDef, V(10, 10, 100));
  // TODO(@darzu): weird, why does renderable need to be on here?
  EM.set(sunlight, RenderableConstructDef, BallMesh, false);

  const panel = EM.new();
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

  for (let i = 0; i < CHARS.length; i++) {
    const c = CHARS[i];

    let svg = CHAR_SVG[c];
    if (!svg) svg = MISSING_CHAR_SVG;
    const segs = svgToLineSeg(compileSVG(svg), { numPerInstr: 10 });
    const mesh = mkLineSegs(segs.length);
    for (let i = 0; i < segs.length; i++) {
      V3.copy(mesh.pos[i * 2], segs[i][0]);
      V3.copy(mesh.pos[i * 2 + 1], segs[i][1]);
    }

    const ent = EM.new();
    EM.set(
      ent,
      RenderableConstructDef,
      mesh,
      true,
      undefined,
      undefined,
      lineMeshPoolPtr
    );
    EM.set(ent, ColorDef, ENDESGA16.yellow);
    EM.set(ent, PositionDef, [-24 + i * 2, -12, 0.1]);
  }
}
