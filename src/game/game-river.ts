import { CameraDef } from "../camera.js";
import { DevConsoleDef } from "../console.js";
import { EM, EntityManager } from "../entity-manager.js";
import { MeDef } from "../net/components.js";
import { PositionDef } from "../physics/transform.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipeline } from "../render/pipelines/std-shadow.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "./assets.js";
import { GameStateDef, GameState } from "./gamestate.js";
import { initRiverTileSystem as initRiverTileSystem } from "./river-tile.js";
import { createPlayer } from "./player.js";
import { createShip, ShipLocalDef } from "./ship.js";
import { TextDef } from "./ui.js";

export const ScoreDef = EM.defineComponent("score", () => {
  return {
    maxScore: 0,
    currentScore: 0,
  };
});

function registerScoreSystems(em: EntityManager) {
  em.addSingletonComponent(ScoreDef);

  em.registerSystem(
    [ShipLocalDef, PositionDef],
    [ScoreDef, GameStateDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      if (ships.length) {
        const ship = ships.reduce(
          (p, n) => (n.position[2] > p.position[2] ? n : p),
          ships[0]
        );
        const currentScore = Math.round(ship.position[2] / 10);
        res.score.maxScore = Math.max(currentScore, res.score.maxScore);
        res.score.currentScore = currentScore;
      }
    },
    "updateScore"
  );
}

function registerRiverGameSystems() {
  registerScoreSystems(EM);
}

function registerRiverGameUI(em: EntityManager) {
  em.registerSystem(
    null,
    [TextDef, DevConsoleDef],
    (_, res) => {
      const avgFPS = 1000 / res.dev.avgFrameTime;
      const lowerTxt = `Belgus, you are the last hope of the Squindles, keep the gemheart alive! Failure is inevitable. move: WASD, mouse; cannon: e, left-click; fps:${avgFPS.toFixed(
        1
      )}`;
      res.text.lowerText = lowerTxt;
    },
    "shipUI"
  );
}

export async function initRiverGame(em: EntityManager, hosting: boolean) {
  registerRiverGameUI(em);
  EM.addSingletonComponent(CameraDef);
  EM.addSingletonComponent(GameStateDef);

  initRiverTileSystem(em);

  if (hosting) {
    createShip();
  }

  // create player once MeDef is present (meaning we've joined, if
  // we're not the host)
  em.whenResources([MeDef]).then(() => createPlayer(em));

  const res = await em.whenResources([RendererDef]);
  res.renderer.pipelines = [
    shadowPipeline,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];
}

function debugBoatParts(em: EntityManager) {
  let once = false;
  em.registerSystem(
    [],
    [AssetsDef],
    (_, res) => {
      if (once) return;
      once = true;

      // TODO(@darzu): this works!
      // const bigM = res.assets.boat_broken;
      // for (let i = 0; i < bigM.length; i++) {
      //   const e = em.newEntity();
      //   em.ensureComponentOn(e, RenderableConstructDef, bigM[i].mesh);
      //   em.ensureComponentOn(e, PositionDef, [0, 0, 0]);
      // }
    },
    "debugBoatParts"
  );
}
