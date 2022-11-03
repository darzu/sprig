import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { ColorDef } from "../color-ecs.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { extrudeQuad, meshToHalfEdgePoly } from "../half-edge.js";
import { InputsDef } from "../inputs.js";
import { mathMap } from "../math.js";
import { PositionDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { Mesh, RawMesh, scaleMesh, scaleMesh3 } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempVec2, tempVec3 } from "../temp-pool.js";
import { randNormalPosVec3, randNormalVec3 } from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import { AssetsDef, BLACK, makePlaneMesh } from "./assets.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { createGhost, gameplaySystems } from "./game.js";

// TODO(@darzu): 2D editor!

const DBG_3D = true; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

export async function initFontEditor(em: EntityManager) {
  console.log(`panel ${PANEL_W}x${PANEL_H}`);

  initCamera();

  const res = await em.whenResources(AssetsDef, GlobalCursor3dDef, RendererDef);

  res.renderer.pipelines = [
    // ...shadowPipelines,
    stdRenderPipeline,
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

  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const panel = em.newEntity();
  const panelMesh = makePlaneMesh(
    -PANEL_W * 0.5,
    PANEL_W * 0.5,
    -PANEL_H * 0.5,
    PANEL_H * 0.5
  );
  panelMesh.colors[0] = [0.1, 0.3, 0.1];
  panelMesh.colors[1] = [0.1, 0.1, 0.3];
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
}

async function initCamera() {
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
  EM.ensureComponentOn(cursor, PositionDef, [0, 0, 0]);
  {
    const { assets } = await EM.whenResources(AssetsDef);
    EM.ensureComponentOn(cursor, RenderableConstructDef, assets.cube.proto);
  }

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
      // let cursorViewX = cursorFracX * adjPanelW;
      // let cursorViewY = cursorFracY * adjPanelH;
      // let cursorWorldX =
      //   cursorViewX - (adjPanelW - PANEL_W) * 0.5 - PANEL_W * 0.5;
      // let cursorWorldZ =
      //   cursorViewY - (adjPanelH - PANEL_H) * 0.5 - PANEL_H * 0.5;

      const cursorWorld = screenPosToWorldPos(
        vec3.create(),
        inputs.mousePos,
        cameraView
      );
      cursorWorld[1] = 0;

      // cursor.position[0] = cursorWorldX;
      // cursor.position[2] = cursorWorldZ;

      // TODO(@darzu): pain on surface

      if (inputs.lclick) {
        // console.dir({
        //   cursorFracX,
        //   cursorFracY,
        //   cursorViewX,
        //   cursorViewY,
        //   cursorWorldX,
        //   cursorWorldZ,
        // });

        // TODO(@darzu):
        const { assets } = await EM.whenResources(AssetsDef);
        const b1 = EM.newEntity();
        EM.ensureComponentOn(b1, RenderableConstructDef, assets.cube.proto);
        EM.ensureComponentOn(b1, ColorDef, [
          mathMap(cursorFracX, 0, 1, 0.05, 0.8),
          0,
          mathMap(cursorFracY, 0, 1, 0.05, 0.8),
        ]);
        EM.ensureComponentOn(b1, PositionDef, cursorWorld);
      }

      // // TODO(@darzu): experiment getting cursor from viewProj
      // const invViewProj = mat4.invert(mat4.create(), viewProj);
      // const worldPos2 = vec3.transformMat4(
      //   tempVec3(),
      //   [
      //     mathMap(cursorFracX, 0, 1, -1, 1),
      //     mathMap(cursorFracY, 0, 1, 1, -1),
      //     0,
      //   ],
      //   invViewProj
      // );

      // cursor.position[0] = worldPos2[0];
      // cursor.position[2] = worldPos2[2];
      cursor.position[0] = cursorWorld[0];
      cursor.position[2] = cursorWorld[2];
    },
    "uiCameraView"
  );

  gameplaySystems.push("uiCameraView");

  // testHalfEdge
  {
    const mesh: Mesh = {
      quad: [
        [0, 3, 4, 1],
        [3, 5, 6, 4],
      ],
      tri: [
        [2, 3, 0],
        [5, 3, 2],
      ],
      pos: [
        [0, 0, 0],
        [1, 0, 0],
        [-1, 0, 1],
        [0, 0, 1],
        [1, 0, 1],
        [0, 0, 2],
        [1, 0, 2],
      ],
      colors: [
        randNormalPosVec3(),
        randNormalPosVec3(),
        randNormalPosVec3(),
        randNormalPosVec3(),
      ],
      surfaceIds: [1, 2, 3, 4],
      usesProvoking: true,
    };
    scaleMesh(mesh, 4);

    const hp = meshToHalfEdgePoly(mesh);
    console.dir(hp);

    {
      const outerHes = hp.edges.filter((h) => !h.face)!;
      const newHes = outerHes.map((he) => extrudeQuad(hp, he));
      newHes.forEach((he, i) => {
        // vec3.set(mesh.colors[he.fi], 0.6, 0.05, 0.05);
        randNormalVec3(mesh.colors[he.fi]);
      });
    }
    console.dir(hp);
    {
      const outerHes = hp.edges.filter((h) => !h.face)!;
      const newHes = outerHes.map((he) => extrudeQuad(hp, he));
      newHes.forEach((he, i) => {
        // vec3.set(mesh.colors[he.fi], 0.05, 0.05, 0.6);
        randNormalVec3(mesh.colors[he.fi]);
      });
    }

    const ent0 = EM.newEntity();
    EM.ensureComponentOn(ent0, RenderableConstructDef, mesh);
    EM.ensureComponentOn(ent0, PositionDef, [0, 1, 0]);
  }

  EM.registerSystem(
    null,
    [CameraViewDef, CanvasDef, CameraDef, InputsDef],
    async (_, res) => {
      // TODO(@darzu): impl
    },
    "hpolyManipulate"
  );
  gameplaySystems.push("hpolyManipulate");
}
