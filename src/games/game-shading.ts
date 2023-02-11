import { AssetsDef } from "../assets.js";
import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../entity-manager.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { PositionDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { quat, V, vec3 } from "../sprig-matrix.js";
import { createGhost } from "./ghost.js";

export async function initShadingGame() {
  outlineRender.fragOverrides!.lineWidth = 3.0;

  const { renderer } = await EM.whenResources(RendererDef);

  // render pipelines
  renderer.pipelines = [
    stdRenderPipeline,
    deferredPipeline,
    outlineRender,
    postProcess,
  ];

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;

  const { assets } = await EM.whenResources(AssetsDef);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  // sun.pointLight.ambient = V(0.2, 0.2, 0.2);
  sun.pointLight.ambient = V(1.0, 1.0, 1.0);
  // sun.pointLight.diffuse = V(0.5, 0.5, 0.5);
  // sun.pointLight.constant = 1.0;

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(ground, RenderableConstructDef, assets.plane.proto);
  EM.ensureComponentOn(ground, ColorDef, ENDESGA16.lightGreen);
  EM.ensureComponentOn(ground, PositionDef);

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
