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
import { mat4, quat, V, vec3 } from "../matrix/sprig-matrix.js";
import {
  frustumFromBounds,
  getFrustumWorldCorners,
  positionAndTargetToOrthoViewProjMatrix,
} from "../utils/utils-3d.js";
import { createGhost } from "../debug/ghost.js";
import { Phase } from "../ecs/sys-phase.js";
import { XY } from "../meshes/mesh-loader.js";

const dbgGrid = [
  //
  // [mapJfa._inputMaskTex, mapJfa._uvMaskTex],
  //
  // [mapJfa.voronoiTex, mapJfa.sdfTex],
  [{ ptr: shadowDepthTextures, idx: 0 }],
  [{ ptr: shadowDepthTextures, idx: 1 }],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);

const shadingGameMeshesDef = XY.defineMeshSetResource(
  "sg_meshes",
  GrappleGunMesh,
  CubeMesh,
  HexMesh,
  BallMesh
);

export async function initShadingGame() {
  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  // outlineRender.fragOverrides!.lineWidth = 1.0;

  EM.addSystem(
    "grassGameRenderPipelines",
    Phase.GAME_WORLD,
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
    }
  );

  const { camera } = await EM.whenResources(CameraDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 100;
  vec3.set(-20, -20, -20, camera.maxWorldAABB.min);
  vec3.set(+20, +20, +20, camera.maxWorldAABB.max);
  // camera.perspectiveMode = "ortho";

  const { sg_meshes } = await EM.whenResources(shadingGameMeshesDef);

  // light
  const sun = EM.new();
  EM.set(sun, PointLightDef);
  EM.set(sun, ColorDef, V(1, 1, 1));
  // EM.set(sun, PositionDef, V(100, 100, 0));
  // EM.set(sun, PositionDef, V(-10, 10, 10));
  EM.set(sun, PositionDef, V(100, 100, 100));
  EM.set(sun, LinearVelocityDef, V(0.001, 0, 0.001));
  EM.set(sun, RenderableConstructDef, sg_meshes.cube.proto);
  sun.pointLight.constant = 1.0;
  sun.pointLight.linear = 0.0;
  sun.pointLight.quadratic = 0.0;
  vec3.copy(sun.pointLight.ambient, [0.2, 0.2, 0.2]);
  vec3.copy(sun.pointLight.diffuse, [0.5, 0.5, 0.5]);
  EM.set(sun, PositionDef, V(50, 10, 300));

  // ground
  const ground = EM.new();
  EM.set(ground, RenderableConstructDef, sg_meshes.hex.proto);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -10));
  EM.set(ground, ScaleDef, V(10, 10, 10));

  // gizmo
  const gizmoMesh = createGizmoMesh();
  const gizmo = EM.new();
  EM.set(gizmo, RenderableConstructDef, gizmoMesh);
  EM.set(gizmo, PositionDef, V(0, 0, 0));

  // avatar
  const g = createGhost();
  g.position[2] = 5;
  EM.set(g, RenderableConstructDef, sg_meshes.ball.proto);

  vec3.copy(g.position, [-13.21, -12.08, 10.7]);
  quat.copy(g.rotation, [0.0, 0.0, -0.46, 0.89]);
  vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = 1.182;

  // objects
  const obj = EM.new();
  EM.set(obj, RenderableConstructDef, sg_meshes.grappleGun.proto);
  EM.set(obj, PositionDef, V(0, 0, 4));
  EM.set(obj, ColorDef, ENDESGA16.midBrown);
  EM.set(obj, AngularVelocityDef, V(0.001, 0.00013, 0.00017));

  // frustum debugging
  {
    const W = 5;
    let worldCorners: vec3[] = [];
    for (let i = 0; i < 4; i++) {
      const pos = V(jitter(W), jitter(W), jitter(W) + W);
      worldCorners.push(pos);
      const p = EM.new();
      EM.set(p, RenderableConstructDef, sg_meshes.ball.proto);
      EM.set(p, PositionDef, pos);
      EM.set(p, ColorDef, V(0, 1, 0));
    }

    // TODO(@darzu): IMPORTANT. figure out mat4.perspective's clip-space!

    const frust = mat4.create();
    frustumFromBounds(worldCorners, sun.position, frust);
    // mat4.perspective(Math.PI * 0.5, 1920 / 1080, 1, 10, frust);

    const invFrust = mat4.invert(frust);
    const frustCorners = getFrustumWorldCorners(invFrust);
    for (let i = 0; i < frustCorners.length; i++) {
      const p = EM.new();
      EM.set(p, RenderableConstructDef, sg_meshes.ball.proto);
      EM.set(p, PositionDef, vec3.clone(frustCorners[i]));
      EM.set(p, ColorDef, V(1, 0, 0));
    }
    const frustGizMesh = createGizmoMesh();
    mapMeshPositions(frustGizMesh, (p) => vec3.transformMat4(p, invFrust, p));
    const frustGiz = EM.new();
    EM.set(frustGiz, RenderableConstructDef, frustGizMesh);
    EM.set(frustGiz, PositionDef, V(0, 0, 0));

    // const frust2 = mat4.create();
    // positionAndTargetToOrthoViewProjMatrix(frust2, sun.position, V(0, 0, 0));
    // const invFrust2 = mat4.invert(frust2);
    // const frustGiz2Mesh = createGizmoMesh();
    // mapMeshPositions(frustGiz2Mesh, (p) => vec3.transformMat4(p, invFrust2, p));
    // const frustGiz2 = EM.new();
    // EM.set(frustGiz2, RenderableConstructDef, frustGiz2Mesh);
    // EM.set(frustGiz2, PositionDef, V(0, 0, 0));
  }

  // const myViewCorners: EntityW<[typeof PositionDef]>[] = [];
  // for (let i = 0; i < 8; i++) {
  //   const p = EM.new();
  //   EM.set(p, RenderableConstructDef, sg_meshes.ball.proto);
  //   EM.set(p, PositionDef);
  //   EM.set(p, ColorDef, V(0, 1, 1));
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
