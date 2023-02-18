import { AssetsDef } from "../assets.js";
import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../console.js";
import { EM } from "../entity-manager.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { PositionDef } from "../physics/transform.js";
import { createGizmoMesh, createLineMesh } from "../primatives.js";
import { PointLightDef } from "../render/lights.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { quat, V, vec3 } from "../sprig-matrix.js";
import { createGhost } from "./ghost.js";

const dbgGrid = [
  //
  // [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
  //
  // [mapJfa.voronoiTex, mapJfa.sdfTex],
  [shadowDepthTextures[0]],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

export async function initShadingGame() {
  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  outlineRender.fragOverrides!.lineWidth = 3.0;

  const { renderer } = await EM.whenResources(RendererDef);

  EM.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      // renderer
      res.renderer.pipelines = [
        ...shadowPipelines,
        // skyPipeline,
        stdRenderPipeline,
        // renderGrassPipe,
        // renderOceanPipe,
        outlineRender,
        deferredPipeline,
        // skyPipeline,
        postProcess,
        ...(res.dev.showConsole ? dbgGridCompose : []),
      ];
    },
    "smolGameRenderPipelines"
  );
  EM.requireSystem("smolGameRenderPipelines");

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);

  const { assets } = await EM.whenResources(AssetsDef);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  // EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  EM.ensureComponentOn(sun, PositionDef, V(1, 1, 0));
  EM.ensureComponentOn(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.ensureComponentOn(sun, RenderableConstructDef, assets.cube.proto);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.ensureComponentOn(sun, PositionDef, V(50, 300, 10));

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(ground, RenderableConstructDef, assets.plane.proto);
  EM.ensureComponentOn(ground, ColorDef, ENDESGA16.blue);
  EM.ensureComponentOn(ground, PositionDef);

  // gizmo
  const gizmoMesh = createGizmoMesh();
  const gizmo = EM.new();
  EM.ensureComponentOn(gizmo, RenderableConstructDef, gizmoMesh);
  EM.ensureComponentOn(gizmo, PositionDef, V(0, 1, 0));

  // avatar
  const avatar = createGhost();
  avatar.position[1] = 5;
  EM.ensureComponentOn(avatar, RenderableConstructDef, assets.ball.proto);
  vec3.copy(avatar.position, [2.44, 6.81, 0.96]);
  quat.copy(avatar.rotation, [0.0, 0.61, 0.0, 0.79]);
  avatar.cameraFollow.pitchOffset = -0.553;

  // objects
  const obj = EM.new();
  EM.ensureComponentOn(obj, RenderableConstructDef, assets.grappleGun.proto);
  EM.ensureComponentOn(obj, PositionDef, V(0, 4, 0));
  EM.ensureComponentOn(obj, ColorDef, ENDESGA16.midBrown);
  EM.ensureComponentOn(obj, AngularVelocityDef, V(0.001, 0.00013, 0.00017));
}
