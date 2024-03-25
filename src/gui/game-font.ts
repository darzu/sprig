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
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { GameMesh, gameMeshFromMesh } from "../meshes/mesh-loader.js";
import { createGhost, gameplaySystems } from "../debug/ghost.js";
import { TextDef } from "./ui.js";
import { makePlaneMesh } from "../meshes/primatives.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { SVG, compileSVG } from "../utils/svg.js";
import { sketchLines, sketchSvg } from "../utils/sketch.js";
import { linePipe, pointPipe } from "../render/pipelines/std-line.js";

/*
TODO(@darzu):
 [x] new faces get new colors
 [ ] allow edge collapse, towards either vert
  [ ] quad -> tri
  [ ] tri -> [none]
 [ ] edge extrude should be perp
 [ ] show 2D and 3D spinning preview of glyph
 [ ] show font references
 [ ] show font character bounds
 [ ] loop cut
 [ ] export to font
  [x] button render w/ click and action
  [ ] bank of characters: map of character to mesh proto
 [ ] render arbitrary-ish text
*/

const EXPERIMENTAL_LINE_STUFF = false; // TODO(@darzu): broken rn

const DBG_GIZMOS = true;

const DBG_3D = false; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

const CHAR_STR = `1234567890JQKA`;
const CHARS = CHAR_STR.split("");

const CHAR_SVG: Record<string, SVG> = {
  "1": [
    { i: "M", x: -0.5, y: -0.5 },
    { i: "v", dy: 1 },
    { i: "h", dx: 1 },
    { i: "v", dy: -1 },
    { i: "h", dx: -1 },
  ],
};

export const UICursorDef = EM.defineResource(
  "uiCursor",
  (cursor: EntityW<[typeof PositionDef]>) => ({
    cursor,
  })
);

EM.addLazyInit([AllMeshesDef], [UICursorDef], ({ allMeshes }) => {
  // Cursor
  const cursor = EM.new();
  EM.set(cursor, ColorDef, V(0.1, 0.1, 0.1));
  EM.set(cursor, PositionDef, V(0, 0.0, 1.0));
  EM.set(cursor, RenderableConstructDef, allMeshes.he_octo.proto);
  const cursorLocalAABB = copyAABB(createAABB(), allMeshes.he_octo.aabb);
  cursorLocalAABB.min[2] = -1;
  cursorLocalAABB.max[2] = 1;
  EM.set(cursor, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: cursorLocalAABB,
  });

  EM.addResource(UICursorDef, cursor);
});

