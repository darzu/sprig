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
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
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
  vec3Dbg,
} from "../utils/utils-3d.js";
import { createGhost } from "../debug/ghost.js";
import { Phase } from "../ecs/sys-phase.js";
import { GameMesh, XY } from "../meshes/mesh-loader.js";
import { addGizmoChild } from "../utils/utils-game.js";
import { makeDome } from "../meshes/primatives.js";
import { SKY_MASK } from "./pipeline-masks.js";
import { drawVector } from "../utils/util-vec-dbg.js";

const SHOW_GALLERY = true;
const SHOW_SKYDOME = false;

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

export async function initGalleryGame() {
  // TODO(@darzu): HACK. these have to be set before the CY instantiator runs.
  // outlineRender.fragOverrides!.lineWidth = 1.0;

  EM.addSystem(
    "galleryGamePipelines",
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
  camera.viewDist = 200;
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
  EM.set(gizmo, ScaleDef, V(8, 8, 8));

  // arrows
  drawVector(V(1, 1, 0), { scale: 10, color: ENDESGA16.red });
  drawVector(V(0, 1, 1), { scale: 10 });
  drawVector(V(1, 0, 1), { scale: 10 });

  // avatar
  const g = createGhost(sg_meshes.ball.proto, false);
  g.position[2] = 5;
  g.controllable.speed *= 10;
  g.controllable.sprintMul = 0.1;

  vec3.copy(g.position, [9.65, -12.47, 15.43]);
  quat.copy(g.rotation, [0.0, 0.0, 0.11, 0.99]);
  vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
  g.cameraFollow.yawOffset = 0.0;
  g.cameraFollow.pitchOffset = -0.49;

  // sky dome?
  if (SHOW_SKYDOME) {
    const SKY_HALFSIZE = 100;
    const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
    const sky = EM.new();
    EM.set(sky, PositionDef, V(0, 0, -10));
    // const skyMesh = cloneMesh(res.allMeshes.cube.mesh);
    // skyMesh.pos.forEach((p) => vec3.scale(p, SKY_HALFSIZE, p));
    // skyMesh.quad.forEach((f) => vec4.reverse(f, f));
    // skyMesh.tri.forEach((f) => vec3.reverse(f, f));
    const skyMesh = domeMesh;
    EM.set(
      sky,
      RenderableConstructDef,
      skyMesh
      // undefined,
      // undefined,
      // SKY_MASK
    );
    // EM.set(sky, ColorDef, V(0.9, 0.9, 0.9));
  }

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

  if (SHOW_GALLERY) {
    createGallery();
  }
}

async function createGallery() {
  // TODO(@darzu): Z_UP: verify yaw,pitch,roll work as expected!!

  // TODO(@darzu): present a mesh set on a single pedestal.
  const objMargin = 8;
  let lastX = 10;
  const maxHalfsize = 20;
  function presentGameMesh(m: GameMesh) {
    const halfsize = Math.max(m.halfsize[0], m.halfsize[1]);

    const hasScale = halfsize > maxHalfsize;
    const scale = hasScale ? maxHalfsize / halfsize : 1.0;

    // console.log(`halfsize: ${halfsize}`);

    let x = lastX + objMargin + halfsize * scale;

    let ground = EM.new();
    EM.set(ground, RenderableConstructDef, sg_meshes.hex.mesh);
    const groundSize = (halfsize * scale) / sg_meshes.hex.halfsize[0];
    EM.set(ground, ScaleDef, [groundSize, groundSize, 1]);
    EM.set(ground, PositionDef, V(x, 0, -sg_meshes.hex.aabb.max[2]));
    EM.set(ground, ColorDef, hasScale ? ENDESGA16.lightBlue : ENDESGA16.blue);

    let obj = EM.new();
    EM.set(obj, RenderableConstructDef, m.mesh);
    EM.set(
      obj,
      PositionDef,
      V(x - m.center[0] * scale, -m.center[1] * scale, -m.aabb.min[2] * scale)
    );
    if (hasScale) EM.set(obj, ScaleDef, V(scale, scale, scale));

    // TODO(@darzu): DBGing yaw,pitch,roll
    EM.set(obj, RotationDef, quat.fromYawPitchRoll(0.0, 0.0, 0.0));

    addGizmoChild(obj, halfsize * scale * 1.1);

    const anyColor = m.mesh.colors.some((c) => !vec3.equals(c, [0, 0, 0]));
    if (!anyColor) EM.set(obj, ColorDef, ENDESGA16.lightGray);

    lastX = x + halfsize * scale;
  }

  const { renderer, sg_meshes } = await EM.whenResources(
    RendererDef,
    shadingGameMeshesDef
  );
  // console.log("XY._allMeshRegistrations");
  // console.dir(XY._allMeshRegistrations);
  // let i = 0;
  await XY._loadMeshSet(XY._allMeshRegistrations, renderer.renderer);
  for (let meshOrList of XY._loadedMeshes.values()) {
    // console.log("meshOrList");
    // console.dir(meshOrList);

    if (Array.isArray(meshOrList)) {
      const meshes = meshOrList;
      meshes.forEach(presentGameMesh);
    } else {
      const mesh = meshOrList;
      presentGameMesh(mesh);
    }

    // TODO(@darzu): dbging
    // i++;
    // if (i > 10) break;
  }
}
