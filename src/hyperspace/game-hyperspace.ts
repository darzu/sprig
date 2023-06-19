import { CameraDef } from "../camera/camera.js";
import { EM, EntityW, Resources } from "../ecs/entity-manager.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import {
  shadowDepthTextures,
  shadowPipelines,
} from "../render/pipelines/std-shadow.js";
import { initStars, renderStars } from "../render/pipelines/std-stars.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { createHsPlayer, registerHsPlayerSystems } from "./hs-player.js";
import { createHsShip, registerShipSystems } from "./hyperspace-ship.js";
import {
  HSGameStateDef,
  registerGameStateSystems,
} from "./hyperspace-gamestate.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { DevConsoleDef } from "../debug/console.js";
import {
  initOcean,
  OceanDef,
  oceanJfa,
  UVPosDef,
  UVDirDef,
  registerOceanUVFns,
} from "../ocean/ocean.js";
import { asyncTimeout } from "../utils/util.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AnimateToDef } from "../animation/animate-to.js";
import {
  createSpawner,
  registerUvSpawnSystems,
  SpawnerDef,
} from "./uv-spawner.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import {
  createDarkStarNow,
  registerDarkstarSystems,
  STAR1_COLOR,
  STAR2_COLOR,
} from "./darkstar.js";
import { renderOceanPipe } from "../render/pipelines/std-ocean.js";
import { EASE_INQUAD } from "../utils/util-ease.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
import { registerEnemyShipSystems } from "./uv-enemy-ship.js";
import { registerUVShipSystems } from "./uv-ship.js";
import { registerOrrerySystems } from "./orrery.js";
import { registerHypersailSystems } from "./hypersail.js";
import { registerRibSailSystems } from "./ribsail.js";

// export let jfaMaxStep = VISUALIZE_JFA ? 0 : 999;

function spawnRandomDarkStar(
  res: Resources<[typeof AllMeshesDef]>,
  approxPosition: vec3,
  color: vec3
) {
  const orbitalAxis = V(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  );
  vec3.normalize(orbitalAxis, orbitalAxis);

  vec3.normalize(orbitalAxis, orbitalAxis);

  // TODO: this only works because the darkstar is orbiting the origin
  const perpendicular = vec3.cross(approxPosition, orbitalAxis);
  const starPosition = vec3.cross(orbitalAxis, perpendicular, perpendicular);
  vec3.normalize(starPosition, starPosition);
  vec3.scale(starPosition, vec3.length(approxPosition), starPosition);

  return createDarkStarNow(res, starPosition, color, V(0, 0, 0), orbitalAxis);
}

