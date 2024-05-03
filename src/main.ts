import { test } from "./utils/test.js";
import { setupObjImportExporter } from "./meshes/mesh-normalizer.js";
import { EM } from "./ecs/ecs.js";
import { tick } from "./time/time.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debug/debugger.js";
import { DevConsoleDef } from "./debug/console.js";
import { initReboundSandbox } from "./physics/game-rebound.js";
import { never } from "./utils/util-no-import.js";
import { VERBOSE_LOG, VERBOSE_NET_LOG } from "./flags.js";
import { initShipyardGame } from "./wood/game-shipyard.js";
import { initFontEditor } from "./gui/game-font.js";
import { initGJKSandbox } from "./physics/game-gjk.js";
import { initHyperspaceGame } from "./hyperspace/game-hyperspace.js";
import { initClothSandbox } from "./cloth/game-cloth.js";
import { initCubeGame } from "./debug/xp-cube.js";
import { resetTempMatrixBuffer } from "./matrix/sprig-matrix.js";
import { initGrassGame } from "./grass/game-grass.js";
import { initLD53 } from "./ld53/game-ld53.js";
import { initGalleryGame } from "./render/game-gallery.js";
import { initModelingGame } from "./meshes/game-modeling.js";
import { setSimulationAlpha } from "./render/motion-smoothing.js";
import { initMPGame } from "./net/game-multiplayer.js";
import { initLD54 } from "./ld54/game-ld54.js";
import { initGrayboxSunless } from "./graybox/graybox-sunless-skies.js";
import { initGrayboxShipArena } from "./graybox/graybox-ship-arena.js";
import { initGrayboxStarter } from "./graybox/graybox-starter.js";
import { initPainterlyGame } from "./graybox/game-painterly.js";
import { initCardsGame } from "./gui/game-cards.js";
import { initGameParticles } from "./graybox/game-particles.js";
import { initLd55 } from "./ld55/game-ld55.js";
import { initMultiSceneGame } from "./graybox/game-multi-scene.js";
import { objMap } from "./utils/util.js";
import { startNet } from "./net/net-main.js";
import { initDbgViewModes } from "./debug/view-modes.js";
import { initPhysicsSystems } from "./physics/phys.js";

// dbgLogMilestone("start of main.ts");

export const GAME_INIT = objMap(
  {
    gjk: initGJKSandbox,
    rebound: initReboundSandbox,
    shipyard: initShipyardGame,
    // broken-ish; too many temp f32s; port to Z-up
    grass: initGrassGame,
    font: initFontEditor,
    cards: initCardsGame,
    // TODO(@darzu): Z_UP: port to Z-up
    hyperspace: initHyperspaceGame,
    // broken-ish
    cloth: initClothSandbox,
    cube: initCubeGame,
    gallery: initGalleryGame,
    modeling: initModelingGame,
    ld53: initLD53,
    ld54: initLD54,
    mp: initMPGame,
    "graybox-starter": initGrayboxStarter,
    "graybox-sunless": initGrayboxSunless,
    "graybox-ship-arena": initGrayboxShipArena,
    painterly: initPainterlyGame,
    particles: initGameParticles,
    ld55: initLd55,
    "multi-scene": initMultiSceneGame,
  },
  (val, key) => {
    return val as () => void;
  }
);
export const GAME_NAMES = Object.keys(GAME_INIT);

// TODO(@darzu): current game should probably be saved in local storage, not hard-coded. (Default can be hard-coded)
// prettier-ignore
const GAME: keyof typeof GAME_INIT = (
  // "painterly"
  // "graybox-ship-arena"
  // "ld53"
  "ld54"
  // "gjk"
  // "graybox-starter"
  // "font"
  // "cards"
  // "particles"
  // "ld55"
  // "multi-scene"
);

// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;

// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 1;
// TODO(@darzu): PERF ISSUES WITH LD51
// const MAX_SIM_LOOPS = 3;

export let gameStarted = false;

async function main() {
  let start_of_time = performance.now();

  // dbgLogMilestone("main()");

  startNet();

  // dbgLogMilestone("startGame()");

  if (gameStarted) return;
  gameStarted = true;

  // TODO(@darzu): move elsewhere
  EM.setDefaultRange("local");
  EM.setIdRange("local", 1, 10000);

  // TODO(@darzu): move elsewhere!
  initPhysicsSystems();
  initDbgViewModes();

  resetTempMatrixBuffer(`initGame ${GAME}`);

  const gameInitFn = GAME_INIT[GAME];
  gameInitFn();

  let previous_frame_time = start_of_time;
  let accumulator = 0;
  let frame = (frame_time: number) => {
    // console.log(`requestAnimationFrame: ${frame_time}`);
    let before_frame = performance.now();
    accumulator += frame_time - previous_frame_time;
    let loops = 0;
    while (accumulator > TIMESTEP) {
      if (loops >= MAX_SIM_LOOPS) {
        if (VERBOSE_LOG)
          console.log("too many sim loops, resetting accumulator");
        accumulator = 0;
        break;
      }
      accumulator -= TIMESTEP;
      tick(TIMESTEP);
      resetTempMatrixBuffer(`frame_${loops}`);
      // TODO(@darzu): Update vs FixedUpdate
      EM.update();
      loops++;
    }
    setSimulationAlpha(accumulator / TIMESTEP);

    let jsTime = performance.now() - before_frame;
    let frameTime = frame_time - previous_frame_time;
    previous_frame_time = frame_time;

    const devStats = EM.getResource(DevConsoleDef);
    if (devStats) {
      devStats.updateAvgs(jsTime, frameTime, jsTime);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

// TODO(@darzu): move elsewhere
test();

// dom dependant stuff
// TODO(@darzu): move to resource
window.onload = () => {
  setupObjImportExporter();
};

(async () => {
  // TODO(@darzu): work around for lack of top-level await in Safari
  try {
    await main();
  } catch (e) {
    console.error(e);
  }
})();

// for debugging
(globalThis as any).dbg = dbg;
(globalThis as any).EM = EM;
(globalThis as any).GAME = GAME;

// dbgLogMilestone("end of main.ts");
