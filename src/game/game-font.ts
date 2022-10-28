import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { ColorDef } from "../color-ecs.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { mathMap } from "../math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempVec3, tempQuat, tempMat4 } from "../temp-pool.js";
import { dbgLogOnce } from "../util.js";
import { randNormalPosVec3, randNormalVec3 } from "../utils-3d.js";
import { AssetsDef, makePlaneMesh } from "./assets.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { createGhost, gameplaySystems } from "./game.js";

// TODO(@darzu): 2D editor!

const DBG_3D = false;

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

  for (let x of [-1, 0, 1])
    for (let z of [-1, 0, 1]) {
      const b1 = em.newEntity();
      em.ensureComponentOn(b1, RenderableConstructDef, res.assets.cube.proto);
      em.ensureComponentOn(b1, ColorDef, [
        mathMap(x, -1, 1, 0.05, 0.8),
        0,
        mathMap(z, -1, 1, 0.05, 0.8),
      ]);
      em.ensureComponentOn(b1, PositionDef, [
        PANEL_W * 0.5 * x,
        0,
        PANEL_H * 0.5 * z,
      ]);
    }

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

function initCamera() {
  {
    const camera = EM.addSingletonComponent(CameraDef);
    camera.fov = Math.PI * 0.5;
    camera.targetId = 0;
  }

  EM.registerSystem(
    null,
    [CameraViewDef, CanvasDef, CameraDef],
    (_, res) => {
      // TODO(@darzu):IMPL
      const { cameraView, htmlCanvas } = res;

      if (res.camera.targetId) return;

      // update aspect ratio and size
      cameraView.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraView.width = htmlCanvas.canvas.width;
      cameraView.height = htmlCanvas.canvas.height;

      dbgLogOnce(
        `ar${cameraView.aspectRatio.toFixed(2)}`,
        `ar ${cameraView.aspectRatio.toFixed(2)}`
      );

      let viewMatrix = mat4.create();

      mat4.rotateX(viewMatrix, viewMatrix, Math.PI * 0.5);
      // mat4.translate(viewMatrix, viewMatrix, [0, 10, 0]);

      // mat4.invert(viewMatrix, viewMatrix);

      const projectionMatrix = mat4.create();

      // TODO(@darzu): PRESERVE ASPECT RATIO!
      const VIEW_PAD = PANEL_W / 12;
      const halfW = PANEL_W * 0.5 + VIEW_PAD;
      const halfH = PANEL_H * 0.5 + VIEW_PAD;
      // const ORTHO_SIZE = 20;
      // TODO(@darzu): i don't understand the near/far clipping; why can't they be -4, 4 ?
      mat4.ortho(projectionMatrix, -halfW, halfW, -halfH, halfH, -24, 12);

      const viewProj = mat4.multiply(
        mat4.create(),
        projectionMatrix,
        viewMatrix
      ) as Float32Array;

      cameraView.viewProjMat = viewProj;
    },
    "uiCameraView"
  );

  gameplaySystems.push("uiCameraView");
}