export async function initFontEditor() {
  // console.log(`panel ${PANEL_W}x${PANEL_H}`);

  const res = await EM.whenResources(
    AllMeshesDef,
    RendererDef,
    ButtonsStateDef
  );

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
  EM.set(sunlight, RenderableConstructDef, res.allMeshes.ball.proto, false);

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
  panelMesh.colors[1] = V3.clone(ENDESGA16.darkRed);
  EM.set(panel, RenderableConstructDef, panelMesh);
  // EM.set(panel, ColorDef, ENDESGA16.red);
  EM.set(panel, PositionDef, V(0, 0, 0));

  if (DBG_GIZMOS) addWorldGizmo(V(-PANEL_W * 0.5, -PANEL_H * 0.5, 0));

  if (DBG_3D) {
    const g = createGhost(res.allMeshes.ball.proto);

    V3.copy(g.position, [-21.83, -25.01, 21.79]);
    quat.copy(g.rotation, [0.0, 0.0, -0.31, 0.95]);
    V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.685;
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

  // const { allMeshes} = await EM.whenResources(AssetsDef);

  // TODO(@darzu): de-duplicate this with very similar code in other "games"
  EM.addSystem(
    "uiCameraView",
    Phase.GAME_WORLD,
    null,
    [CameraComputedDef, CanvasDef, CameraDef, InputsDef, UICursorDef],
    (_, res) => {
      const { cameraComputed, htmlCanvas, inputs } = res;
      const cursor = res.uiCursor.cursor;

      if (res.camera.targetId) return;

      // update aspect ratio and size
      // TODO(@darzu): modifying cameraComputed directly is odd
      cameraComputed.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraComputed.width = htmlCanvas.canvas.clientWidth;
      cameraComputed.height = htmlCanvas.canvas.clientHeight;

      // dbgLogOnce(
      //   `ar${cameraComputed.aspectRatio.toFixed(2)}`,
      //   `ar ${cameraComputed.aspectRatio.toFixed(2)}`
      // );

      let viewMatrix = mat4.create();

      // mat4.rotateX(viewMatrix, Math.PI * 0.5, viewMatrix);

      const projectionMatrix = mat4.create();

      // TODO(@darzu): PRESERVE ASPECT RATIO!
      const VIEW_PAD = PANEL_W / 12;

      const padPanelW = PANEL_W + VIEW_PAD * 2;
      const padPanelH = PANEL_H + VIEW_PAD * 2;

      const padPanelAR = padPanelW / padPanelH;
      const cameraAR = cameraComputed.width / cameraComputed.height;

      // const maxPanelW = boxInBox(cameraComputed.width, cameraComputed.height, panelAR);

      let adjPanelW: number;
      let adjPanelH: number;
      if (cameraAR < padPanelAR) {
        // camera is "more portrait" than panel, thus we're width-constrained
        adjPanelW = padPanelW;
        adjPanelH = adjPanelW * (1 / cameraAR);
      } else {
        // conversely, we're height-constrained
        adjPanelH = padPanelH;
        adjPanelW = adjPanelH * cameraAR;
      }

      // TODO(@darzu): i don't understand the near/far clipping; why can't they be like -4, 4 ?
      mat4.ortho(
        -adjPanelW * 0.5,
        adjPanelW * 0.5,
        -adjPanelH * 0.5,
        adjPanelH * 0.5,
        -24,
        12,
        projectionMatrix
      );

      const viewProj = mat4.mul(projectionMatrix, viewMatrix, mat4.create());

      cameraComputed.viewProj = viewProj;
      cameraComputed.invViewProj = mat4.invert(
        cameraComputed.viewProj,
        cameraComputed.invViewProj
      );

      let cursorFracX = inputs.mousePos[0] / htmlCanvas.canvas.clientWidth;
      let cursorFracY = inputs.mousePos[1] / htmlCanvas.canvas.clientHeight;
      const cursorWorldPos = V3.tMat4(
        [
          remap(cursorFracX, 0, 1, -1, 1),
          remap(cursorFracY, 0, 1, 1, -1), // screen is Y down, world is Y up
          0,
        ],
        cameraComputed.invViewProj
      );
      cursor.position[0] = cursorWorldPos[0];
      cursor.position[1] = cursorWorldPos[1];
    }
  );

  // Starter mesh for each letter
  const quadMesh: Mesh = {
    quad: [V4.clone([0, 1, 2, 3])],
    tri: [],
    pos: [V(-1, -1, 0), V(1, -1, 0), V(1, 1, 0), V(-1, 1, 0)],
    colors: [randNormalPosVec3()],
    surfaceIds: [1],
    usesProvoking: true,
  };
  scaleMesh(quadMesh, 0.5);
  const quadGMesh = gameMeshFromMesh(quadMesh, res.renderer.renderer, {
    maxVertNum: 100,
    maxPrimNum: 100,
  });

  // TODO(@darzu): HACK
  // Export!
  (dbg as any).exportPoly = () => {
    console.log(exportObj(quadMesh));
  };

  // sketchLines([
  //   [10, 10, 1],
  //   [20, 15, 1],
  //   [-50, -50, 1],
  // ]);

  // button per letter
  // TODO(@darzu): render buttons?
  // const CHARS = `abcdefghijklmnopqrstuvwxyz.`.split("");
  // const CHARS = `1234567890JQKA.`.split("");
  const polyBank = new Map<number, GameMesh>();
  const btnKey = `letter`;
  for (let i = 0; i < CHARS.length; i++) {
    const c = CHARS[i];
    const letterKey = `letter-${c}`;
    const mesh = cloneMesh(quadGMesh.mesh);
    // const mesh = cloneMesh(res.buttonsState.gmesh.mesh);
    mesh.dbgName = letterKey;
    // console.dir(res.buttonsState.gmesh.mesh);
    // console.dir(mesh);
    const reserve: MeshReserve = {
      maxVertNum: 100,
      maxPrimNum: 100,
      // maxLineNum: mesh.lines?.length ?? 0,
    };
    const gmesh = gameMeshFromMesh(mesh, res.renderer.renderer, reserve);
    // TODO(@darzu): update gmesh after half-edge editor changes: aabb etc

    polyBank.set(i, gmesh);

    let svg = CHAR_SVG[c];
    if (!svg)
      svg = [
        { i: "M", x: -1, y: -1 },
        { i: "v", dy: 2 },
        { i: "h", dx: 2 },
        { i: "v", dy: -2 },
        { i: "h", dx: -2 },
      ];
    const btn = await sketchSvg(svg, { num: 20, key: letterKey });

    // const btn = EM.new();
    // EM.set(btn, RenderableConstructDef, gmesh.proto);
    // EM.set(btn, RenderableConstructDef, svgE.);
    EM.set(btn, PositionDef, V(-24 + i * 2, -12, 0.1));
    EM.set(btn, ButtonDef, btnKey, i, {
      default: ENDESGA16.lightGray,
      hover: ENDESGA16.darkGray,
      down: ENDESGA16.orange,
    });
    EM.set(btn, ColorDef);
    EM.set(btn, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: gmesh.aabb,
    });

    // TODO(@darzu): NEED TO UPDATE MeshEditor based on letter button press
  }

  // Edit letters
  EM.addSystem(
    "letterBtnClick",
    Phase.GAME_WORLD,
    null,
    [ButtonsStateDef, MeshEditorDef, TextDef],
    (_, res) => {
      const btnIdx = res.buttonsState.clickByKey[btnKey];
      if (btnIdx !== undefined) {
        const poly = polyBank.get(btnIdx);
        assert(poly);
        res.meshEditor.setMesh(poly.proto);
        res.text.upperText = CHARS[btnIdx];
        res.text.upperDiv.style.fontSize = "128px";
        res.text.upperDiv.style.top = "32px";
        // res.text.upperDiv.style.color = "";

        // TODO(@darzu): HACKy export:
        console.log(`mesh '${btnIdx}'`);
        console.log(stringifyMesh(poly.proto.mesh!));
      }
    }
  );

  // TODO(@darzu): HACKY. Cursor or 2d gui or something needs some better
  //    abstracting
  // EM.whenResources(ButtonsStateDef).then((res) => {
  // res.buttonsState.cursorId = cursor.id;
  // });

  initMeshEditor();

  // TODO(@darzu): WIP path editor
  if (EXPERIMENTAL_LINE_STUFF) lineStuff();
}
