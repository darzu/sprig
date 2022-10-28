import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { EntityManager } from "../entity-manager.js";
import { vec3, quat } from "../gl-matrix.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { AssetsDef } from "./assets.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { createGhost } from "./game.js";

export async function initFontEditor(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

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
  // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
  // vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
  em.ensureComponentOn(sunlight, PositionDef, [10, 100, 10]);
  em.ensureComponentOn(sunlight, RenderableConstructDef, res.assets.ball.proto);

  const g = createGhost(em);
  // em.ensureComponentOn(g, RenderableConstructDef, res.assets.cube.proto);
  // createPlayer(em);

  // vec3.copy(e.position, [-16.6, 5, -5.1]);
  // quat.copy(e.rotation, [0, -0.77, 0, 0.636]);
  // vec3.copy(e.cameraFollow.positionOffset, [0, 0, 0]);
  // quat.copy(e.cameraFollow.rotationOffset, [-0.225, 0, 0, 0.974]);
  // vec3.copy(g.position, [-4.28, 0.97, 0.11]);
  // quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
  // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  // quat.copy(g.cameraFollow.rotationOffset, [-0.18, 0.0, 0.0, 0.98]);
  vec3.copy(g.position, [0, 1, -1.2]);
  quat.setAxisAngle(g.rotation, [0.0, -1.0, 0.0], 1.62);
  // setCameraFollowPosition(g, "thirdPerson");
  g.cameraFollow.positionOffset = [0, 0, 5];
  g.controllable.modes.canYaw = false;
  g.controllable.modes.canCameraYaw = true;
  // g.controllable.modes.canPitch = true;
  g.controllable.speed *= 0.5;
  g.controllable.sprintMul = 10;

  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const p = em.newEntity();
  em.ensureComponentOn(p, RenderableConstructDef, res.assets.plane.proto);
  em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(p, PositionDef, [0, -5, 0]);

  const b1 = em.newEntity();
  const m1 = cloneMesh(res.assets.cube.mesh);
  em.ensureComponentOn(b1, RenderableConstructDef, m1);
  em.ensureComponentOn(b1, ColorDef, [0.1, 0.1, 0.1]);
  em.ensureComponentOn(b1, PositionDef, [0, 0, 3]);
  em.ensureComponentOn(b1, RotationDef);
  em.ensureComponentOn(b1, AngularVelocityDef, [0, 0.001, 0.001]);
  em.ensureComponentOn(b1, WorldFrameDef);
  em.ensureComponentOn(b1, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.cube.aabb,
  });
  // em.ensureComponentOn(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });
}
