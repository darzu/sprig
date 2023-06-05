import {
  AllMeshesDef,
  BallMesh,
  CubeMesh,
  GrappleGunMesh,
  HexMesh,
} from "../meshes/mesh-list.js";
import { CameraDef, CameraComputedDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { jitter } from "../utils/math.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { mat4, quat, V, vec3 } from "../matrix/sprig-matrix.js";
import { createGhost } from "../debug/ghost.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mapMeshPositions } from "../meshes/mesh.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";

const mpMeshes = XY.defineMeshSetResource(
  "mp_meshes",
  CubeMesh,
  HexMesh,
  BallMesh
);

export async function initMPGame() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
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
    ];
  });

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { mp_meshes } = await EM.whenResources(mpMeshes);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  // EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  // EM.ensureComponentOn(sun, PositionDef, V(-10, 10, 10));
  EM.ensureComponentOn(sun, PositionDef, V(100, 100, 100));
  EM.ensureComponentOn(sun, LinearVelocityDef, V(0.001, 0.001, 0.0));
  EM.ensureComponentOn(sun, RenderableConstructDef, mp_meshes.cube.proto);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.ensureComponentOn(sun, PositionDef, V(50, 300, 10));

  // ground
  const ground = EM.new();
  EM.ensureComponentOn(ground, RenderableConstructDef, mp_meshes.hex.proto);
  EM.ensureComponentOn(ground, ColorDef, ENDESGA16.blue);
  EM.ensureComponentOn(ground, PositionDef, V(0, -10, 0));
  EM.ensureComponentOn(ground, ScaleDef, V(10, 10, 10));

  // gizmo
  const gizmoMesh = createGizmoMesh();
  const gizmo = EM.new();
  EM.ensureComponentOn(gizmo, RenderableConstructDef, gizmoMesh);
  EM.ensureComponentOn(gizmo, PositionDef, V(0, 1, 0));

  // avatar
  const g = createGhost();
  g.position[1] = 5;
  EM.ensureComponentOn(g, RenderableConstructDef, mp_meshes.ball.proto);
  // vec3.copy(g.position, [2.44, 6.81, 0.96]);
  // quat.copy(g.rotation, [0.0, 0.61, 0.0, 0.79]);
  // g.cameraFollow.pitchOffset = -0.553;
  vec3.copy(g.position, [-0.5, 10.7, 15.56]);
  quat.copy(g.rotation, [0.0, -0.09, 0.0, 0.99]);
  // vec3.copy(g.cameraFollow.positionOffset, [0.00,0.00,0.00]);
  // g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.32;
}
