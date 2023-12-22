import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh } from "../meshes/mesh-list.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";

const DBG_GHOST = true;
const DBG_GIZMO = true;

export async function initGrayboxStarter() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdRenderPipeline,
      outlineRender,
      deferredPipeline,
      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  vec3.set(-200, -200, -200, camera.maxWorldAABB.min);
  vec3.set(+200, +200, +200, camera.maxWorldAABB.max);

  const { mesh_cube, mesh_hex } = await EM.whenResources(
    CubeMesh.def,
    HexMesh.def
  );

  // light
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, RenderableConstructDef, mesh_cube.proto, false);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 300, 10));

  // dbg ghost
  if (DBG_GHOST) {
    const g = createGhost(mesh_cube.proto);
    g.position[2] = 5;

    // hover near origin
    vec3.copy(g.position, [12.51, 21.4, 15.88]);
    quat.copy(g.rotation, [0.0, 0.24, 0.0, 0.96]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.74;
  }

  // gizmo
  if (DBG_GIZMO) {
    const pedestal = EM.new();
    EM.set(pedestal, RenderableConstructDef, mesh_hex.proto);
    EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
    EM.set(pedestal, PositionDef, V(0, -10, 0));
    EM.set(pedestal, ScaleDef, V(10, 10, 10));
    EM.set(pedestal, ColliderDef, {
      shape: "AABB",
      solid: true,
      aabb: mesh_hex.aabb,
    });

    const gizmoMesh = createGizmoMesh();
    const gizmo = EM.new();
    EM.set(gizmo, RenderableConstructDef, gizmoMesh);
    EM.set(gizmo, PositionDef, V(0, 0, 0));
    EM.set(gizmo, ScaleDef, V(5, 5, 5));
  }
}
