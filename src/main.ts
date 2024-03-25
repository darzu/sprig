import { test } from "./utils/test.js";
import { setupObjImportExporter } from "./meshes/mesh-normalizer.js";
import { EM } from "./ecs/entity-manager.js";
import { tick } from "./time/time.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debug/debugger.js";
import { DevConsoleDef } from "./debug/console.js";
import { initReboundSandbox } from "./physics/game-rebound.js";
// import { callClothSystems } from "./game/cloth.js";
import { initCommonSystems } from "./game-init.js";
import { dbgLogMilestone } from "./utils/util.js";
import { never } from "./utils/util-no-import.js";
// import { initHyperspaceGame } from "./game/game-hyperspace.js";
import {
  DBG_ASSERT,
  ENABLE_NET,
  VERBOSE_LOG,
  VERBOSE_NET_LOG,
  WARN_DEAD_CLEANUP,
} from "./flags.js";
import { initShipyardGame } from "./wood/game-shipyard.js";
import { gameplaySystems } from "./debug/ghost.js";
import { initFontEditor } from "./gui/game-font.js";
import { initGJKSandbox } from "./physics/game-gjk.js";
import { initHyperspaceGame } from "./hyperspace/game-hyperspace.js";
import { initClothSandbox } from "./cloth/game-cloth.js";
import { initCubeGame } from "./debug/xp-cube.js";
import { resetTempMatrixBuffer, V } from "./matrix/sprig-matrix.js";
import { initGrassGame } from "./grass/game-grass.js";
import { initLD53 } from "./ld53/game-ld53.js";
import { initGalleryGame } from "./render/game-gallery.js";
import { initModelingGame } from "./meshes/game-modeling.js";
import { Phase } from "./ecs/sys-phase.js";
import { setSimulationAlpha } from "./render/motion-smoothing.js";
import { initMPGame } from "./net/game-multiplayer.js";
import { initLD54 } from "./ld54/game-ld54.js";
import { initGrayboxSunless } from "./graybox/graybox-sunless-skies.js";
import { initGrayboxShipArena } from "./graybox/graybox-ship-arena.js";
import { initGrayboxStarter } from "./graybox/graybox-starter.js";
import { initPainterlyGame } from "./graybox/game-painterly.js";

// dbgLogMilestone("start of main.ts");

export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const AUTOSTART = true;

const ALL_GAMES = [
  "gjk",
  "rebound",
  "shipyard",
  "grass", // broken-ish; too many temp f32s; port to Z-up
  "font",
  "hyperspace", // TODO(@darzu): Z_UP: port to Z-up
  "cloth", // broken-ish
  "cube",
  "gallery",
  "modeling",
  "ld53",
  "ld54",
  "mp",
  "graybox-starter",
  "graybox-sunless",
  "graybox-ship-arena",
  "painterly",
] as const;

// TODO(@darzu): current game should probably be saved in local storage, not hard-coded. (Default can be hard-coded)
// prettier-ignore
const GAME: (typeof ALL_GAMES)[number] = (
  // "painterly"
  // "graybox-ship-arena"
  // "ld53"
  // "gjk"
  "graybox-starter"
);

// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;

// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 1;
// TODO(@darzu): PERF ISSUES WITH LD51
// const MAX_SIM_LOOPS = 3;

export let gameStarted = false;

function callFixedTimestepSystems() {
  EM.update();
}

async function startGame(localPeerName: string, host: string | null) {
  // dbgLogMilestone("startGame()");
  (globalThis as any).GAME = GAME;

  if (gameStarted) return;
  gameStarted = true;

  const hosting = !host;

  if (VERBOSE_NET_LOG) console.log(`hosting: ${hosting}`);

  let start_of_time = performance.now();

  // TODO(@darzu): move elsewhere
  EM.setDefaultRange("local");
  EM.setIdRange("local", 1, 10000);
  // TODO(@darzu): ECS stuff
  // init ECS
  EM.addResource(PeerNameDef, localPeerName);
  if (hosting) {
    // TODO(@darzu): ECS
    EM.setDefaultRange("net");
    EM.setIdRange("net", 10001, 20000);
    EM.addResource(MeDef, 0, true);
    EM.addResource(HostDef);
  } else {
    EM.addResource(JoinDef, host);
  }

  initCommonSystems(); // TODO(@darzu): move elsewhere!

  addEventComponents(); // TODO(@darzu): move elsewhere!

  resetTempMatrixBuffer(`initGame ${GAME}`);

  if (GAME === "gjk") initGJKSandbox();
  else if (GAME === "rebound") initReboundSandbox(hosting);
  else if (GAME === "cloth") initClothSandbox(hosting);
  else if (GAME === "hyperspace") initHyperspaceGame();
  else if (GAME === "cube") initCubeGame();
  else if (GAME === "shipyard") initShipyardGame(hosting);
  else if (GAME === "font") initFontEditor();
  else if (GAME === "grass") initGrassGame(hosting);
  else if (GAME === "ld53") initLD53(hosting);
  else if (GAME === "ld54") initLD54();
  else if (GAME === "gallery") initGalleryGame();
  else if (GAME === "modeling") initModelingGame();
  else if (GAME === "mp") initMPGame();
  else if (GAME === "graybox-starter") initGrayboxStarter();
  else if (GAME === "graybox-sunless") initGrayboxSunless();
  else if (GAME === "graybox-ship-arena") initGrayboxShipArena();
  else if (GAME === "painterly") initPainterlyGame();
  else never(GAME, "TODO game");

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
      callFixedTimestepSystems();
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

// TODO(@darzu): unused?
function getPeerName(queryString: { [k: string]: string }): string {
  const user = queryString["user"] || "default";
  let peerName = localStorage.getItem("peerName-" + user);
  if (!peerName) {
    // TODO: better random peer name generation, or get peer name from server
    const rand = crypto.getRandomValues(new Uint8Array(16));
    peerName = rand.join("");
    localStorage.setItem("peerName-" + user, peerName);
  }
  return peerName;
}

async function main() {
  // dbgLogMilestone("main()");
  const queryString = Object.fromEntries(
    new URLSearchParams(window.location.search).entries()
  );
  const urlServerId = queryString["server"] ?? null;

  // const peerName2 = getPeerName(queryString);
  // const peerName = "myPeerName";
  const peerName = !!urlServerId ? "mySprigClient" : "mySprigHost";

  let controls = document.getElementById("server-controls") as HTMLDivElement;
  let serverStartButton = document.getElementById(
    "server-start"
  ) as HTMLButtonElement;
  let connectButton = document.getElementById("connect") as HTMLButtonElement;
  let serverIdInput = document.getElementById("server-id") as HTMLInputElement;
  if (ENABLE_NET && !AUTOSTART && !urlServerId) {
    serverStartButton.onclick = () => {
      startGame(peerName, null);
      controls.hidden = true;
    };
    connectButton.onclick = () => {
      startGame(peerName, serverIdInput.value);
      controls.hidden = true;
    };
  } else {
    startGame(peerName, urlServerId);
    controls.hidden = true;
  }
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
(window as any).dbg = dbg;
(window as any).EM = EM;

// dbgLogMilestone("end of main.ts");
