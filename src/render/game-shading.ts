import { AssetsDef } from "../meshes/assets.js";
import { CameraDef, CameraComputedDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { AllEndesga16, ENDESGA16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { jitter } from "../utils/math.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/velocity.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "./lights.js";
import { mapMeshPositions } from "../meshes/mesh.js";
import { createGridComposePipelines } from "./pipelines/std-compose.js";
import { deferredPipeline } from "./pipelines/std-deferred.js";
import { stdRenderPipeline } from "./pipelines/std-mesh.js";
import { outlineRender } from "./pipelines/std-outline.js";
import { postProcess } from "./pipelines/std-post.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "./pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "./renderer-ecs.js";
import { mat4, quat, V, vec3 } from "../sprig-matrix.js";
import {
  frustumFromBounds,
  getFrustumWorldCorners,
  positionAndTargetToOrthoViewProjMatrix,
} from "../utils/utils-3d.js";
import { createGhost } from "../debug/ghost.js";

const dbgGrid = [
  //
  // [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
  //
  // [mapJfa.voronoiTex, mapJfa.sdfTex],
  [{ ptr: shadowDepthTextures, idx: 0 }],
  [{ ptr: shadowDepthTextures, idx: 1 }],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

export async function initShadingGame() {
  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  // outlineRender.fragOverrides!.lineWidth = 1.0;

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
    "grassGameRenderPipelines"
  );
  EM.requireSystem("grassGameRenderPipelines");

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { assets } = await EM.whenResources(AssetsDef);

  // light
  const sun = EM.new();
  EM.ensureComponentOn(sun, PointLightDef);
  EM.ensureComponentOn(sun, ColorDef, V(1, 1, 1));
  // EM.ensureComponentOn(sun, PositionDef, V(100, 100, 0));
  // EM.ensureComponentOn(sun, PositionDef, V(-10, 10, 10));
  EM.ensureComponentOn(sun, PositionDef, V(100, 100, 100));
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
  EM.ensureComponentOn(ground, RenderableConstructDef, assets.hex.proto);
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
  EM.ensureComponentOn(g, RenderableConstructDef, assets.ball.proto);
  // vec3.copy(g.position, [2.44, 6.81, 0.96]);
  // quat.copy(g.rotation, [0.0, 0.61, 0.0, 0.79]);
  // g.cameraFollow.pitchOffset = -0.553;
  vec3.copy(g.position, [-0.5, 10.7, 15.56]);
  quat.copy(g.rotation, [0.0, -0.09, 0.0, 0.99]);
  // vec3.copy(g.cameraFollow.positionOffset, [0.00,0.00,0.00]);
  // g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.32;

  // objects
  const obj = EM.new();
  EM.ensureComponentOn(obj, RenderableConstructDef, assets.grappleGun.proto);
  EM.ensureComponentOn(obj, PositionDef, V(0, 4, 0));
  EM.ensureComponentOn(obj, ColorDef, ENDESGA16.midBrown);
  EM.ensureComponentOn(obj, AngularVelocityDef, V(0.001, 0.00013, 0.00017));

  // frustum debugging
  {
    const W = 5;
    let worldCorners: vec3[] = [];
    for (let i = 0; i < 4; i++) {
      const pos = V(jitter(W), jitter(W) + W, jitter(W));
      worldCorners.push(pos);
      const p = EM.new();
      EM.ensureComponentOn(p, RenderableConstructDef, assets.ball.proto);
      EM.ensureComponentOn(p, PositionDef, pos);
      EM.ensureComponentOn(p, ColorDef, V(0, 1, 0));
    }

    // TODO(@darzu): IMPORTANT. figure out mat4.perspective's clip-space!

    const frust = mat4.create();
    frustumFromBounds(worldCorners, sun.position, frust);
    // mat4.perspective(Math.PI * 0.5, 1920 / 1080, 1, 10, frust);

    const invFrust = mat4.invert(frust);
    const frustCorners = getFrustumWorldCorners(invFrust);
    for (let i = 0; i < frustCorners.length; i++) {
      const p = EM.new();
      EM.ensureComponentOn(p, RenderableConstructDef, assets.ball.proto);
      EM.ensureComponentOn(p, PositionDef, vec3.clone(frustCorners[i]));
      EM.ensureComponentOn(p, ColorDef, V(1, 0, 0));
    }
    const frustGizMesh = createGizmoMesh();
    mapMeshPositions(frustGizMesh, (p) => vec3.transformMat4(p, invFrust, p));
    const frustGiz = EM.new();
    EM.ensureComponentOn(frustGiz, RenderableConstructDef, frustGizMesh);
    EM.ensureComponentOn(frustGiz, PositionDef, V(0, 0, 0));

    // const frust2 = mat4.create();
    // positionAndTargetToOrthoViewProjMatrix(frust2, sun.position, V(0, 0, 0));
    // const invFrust2 = mat4.invert(frust2);
    // const frustGiz2Mesh = createGizmoMesh();
    // mapMeshPositions(frustGiz2Mesh, (p) => vec3.transformMat4(p, invFrust2, p));
    // const frustGiz2 = EM.new();
    // EM.ensureComponentOn(frustGiz2, RenderableConstructDef, frustGiz2Mesh);
    // EM.ensureComponentOn(frustGiz2, PositionDef, V(0, 0, 0));
  }

  // const myViewCorners: EntityW<[typeof PositionDef]>[] = [];
  // for (let i = 0; i < 8; i++) {
  //   const p = EM.new();
  //   EM.ensureComponentOn(p, RenderableConstructDef, assets.ball.proto);
  //   EM.ensureComponentOn(p, PositionDef);
  //   EM.ensureComponentOn(p, ColorDef, V(0, 1, 1));
  //   myViewCorners.push(p);
  // }
  // EM.registerSystem(
  //   null,
  //   [CameraViewDef],
  //   (_, res) => {
  //     const viewCorners = getFrustumWorldCorners(res.cameraComputed.invViewProjMat);
  //     for (let i = 0; i < 8; i++) {
  //       vec3.copy(myViewCorners[i].position, viewCorners[i]);
  //     }
  //   },
  //   "dbgViewProj"
  // );
  // EM.requireSystem("dbgViewProj");
}
