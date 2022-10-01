import { CameraDef } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { EM, EntityManager } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import {
  createAABB,
  emptyLine,
  copyAABB,
  transformAABB,
  Sphere,
  copyLine,
  transformLine,
  lineSphereIntersections,
} from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, normalizeMesh, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
  RenderDataStdDef,
} from "../render/renderer-ecs.js";
import { tempMat4 } from "../temp-pool.js";
import { assert } from "../test.js";
import { randomizeMeshColors, drawLine2 } from "../utils-game.js";
import {
  createWoodHealth,
  SplinterParticleDef,
  WoodAssetsDef,
  woodColor,
  WoodHealthDef,
  WoodStateDef,
} from "../wood.js";
import { yawpitchToQuat } from "../yawpitch.js";
import {
  AssetsDef,
  mkTimberSplinterEnd,
  mkTimberSplinterFree,
} from "./assets.js";
import { fireBullet } from "./bullet.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { createGhost } from "./game-sandbox.js";
import { GravityDef } from "./gravity.js";

// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const sandboxSystems: string[] = [];

export async function initLD51Game(em: EntityManager, hosting: boolean) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  const res = await em.whenResources(
    AssetsDef,
    WoodAssetsDef,
    GlobalCursor3dDef,
    RendererDef
  );

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

  const ghost = createGhost(em);

  vec3.copy(ghost.position, [0, 1, -1.2]);
  quat.setAxisAngle(ghost.rotation, [0.0, -1.0, 0.0], 1.62);
  // setCameraFollowPosition(g, "thirdPerson");
  ghost.cameraFollow.positionOffset = [0, 0, 5];
  // g.controllable.modes.canYaw = false;
  // g.controllable.modes.canCameraYaw = true;
  // g.controllable.modes.canPitch = true;
  ghost.controllable.speed *= 0.5;
  ghost.controllable.sprintMul = 10;

  const c = res.globalCursor3d.cursor()!;
  if (RenderableDef.isOn(c)) c.renderable.enabled = false;

  const ground = em.newEntity();
  const groundMesh = cloneMesh(res.assets.hex.mesh);
  transformMesh(
    groundMesh,
    mat4.fromRotationTranslationScale(
      tempMat4(),
      quat.IDENTITY,
      [0, -2, 0],
      [20, 2, 20]
    )
  );
  em.ensureComponentOn(ground, RenderableConstructDef, groundMesh);
  em.ensureComponentOn(ground, ColorDef, [0.1, 0.1, 0.4]);
  // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(ground, PositionDef, [0, 0, 0]);
  // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);

  // const cube = em.newEntity();
  // const cubeMesh = cloneMesh(res.assets.cube.mesh);
  // em.ensureComponentOn(cube, RenderableConstructDef, cubeMesh);
  // em.ensureComponentOn(cube, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(cube, PositionDef, [0, 0, 3]);
  // em.ensureComponentOn(cube, RotationDef);
  // em.ensureComponentOn(cube, AngularVelocityDef, [0, 0.001, 0.001]);
  // em.ensureComponentOn(cube, WorldFrameDef);
  // em.ensureComponentOn(cube, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.cube.aabb,
  // });

  // em.ensureComponentOn(b1, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  // TODO(@darzu): timber system here!
  const sphereMesh = cloneMesh(res.assets.ball.mesh);
  const visible = false;
  em.ensureComponentOn(ghost, RenderableConstructDef, sphereMesh, visible);
  em.ensureComponentOn(ghost, ColorDef, [0.1, 0.1, 0.1]);
  em.ensureComponentOn(ghost, PositionDef, [0, 0, 0]);
  // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
  em.ensureComponentOn(ghost, WorldFrameDef);
  // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
  em.ensureComponentOn(ghost, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.ball.aabb,
  });
  // randomizeMeshColors(b2);

  // em.ensureComponentOn(b2, ColliderDef, {
  //   shape: "Box",
  //   solid: false,
  //   center: res.assets.cube.center,
  //   halfsize: res.assets.cube.halfsize,
  // });

  const timber = em.newEntity();
  const timberMesh = cloneMesh(res.assets.timber_rib.mesh);
  const timberState = res.woodAssets.timber_rib!;
  em.ensureComponentOn(timber, RenderableConstructDef, timberMesh);
  em.ensureComponentOn(timber, WoodStateDef, timberState);
  em.ensureComponentOn(timber, ColorDef, vec3.clone(woodColor));
  // em.ensureComponentOn(timber, ColorDef, [0.1, 0.1, 0.1]);
  const timberPos = vec3.clone(res.assets.timber_rib.center);
  vec3.negate(timberPos, timberPos);
  timberPos[1] += 5;
  em.ensureComponentOn(timber, PositionDef, timberPos);
  // em.ensureComponentOn(timber, PositionDef, [0, 0, -4]);
  em.ensureComponentOn(timber, RotationDef);
  em.ensureComponentOn(timber, WorldFrameDef);
  em.ensureComponentOn(timber, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.assets.timber_rib.aabb,
  });
  const timberHealth = createWoodHealth(timberState);
  em.ensureComponentOn(timber, WoodHealthDef, timberHealth);
  // randomizeMeshColors(timber);
  // const board = timberState.boards[0];
  // const timber2 = await em.whenEntityHas(timber, RenderableDef);

  // const tetra = em.newEntity();
  // const tetraMesh = cloneMesh(res.assets.tetra.mesh);
  // em.ensureComponentOn(tetra, RenderableConstructDef, tetraMesh);
  // em.ensureComponentOn(tetra, ColorDef, [0.1, 0.1, 0.1]);
  // em.ensureComponentOn(tetra, PositionDef, [0, -3, 0]);
  // em.ensureComponentOn(tetra, RotationDef);
  // em.ensureComponentOn(tetra, WorldFrameDef);
  // em.ensureComponentOn(tetra, ColliderDef, {
  //   shape: "AABB",
  //   solid: false,
  //   aabb: res.assets.tetra.aabb,
  // });

  // for (let xi = 0; xi < 0; xi += 2) {
  //   for (let yi = 0; yi < 0; yi += 2) {
  //     // TODO(@darzu): dbging splinters
  //     const splinter = em.newEntity();
  //     // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  //     const _splinterMesh =
  //       // yi < 5 ? mkTimberSplinterEnd() : mkTimberSplinterFree();
  //       // mkTimberSplinterFree(0.2 + xi * 0.2, 0.2 + yi * 0.2);
  //       mkTimberSplinterFree(1, 1, 1);
  //     const splinterMesh = normalizeMesh(_splinterMesh);
  //     em.ensureComponentOn(splinter, RenderableConstructDef, splinterMesh);
  //     em.ensureComponentOn(splinter, ColorDef, [
  //       Math.random(),
  //       Math.random(),
  //       Math.random(),
  //     ]);
  //     // em.ensureComponentOn(splinter, ColorDef, [0.1, 0.1, 0.1]);
  //     em.ensureComponentOn(splinter, PositionDef, [xi * 2 + 4, 0, yi * 2]);
  //     em.ensureComponentOn(splinter, RotationDef);
  //     em.ensureComponentOn(splinter, WorldFrameDef);
  //     em.ensureComponentOn(splinter, ColliderDef, {
  //       shape: "AABB",
  //       solid: false,
  //       aabb: res.assets.timber_splinter.aabb,
  //     });
  //     // randomizeMeshColors(splinter);
  //   }
  // }

  const splinterObjId = 7654;
  em.registerSystem(
    [
      SplinterParticleDef,
      LinearVelocityDef,
      AngularVelocityDef,
      GravityDef,
      PositionDef,
      RotationDef,
      RenderDataStdDef,
    ],
    [],
    (splinters, res) => {
      for (let s of splinters) {
        if (s.position[1] <= 0) {
          em.removeComponent(s.id, LinearVelocityDef);
          em.removeComponent(s.id, GravityDef);
          em.removeComponent(s.id, AngularVelocityDef);

          s.position[1] = 0;
          quat.identity(s.rotation);
          quat.rotateX(s.rotation, s.rotation, Math.PI * 0.5);
          quat.rotateZ(s.rotation, s.rotation, Math.PI * Math.random());
          s.renderDataStd.id = splinterObjId; // stops z-fighting
          // console.log("freeze!");
        }
      }
    },
    "splintersOnFloor"
  );
  sandboxSystems.push("splintersOnFloor");

  const quadIdsNeedReset = new Set<number>();

  assert(ghost?.collider.shape === "AABB");
  // console.dir(ghost.collider.aabb);

  em.registerSystem(
    null,
    [InputsDef],
    (_, { inputs }) => {
      const ballAABBWorld = createAABB();
      const segAABBWorld = createAABB();
      const worldLine = emptyLine();

      assert(ghost?.collider.shape === "AABB");
      copyAABB(ballAABBWorld, ghost.collider.aabb);
      transformAABB(ballAABBWorld, ghost.world.transform);
      // TODO(@darzu): this sphere should live elsewhere..
      const worldSphere: Sphere = {
        org: ghost.world.position,
        rad: 1,
        // rad: (ballAABBWorld.max[0] - ballAABBWorld.min[0]) * 0.5,
      };

      if (inputs.lclick) {
        // TODO(@darzu): fire?
        console.log(`fire!`);
        const firePos = worldSphere.org;
        const fireDir = quat.create();
        quat.copy(fireDir, ghost.world.rotation);
        fireBullet(em, 1, firePos, fireDir, 0.05, 0.02, 3);
      }
    },
    "runLD51Timber"
  );
  sandboxSystems.push("runLD51Timber");
}
