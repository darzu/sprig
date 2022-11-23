import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { dbg } from "../debugger.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { ButtonDef, ButtonsStateDef, initButtonGUI } from "../gui/button.js";
import { initMeshEditor } from "../gui/mesh-editor.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { exportObj, importObj } from "../import_obj.js";
import { InputsDef, MouseDragDef } from "../inputs.js";
import { mathMap } from "../math.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { MeshReserve } from "../render/mesh-pool.js";
import {
  cloneMesh,
  getAABBFromMesh,
  Mesh,
  normalizeMesh,
  scaleMesh,
  transformMesh,
  unshareProvokingVertices,
} from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { randNormalPosVec3, vec3Mid } from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import {
  AssetsDef,
  GameMesh,
  gameMeshFromMesh,
  makePlaneMesh,
} from "./assets.js";
import { createGhost, gameplaySystems } from "./game.js";

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

const DBG_3D = false; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

export async function initFontEditor(em: EntityManager) {
  initButtonGUI();

  console.log(`panel ${PANEL_W}x${PANEL_H}`);

  // initCamera();

  const res = await em.whenResources(AssetsDef, RendererDef, ButtonsStateDef);

  res.renderer.pipelines = [
    // ...shadowPipelines,
    stdRenderPipeline,
    alphaRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const sunlight = em.newEntity();
  em.ensureComponentOn(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  em.ensureComponentOn(sunlight, PositionDef, [10, 100, 10]);
  // TODO(@darzu): weird, why does renderable need to be on here?
  em.ensureComponentOn(
    sunlight,
    RenderableConstructDef,
    res.assets.ball.proto,
    false
  );

  const panel = em.newEntity();
  const panelMesh = makePlaneMesh(
    -PANEL_W * 0.5,
    PANEL_W * 0.5,
    -PANEL_H * 0.5,
    PANEL_H * 0.5
  );
  // panelMesh.colors[0] = [0.1, 0.3, 0.1];
  // panelMesh.colors[1] = [0.1, 0.1, 0.3];
  panelMesh.colors[0] = [0.4, 0.4, 0.4];
  em.ensureComponentOn(panel, RenderableConstructDef, panelMesh);
  // em.ensureComponentOn(panel, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(panel, PositionDef, [0, 0, 0]);

  // for (let x of [-1, 0, 1])
  //   for (let z of [-1, 0, 1]) {
  //     const b1 = em.newEntity();
  //     em.ensureComponentOn(b1, RenderableConstructDef, res.assets.cube.proto);
  //     em.ensureComponentOn(b1, ColorDef, [
  //       mathMap(x, -1, 1, 0.05, 0.8),
  //       0,
  //       mathMap(z, -1, 1, 0.05, 0.8),
  //     ]);
  //     em.ensureComponentOn(b1, PositionDef, [
  //       PANEL_W * 0.5 * x,
  //       0,
  //       PANEL_H * 0.5 * z,
  //     ]);
  //   }

  if (DBG_3D) {
    const g = createGhost();
    em.ensureComponentOn(g, RenderableConstructDef, res.assets.ball.proto);

    // vec3.copy(g.position, [4.36,30.83,-1.53]);
    // quat.copy(g.rotation, [0.00,0.71,0.00,0.70]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.00,0.00,0.00]);
    // g.cameraFollow.yawOffset = 0.000;
    // g.cameraFollow.pitchOffset = -1.496;
    vec3.copy(g.position, [-1.45, 27.5, 6.93]);
    quat.copy(g.rotation, [0.0, 0.0, 0.0, 1.0]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -1.496;
  }

  {
    const camera = EM.addSingletonComponent(CameraDef);
    camera.fov = Math.PI * 0.5;
    camera.targetId = 0;
  }

  // TODO(@darzu): mouse lock?
  if (!DBG_3D)
    EM.whenResources(CanvasDef).then((canvas) =>
      canvas.htmlCanvas.unlockMouse()
    );

  const cursor = EM.newEntity();
  EM.ensureComponentOn(cursor, ColorDef, [0.1, 0.1, 0.1]);
  EM.ensureComponentOn(cursor, PositionDef, [0, 1.0, 0]);
  const { assets } = await EM.whenResources(AssetsDef);
  // EM.ensureComponentOn(cursor, RenderableConstructDef, assets.cube.proto);
  // const cursorLocalAABB = copyAABB(createAABB(), assets.cube.aabb);
  EM.ensureComponentOn(cursor, RenderableConstructDef, assets.he_octo.proto);
  const cursorLocalAABB = copyAABB(createAABB(), assets.he_octo.aabb);
  cursorLocalAABB.min[1] = -1;
  cursorLocalAABB.max[1] = 1;
  EM.ensureComponentOn(cursor, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: cursorLocalAABB,
  });

  EM.registerSystem(
    null,
    [CameraViewDef, CanvasDef, CameraDef, InputsDef],
    async (_, res) => {
      // TODO(@darzu):IMPL
      const { cameraView, htmlCanvas, inputs } = res;

      if (res.camera.targetId) return;

      // update aspect ratio and size
      cameraView.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraView.width = htmlCanvas.canvas.clientWidth;
      cameraView.height = htmlCanvas.canvas.clientHeight;

      // dbgLogOnce(
      //   `ar${cameraView.aspectRatio.toFixed(2)}`,
      //   `ar ${cameraView.aspectRatio.toFixed(2)}`
      // );

      let viewMatrix = mat4.create();

      mat4.rotateX(viewMatrix, viewMatrix, Math.PI * 0.5);
      // mat4.translate(viewMatrix, viewMatrix, [0, 10, 0]);

      // mat4.invert(viewMatrix, viewMatrix);

      const projectionMatrix = mat4.create();

      // TODO(@darzu): PRESERVE ASPECT RATIO!
      const VIEW_PAD = PANEL_W / 12;

      const padPanelW = PANEL_W + VIEW_PAD * 2;
      const padPanelH = PANEL_H + VIEW_PAD * 2;

      const padPanelAR = padPanelW / padPanelH;
      const cameraAR = cameraView.width / cameraView.height;

      // const maxPanelW = boxInBox(cameraView.width, cameraView.height, panelAR);

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
        projectionMatrix,
        -adjPanelW * 0.5,
        adjPanelW * 0.5,
        -adjPanelH * 0.5,
        adjPanelH * 0.5,
        -24,
        12
      );

      const viewProj = mat4.multiply(
        mat4.create(),
        projectionMatrix,
        viewMatrix
      ) as Float32Array;

      cameraView.viewProjMat = viewProj;
      cameraView.invViewProjMat = mat4.invert(
        cameraView.invViewProjMat,
        cameraView.viewProjMat
      );

      let cursorFracX = inputs.mousePos[0] / htmlCanvas.canvas.clientWidth;
      let cursorFracY = inputs.mousePos[1] / htmlCanvas.canvas.clientHeight;
      const cursorWorldPos = vec3.transformMat4(
        tempVec3(),
        [
          mathMap(cursorFracX, 0, 1, -1, 1),
          mathMap(cursorFracY, 0, 1, 1, -1),
          0,
        ],
        cameraView.invViewProjMat
      );
      cursor.position[0] = cursorWorldPos[0];
      cursor.position[2] = cursorWorldPos[2];
    },
    "uiCameraView"
  );

  gameplaySystems.push("uiCameraView");

  // testHalfEdge
  const hpMesh: Mesh = {
    quad: [[0, 1, 2, 3]],
    tri: [],
    pos: [
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, 1],
    ],
    colors: [randNormalPosVec3()],
    surfaceIds: [1],
    usesProvoking: true,
  };
  scaleMesh(hpMesh, 4);

  // TODO(@darzu): HACK
  (dbg as any).exportPoly = () => {
    console.log(exportObj(hpMesh));
  };

  // TODO(@darzu): render buttons?
  const CHARS = `abcdefghijklmnopqrstuvwxyz.`.split("");
  const polyBank = new Map<string, GameMesh>();

  for (let i = 0; i < CHARS.length; i++) {
    const c = CHARS[i];
    const key = `letter-${c}`;
    const mesh = cloneMesh(res.buttonsState.gmesh.mesh);
    mesh.dbgName = key;
    // console.dir(res.buttonsState.gmesh.mesh);
    // console.dir(mesh);
    const reserve: MeshReserve = {
      maxVertNum: 100,
      maxTriNum: 100,
      maxLineNum: 0,
    };
    const gmesh = gameMeshFromMesh(mesh, res.renderer.renderer, reserve);
    // TODO(@darzu): update gmesh after half-edge editor changes: aabb etc

    polyBank.set(key, gmesh);

    // TODO(@darzu): if they all have the same key, they don't work.
    const btn = EM.newEntity();
    EM.ensureComponentOn(btn, RenderableConstructDef, gmesh.proto);
    EM.ensureComponentOn(btn, PositionDef, [-24 + i * 2, 0.1, 12]);
    EM.ensureComponentOn(btn, ButtonDef, key, i, {
      default: ENDESGA16.lightGray,
      hover: ENDESGA16.darkGray,
      down: ENDESGA16.orange,
    });
    EM.ensureComponentOn(btn, ColorDef);
    EM.ensureComponentOn(btn, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: gmesh.aabb,
    });
  }

  // TODO(@darzu): HACKY
  // EM.whenResources(ButtonsStateDef).then((res) => {
  res.buttonsState.cursorId = cursor.id;
  // });

  initMeshEditor(hpMesh, cursor.id);
}
