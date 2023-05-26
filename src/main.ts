import { test } from "./utils/test.js";
import { setupObjImportExporter } from "./meshes/mesh-normalizer.js";
import { EM } from "./ecs/entity-manager.js";
import { tick } from "./time/time.js";
import { InputsDef, registerInputsSystem } from "./input/inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debug/debugger.js";
import { DevConsoleDef } from "./debug/console.js";
import { initReboundSandbox } from "./physics/game-rebound.js";
// import { callClothSystems } from "./game/cloth.js";
import { registerCommonSystems } from "./game-init.js";
import { setSimulationAlpha } from "./render/renderer-ecs.js";
import { never } from "./utils/util.js";
// import { initHyperspaceGame } from "./game/game-hyperspace.js";
import {
  DBG_ASSERT,
  ENABLE_NET,
  VERBOSE_LOG,
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
import { initShadingGame } from "./render/game-shading.js";
import { initModelingGame } from "./meshes/game-modeling.js";
import { Phase } from "./ecs/sys-phase";

export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const AUTOSTART = true;

const ALL_GAMES = [
  "gjk",
  "rebound", // broken-ish
  "shipyard",
  "grass",
  "font",
  "hyperspace",
  "cloth", // broken-ish
  "cube",
  "shading",
  "modeling",
  "ld53",
] as const;
const GAME: (typeof ALL_GAMES)[number] = "ld53";

// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;

// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 1;
// TODO(@darzu): PERF ISSUES WITH LD51
// const MAX_SIM_LOOPS = 3;

export let gameStarted = false;

function legacyRequireAllTheSystems() {
  // TODO(@darzu): calling systems still needs more massaging.
  //    - uncalled systems maybe should give a warning? Or at least a one-time read out.
  //    - Lets use types for this. String matching the name is brittle and unnessessary
  // EM.addSystem("inputs", Phase.READ_INPUTS);
  // EM.addSystem("mouseDrag", Phase.GAME_PLAYERS);
  if (ENABLE_NET) {
    // EM.addSystem("getStatsFromNet", Phase.NETWORK);
    // EM.addSystem("getEventsFromNet", Phase.NETWORK);
    // EM.addSystem("sendEventsToNet", Phase.NETWORK);
  }
  // EM.addSystem("canvasCursorLockUnlock", Phase.GAME_PLAYERS);
  // EM.addSystem("uiText", Phase.RENDER);
  // EM.addSystem("devConsoleToggle", Phase.GAME_PLAYERS);
  // EM.addSystem("devConsole", Phase.RENDER);
  if (GAME === "hyperspace") {
    // EM.addSystem("restartTimer", Phase.GAME_WORLD);
  }
  // EM.callSystem("updateScore");
  // EM.addSystem("renderInit", Phase.PRE_RENDER);
  // EM.addSystem("musicStart", Phase.AUDIO);
  if (ENABLE_NET) {
    // EM.addSystem("handleNetworkEvents", Phase.NETWORK);
    // EM.addSystem("recordPreviousLocations", Phase.NETWORK);
    // EM.addSystem("clearRemoteUpdatesMarker", Phase.NETWORK);
    // EM.addSystem("netUpdate", Phase.NETWORK);
    // EM.addSystem("predict", Phase.NETWORK);
    // EM.addSystem("connectToServer", Phase.NETWORK);
    // EM.addSystem("handleJoin", Phase.NETWORK);
    // EM.addSystem("handleJoinResponse", Phase.NETWORK);
  }
  // EM.addSystem("buildBullets", Phase.GAME_WORLD);
  // EM.addSystem("buildCursor", Phase.PRE_GAME_WORLD);
  // EM.addSystem("placeCursorAtScreenCenter", Phase.PRE_READ_INPUT);
  if (GAME === "hyperspace") {
    // EM.addSystem("stepEnemyShips", Phase.GAME_WORLD);
    // EM.addSystem("enemyShipsFire", Phase.GAME_WORLD);
    // EM.addSystem("breakEnemyShips", Phase.GAME_WORLD);
  }
  // EM.addSystem("controllableInput", Phase.GAME_PLAYERS);
  // EM.addSystem("controllableCameraFollow", Phase.POST_GAME_PLAYERS);
  // EM.addSystem("buildHsPlayers", Phase.PRE_GAME_WORLD);
  // EM.addSystem("hsPlayerFacingDir", Phase.GAME_PLAYERS);
  // EM.addSystem("stepHsPlayers", Phase.GAME_PLAYERS);
  if (GAME === "hyperspace") {
    // EM.addSystem("hsPlayerLookingForShip", Phase.GAME_WORLD);
  }
  if (GAME === "rebound") {
    // EM.addSystem("sandboxSpawnBoxes", Phase.GAME_WORLD);
  }
  if (GAME === "cloth") {
    // EM.addSystem("clothSandbox", Phase.GAME_WORLD);
  }
  if (GAME === "hyperspace") {
    // EM.addSystem("startGame", Phase.GAME_WORLD);
    // EM.addSystem("shipHealthCheck", Phase.GAME_WORLD);
    // EM.addSystem("easeRudder", Phase.GAME_WORLD);
    // EM.addSystem("shipMove", Phase.GAME_WORLD);
    // EM.addSystem("playerShipMove", Phase.GAME_PLAYERS);
    // EM.addSystem("shipUpdateParty", Phase.GAME_WORLD);
    // EM.callSystem("shipScore");
    // EM.addSystem("enemyShipPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("cannonPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("gemPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("rudderPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("mastPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("hsShipPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("darkStarPropsBuild", Phase.PRE_GAME_WORLD);
    // EM.addSystem("darkStarOrbit", Phase.GAME_WORLD);
    // EM.addSystem("hyperspaceGame", Phase.GAME_WORLD);
    // EM.callSystem("runOcean");
    // EM.addSystem("oceanUVtoPos", Phase.GAME_WORLD);
    // EM.addSystem("oceanUVDirToRot", Phase.GAME_WORLD);
    // EM.addSystem("debugLoop", Phase.GAME_WORLD);
    // EM.callSystem("initWooden");
    // EM.addSystem("runWooden", Phase.GAME_WORLD);
  }
  // EM.addSystem("updateBullets", Phase.GAME_WORLD);
  // EM.addSystem("applyGravity", Phase.PRE_PHYSICS);
  // EM.addSystem("updateParametricMotion", Phase.PRE_PHYSICS);
  if (GAME === "hyperspace") {
    // TODO(@darzu): noodles broken?
    // EM.addSystem("updateNoodles", Phase.GAME_WORLD);
  }
  // EM.addSystem("updateLifetimes", Phase.PRE_GAME_WORLD);
  // EM.addSystem("interactableInteract", Phase.POST_GAME_PLAYERS);
  // EM.addSystem("turretAim", Phase.GAME_PLAYERS);
  // EM.addSystem("turretYawPitch", Phase.GAME_PLAYERS);
  // EM.addSystem("turretManUnman", Phase.GAME_PLAYERS);
  if (GAME === "hyperspace") {
    // EM.addSystem("updateMastBoom", Phase.GAME_PLAYERS);
    // EM.addSystem("sail", Phase.GAME_PLAYERS);
    // EM.addSystem("orreryMotion", Phase.GAME_WORLD);
  }
  // EM.addSystem("reloadCannon", Phase.GAME_WORLD);
  // EM.addSystem("playerControlCannon", Phase.GAME_PLAYERS);
  // EM.addSystem("playerManCanon", Phase.GAME_PLAYERS);
  if (GAME === "hyperspace") {
    // EM.addSystem("spawnOnTile", Phase.GAME_WORLD);
    // EM.addSystem("spawnFinishAnimIn", Phase.GAME_WORLD);
  }
  // EM.addSystem("ensureFillOutLocalFrame", Phase.PRE_PHYSICS);
  // EM.addSystem("ensureWorldFrame", Phase.PRE_PHYSICS);
  // EM.callSystem("physicsDeadStuff");
  // EM.addSystem("physicsInit", Phase.PRE_PHYSICS);
  // EM.addSystem("clampVelocityByContact", Phase.PRE_PHYSICS);
  // EM.addSystem("registerPhysicsClampVelocityBySize", Phase.PRE_PHYSICS);
  // EM.addSystem("registerPhysicsApplyLinearVelocity", Phase.PRE_PHYSICS);
  // EM.addSystem("physicsApplyAngularVelocity", Phase.PRE_PHYSICS);
  if (GAME === "gjk") {
    // TODO(@darzu): Doug, we should talk about this. It is only registered after a one-shot
    // EM.addSystem("checkGJK", Phase.GAME_WORLD);
  }

  // TODO(@darzu): HACK. we need to think better how to let different areas, like a sandbox game, register systems
  //    to be called in a less cumbersome way than adding text and guards in here.
  // for (let sys of gameplaySystems) EM.requireSystem(sys);

  // EM.addSystem("updateLocalFromPosRotScale", Phase.PHYSICS);
  // EM.addSystem("updateWorldFromLocalAndParent", Phase.PHYSICS);
  // EM.addSystem("registerUpdateWorldAABBs", Phase.PHYSICS);
  // EM.addSystem("updatePhysInContact", Phase.PHYSICS);
  // EM.addSystem("physicsStepContact", Phase.PHYSICS);
  // EM.addSystem("updateWorldFromLocalAndParent2", Phase.PHYSICS);

  // EM.addSystem("dbgColliderMeshes", Phase.POST_PHYSICS);
  // EM.addSystem("debugMeshes", Phase.POST_PHYSICS);
  // EM.addSystem("debugMeshTransform", Phase.POST_PHYSICS);

  // EM.addSystem("bulletCollision", Phase.GAME_WORLD);

  // EM.addSystem("spring", Phase.PHYSICS);

  // EM.addSystem("buildCloths", Phase.PHYSICS);
  // EM.addSystem("updateClothMesh", Phase.PHYSICS);

  // EM.addSystem("modelerOnOff", Phase.GAME_PLAYERS);
  // EM.addSystem("modelerClicks", Phase.GAME_PLAYERS);
  // EM.addSystem("aabbBuilder", Phase.GAME_PLAYERS);
  if (GAME === "hyperspace") {
    // TODO(@darzu): these r a bit wierd
    // EM.addSystem("toolPickup", Phase.POST_GAME_PLAYERS);
    // EM.addSystem("toolDrop", Phase.POST_GAME_PLAYERS);
  }
  // EM.addSystem("animateTo", Phase.PRE_PHYSICS);

  if (ENABLE_NET) {
    // EM.addSystem("netDebugSystem", Phase.NETWORK);
    // EM.addSystem("netAck", Phase.NETWORK);
    // EM.addSystem("netSync", Phase.NETWORK);
    // EM.addSystem("sendOutboxes", Phase.NETWORK);
  }

  // EM.addSystem("detectedEventsToHost", Phase.NETWORK);
  // EM.addSystem("handleEventRequests", Phase.NETWORK);
  // EM.addSystem("handleEventRequestAcks", Phase.NETWORK);
  // EM.addSystem("detectedEventsToRequestedEvents", Phase.NETWORK);
  // EM.addSystem("requestedEventsToEvents", Phase.NETWORK);
  // EM.addSystem("sendEvents", Phase.NETWORK);
  // EM.addSystem("handleEvents", Phase.NETWORK);
  // EM.addSystem("handleEventAcks", Phase.NETWORK);

  // EM.addSystem("runEvents", Phase.NETWORK);

  // EM.addSystem("delete", Phase.PRE_GAME_WORLD);

  // EM.addSystem("smoothMotion", Phase.PRE_RENDER);
  // EM.addSystem("updateMotionSmoothing", Phase.PRE_RENDER);
  // EM.addSystem("updateSmoothedWorldFrames", Phase.PRE_RENDER);

  // EM.addSystem("smoothCamera", Phase.PRE_RENDER);

  // EM.addSystem("cameraFollowTarget", Phase.RENDER);
  // EM.addSystem("retargetCamera", Phase.RENDER);
  // EM.addSystem("renderModeToggles", Phase.GAME_PLAYERS);
  // EM.addSystem("constructRenderables", Phase.PRE_GAME_WORLD);

  // TODO(@darzu): we want to make it easier to satisfy this
  if (WARN_DEAD_CLEANUP) {
    // EM.addSystem("deadCleanupWarning", Phase.POST_GAME_WORLD); // SHOULD BE LAST(-ish); warns if cleanup is missing
  }
}

function callFixedTimestepSystems() {
  EM.callSystems();
  EM.checkEntityPromises();
  EM.dbgLoops++;
}

async function startGame(localPeerName: string, host: string | null) {
  if (gameStarted) return;
  gameStarted = true;

  let hosting = host === null;

  let start_of_time = performance.now();

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
    EM.addResource(JoinDef, host!);
  }

  registerCommonSystems(EM);

  addEventComponents(EM);

  registerInputsSystem(EM);

  if (GAME === "gjk") initGJKSandbox(EM, hosting);
  else if (GAME === "rebound") initReboundSandbox(EM, hosting);
  else if (GAME === "cloth") initClothSandbox(EM, hosting);
  else if (GAME === "hyperspace") initHyperspaceGame(EM);
  else if (GAME === "cube") initCubeGame(EM);
  else if (GAME === "shipyard") initShipyardGame(EM, hosting);
  else if (GAME === "font") initFontEditor(EM);
  else if (GAME === "grass") initGrassGame(EM, hosting);
  else if (GAME === "ld53") initLD53(EM, hosting);
  else if (GAME === "shading") initShadingGame();
  else if (GAME === "modeling") initModelingGame();
  else never(GAME, "TODO game");

  legacyRequireAllTheSystems();

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
      tick(EM, TIMESTEP);
      resetTempMatrixBuffer();
      callFixedTimestepSystems();
      loops++;
    }
    setSimulationAlpha(accumulator / TIMESTEP);
    // // EM.addSystem("updateRendererWorldFrames", Phase.RENDER);
    // // EM.addSystem("updateCameraView", Phase.RENDER);
    {
      // NOTE: these 3 must stay together in this order. See NOTE above renderListDeadHidden
      // EM.requireSystem("renderListDeadHidden");
      // EM.requireSystem("renderList");
      // EM.requireSystem("stepRenderer");
    }
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
  const queryString = Object.fromEntries(
    new URLSearchParams(window.location.search).entries()
  );
  const urlServerId = queryString["server"] ?? null;

  // const peerName = getPeerName(queryString);
  const peerName = "myPeerName";

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

test();

// dom dependant stuff
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