export async function initHyperspaceGame() {
  EM.addResource(HSGameStateDef);

  registerGameStateSystems();
  registerEnemyShipSystems();
  registerHsPlayerSystems();
  registerUVShipSystems();
  registerOceanUVFns();
  registerShipSystems();
  registerDarkstarSystems();
  registerOrrerySystems();
  registerUvSpawnSystems();
  registerHypersailSystems();
  registerRibSailSystems();

  EM.whenResources(OceanDef).then(async () => {
    // await awaitTimeout(1000); // TODO(@darzu): what is happening
    createHsPlayer();
  });

  EM.addSystem("debugLoop", Phase.GAME_WORLD, [], [], () => {
    // console.log("debugLoop");
    // EM.whyIsntSystemBeingCalled("oceanGPUWork");
  });

  // const grid = [[...shadowDepthTextures]];
  const grid = [
    //
    [oceanJfa._inputMaskTex, oceanJfa._uvMaskTex],
    //
    [oceanJfa.voronoiTex, oceanJfa.sdfTex],
  ];
  // let grid = noiseGridFrame;
  // const grid = [[oceanJfa._voronoiTexs[0]], [oceanJfa._voronoiTexs[1]]];

  let gridCompose = createGridComposePipelines(grid);

  EM.addSystem(
    "hyperspaceGame",
    Phase.GAME_WORLD,
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        ...shadowPipelines,
        stdRenderPipeline,
        renderOceanPipe,
        outlineRender,
        deferredPipeline,
        // renderStars,
        // ...blurPipelines,
        postProcess,
        ...(res.dev.showConsole ? gridCompose : []),
      ];
    }
  );

  const res = await EM.whenResources(AllMeshesDef, RendererDef, CameraDef);

  res.camera.fov = Math.PI * 0.5;

  // const ghost = createGhost();
  // EM.ensureComponentOn(ghost, RenderableConstructDef, res.allMeshes.cube.proto);
  // ghost.controllable.speed *= 3;
  // ghost.controllable.sprintMul *= 3;

  {
    // // debug camera
    // vec3.copy(ghost.position, [-185.02, 66.25, -69.04]);
    // quat.copy(ghost.rotation, [0.0, -0.92, 0.0, 0.39]);
    // vec3.copy(ghost.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // ghost.cameraFollow.yawOffset = 0.0;
    // ghost.cameraFollow.pitchOffset = -0.465;
    // let g = ghost;
    // vec3.copy(g.position, [-208.43, 29.58, 80.05]);
    // quat.copy(g.rotation, [0.0, -0.61, 0.0, 0.79]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.486;
  }

  // one-time GPU jobs
  res.renderer.renderer.submitPipelines([], [...noisePipes, initStars]);

  initOcean(res.allMeshes.ocean.mesh, V(0.1, 0.3, 0.8));

  // TODO(@darzu): dbg
  //await asyncTimeout(2000);

  const { me, ocean } = await EM.whenResources(OceanDef, MeDef);

  if (me.host) {
    // experimental ship:
    const eShip = EM.new();
    EM.ensureComponentOn(
      eShip,
      RenderableConstructDef,
      res.allMeshes.ship_fangs.proto
    );
    EM.ensureComponentOn(eShip, PositionDef);
    EM.ensureComponentOn(eShip, UVPosDef, vec2.clone([0.2, 0.1]));

    const ship = createHsShip(vec2.clone([0.1, 0.1]));
    const ship2 = await EM.whenEntityHas(ship, UVPosDef);

    const NUM_ENEMY = 40;

    for (let i = 0; i < NUM_ENEMY; i++) {
      let enemyUVPos: vec2 = vec2.clone([Math.random(), Math.random()]);
      // TODO(@darzu): re-enable
      // while (ocean.uvToEdgeDist(enemyUVPos) < 0.1) {
      //   enemyUVPos = [Math.random(), Math.random()];
      // }

      // const enemyEndPos = ocean.uvToPos(vec3.create(), enemyUVPos);
      const enemyEndPos = vec3.create();
      ocean.uvToGerstnerDispAndNorm(enemyEndPos, tempVec3(), enemyUVPos);
      // vec3.add(enemyEndPos, enemyEndPos, [0, 10, 0]);
      const enemyStartPos = vec3.sub(enemyEndPos, [0, 20, 0], vec3.create());

      const towardsPlayerDir = vec2.sub(ship2.uvPos, enemyUVPos, vec2.create());
      vec2.normalize(towardsPlayerDir, towardsPlayerDir);

      // console.log("creating spawner");
      const enemySpawner = createSpawner(enemyUVPos, towardsPlayerDir, {
        startPos: enemyStartPos,
        endPos: enemyEndPos,
        durationMs: 1000,
        easeFn: EASE_INQUAD,
      });
    }
    const orbitalAxis = V(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
    vec3.normalize(orbitalAxis, orbitalAxis);

    // TODO: this only works because the darkstar is orbiting the origin
    const approxPosition = V(-1000, 2000, -1000);
    const perpendicular = vec3.cross(approxPosition, orbitalAxis);
    const starPosition = vec3.cross(orbitalAxis, perpendicular, perpendicular);
    vec3.normalize(starPosition, starPosition);
    vec3.scale(starPosition, vec3.length(approxPosition), starPosition);

    const star1 = spawnRandomDarkStar(
      res,
      V(-1000, 2000, -1000),
      STAR1_COLOR
      //V(0, 0, 0)
    );

    const star2 = spawnRandomDarkStar(res, V(0, 0, 2000), STAR2_COLOR);
  }
}
