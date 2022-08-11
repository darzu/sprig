import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager } from "../entity-manager.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { shadowPipeline } from "../render/pipelines/std-shadow.js";
import { initStars, renderStars } from "../render/pipelines/std-stars.js";
import { AssetsDef } from "./assets.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { createPlayer } from "./player.js";
import { createPlayerShip } from "./player-ship.js";
import { GameStateDef } from "./gamestate.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { DevConsoleDef } from "../console.js";
import { initOcean, OceanDef, oceanJfa, UVPosDef, UVDirDef } from "./ocean.js";
import { asyncTimeout } from "../util.js";
import { vec2, vec3 } from "../gl-matrix.js";
import { AnimateToDef, EASE_INQUAD } from "../animate-to.js";
import { createSpawner, SpawnerDef } from "./spawner.js";
import { tempVec3 } from "../temp-pool.js";

// export let jfaMaxStep = VISUALIZE_JFA ? 0 : 999;

export async function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  const ship = createPlayerShip([0.1, 0.1]);
  // }

  em.whenResources(MeDef, OceanDef).then(async () => {
    // await awaitTimeout(1000); // TODO(@darzu): what is happening
    createPlayer(em);
  });

  em.registerSystem(
    [],
    [],
    () => {
      // console.log("debugLoop");
      // em.whyIsntSystemBeingCalled("oceanGPUWork");
    },
    "debugLoop"
  );

  // const grid = [
  //   //
  //   [oceanJfa._inputMaskTex, oceanJfa._uvMaskTex],
  //   //
  //   [oceanJfa.voronoiTex, uvToPosTex],
  // ];
  // let grid = noiseGridFrame;
  // const grid = [[oceanJfa._voronoiTexs[0]], [oceanJfa._voronoiTexs[1]]];

  let gridCompose = createGridComposePipelines(oceanJfa._debugGrid);

  em.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        shadowPipeline,
        stdRenderPipeline,
        outlineRender,
        //renderStars,
        //...blurPipelines,

        postProcess,
        // ...(res.dev.showConsole ? gridCompose : []),
      ];
    },
    "hyperspaceGame"
  );

  const res = await em.whenResources(AssetsDef, RendererDef);

  // const ghost = createGhost(em);
  // em.ensureComponentOn(ghost, RenderableConstructDef, res.assets.cube.proto);
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

  initOcean();

  // TODO(@darzu): dbg
  //await asyncTimeout(2000);

  const { ocean, me } = await em.whenResources(OceanDef, MeDef);
  const ship2 = await em.whenEntityHas(ship, UVPosDef);

  const NUM_ENEMY = 40;

  for (let i = 0; i < NUM_ENEMY; i++) {
    let enemyUVPos: vec2 = [Math.random(), Math.random()];
    while (ocean.uvToEdgeDist(enemyUVPos) < 0.1) {
      enemyUVPos = [Math.random(), Math.random()];
    }

    const enemyEndPos = ocean.uvToPos(vec3.create(), enemyUVPos);
    // vec3.add(enemyEndPos, enemyEndPos, [0, 10, 0]);
    const enemyStartPos = vec3.sub(vec3.create(), enemyEndPos, [0, 20, 0]);

    const towardsPlayerDir = vec2.sub(vec2.create(), ship2.uvPos, enemyUVPos);
    vec2.normalize(towardsPlayerDir, towardsPlayerDir);

    // console.log("creating spawner");
    const enemySpawner = createSpawner(enemyUVPos, towardsPlayerDir, {
      startPos: enemyStartPos,
      endPos: enemyEndPos,
      durationMs: 1000,
      easeFn: EASE_INQUAD,
    });
  }

}
