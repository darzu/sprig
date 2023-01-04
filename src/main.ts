import { test } from "./test.js";
import { setupObjImportExporter } from "./download.js";
import { EM } from "./entity-manager.js";
import { tick } from "./time.js";
import { InputsDef, registerInputsSystem } from "./inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debugger.js";
import { DevConsoleDef } from "./console.js";
import { initReboundSandbox } from "./game/game-rebound.js";
// import { callClothSystems } from "./game/cloth.js";
import { registerCommonSystems } from "./game/game-init.js";
import { setSimulationAlpha } from "./render/renderer-ecs.js";
import { never } from "./util.js";
// import { initHyperspaceGame } from "./game/game-hyperspace.js";
import { DBG_ASSERT, VERBOSE_LOG } from "./flags.js";
import { initRogueGame } from "./game/game-rogue.js";
import { gameplaySystems } from "./game/game.js";
import { initFontEditor } from "./game/game-font.js";
import { initGJKSandbox } from "./game/game-gjk.js";
import { initHyperspaceGame } from "./game/game-hyperspace.js";
import { initClothSandbox } from "./game/game-cloth.js";
import { initCubeGame } from "./game/xp-cube.js";
import { callSpringSystems } from "./game/spring.js";
import { callClothSystems } from "./game/cloth.js";
import { resetTempMatrixBuffer } from "./sprig-matrix.js";

export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const ENABLE_NET = false;
const AUTOSTART = true;

const ALL_GAMES = [
  "gjk",
  "rebound", // broken-ish
  "ld51",
  "font",
  "hyperspace",
  "cloth", // broken-ish
  "cube",
] as const;
const GAME: typeof ALL_GAMES[number] = "ld51";

// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;

// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 1;
// TODO(@darzu): PERF ISSUES WITH LD51
// const MAX_SIM_LOOPS = 3;

export let gameStarted = false;

function callFixedTimestepSystems() {
  // TODO(@darzu): calling systems still needs more massaging.
  //    - uncalled systems maybe should give a warning? Or at least a one-time read out.
  //    - Lets use types for this. String matching the name is brittle and unnessessary
  EM.callSystem("inputs");
  EM.callSystem("mouseDrag");
  EM.callSystem("getStatsFromNet");
  EM.callSystem("getEventsFromNet");
  EM.callSystem("sendEventsToNet");
  EM.callSystem("canvas");
  EM.callSystem("uiText");
  EM.callSystem("devConsoleToggle");
  EM.callSystem("devConsole");
  if (GAME === "hyperspace") {
    EM.callSystem("restartTimer");
  }
  // EM.callSystem("updateScore");
  EM.callSystem("renderInit");
  EM.callSystem("musicStart");
  EM.callSystem("handleNetworkEvents");
  EM.callSystem("recordPreviousLocations");
  EM.callSystem("clearRemoteUpdatesMarker");
  EM.callSystem("netUpdate");
  EM.callSystem("predict");
  EM.callSystem("connectToServer");
  EM.callSystem("handleJoin");
  EM.callSystem("handleJoinResponse");
  EM.callSystem("buildBullets");
  EM.callSystem("buildCursor");
  EM.callSystem("placeCursorAtScreenCenter");
  if (GAME === "hyperspace") {
    EM.callSystem("stepEnemyShips");
    EM.callSystem("enemyShipsFire");
    EM.callSystem("breakEnemyShips");
  }
  EM.callSystem("controllableInput");
  EM.callSystem("controllableCameraFollow");
  EM.callSystem("buildPlayers");
  EM.callSystem("playerFacingDir");
  EM.callSystem("stepPlayers");
  if (GAME === "hyperspace") {
    EM.callSystem("playerLookingForShip");
  }
  if (GAME === "rebound") {
    EM.tryCallSystem("sandboxSpawnBoxes");
  }
  if (GAME === "cloth") {
    EM.tryCallSystem("clothSandbox");
  }
  if (GAME === "hyperspace") {
    EM.callSystem("startGame");
    EM.callSystem("shipHealthCheck");
    EM.callSystem("easeRudder");
    EM.callSystem("shipMove");
    EM.callSystem("playerShipMove");
    EM.callSystem("shipUpdateParty");
    // EM.callSystem("shipScore");
    EM.callSystem("enemyShipPropsBuild");
    EM.callSystem("cannonPropsBuild");
    EM.callSystem("gemPropsBuild");
    EM.callSystem("rudderPropsBuild");
    EM.callSystem("mastPropsBuild");
    EM.callSystem("playerShipPropsBuild");
    EM.callSystem("darkStarPropsBuild");
    EM.callSystem("darkStarOrbit");
    EM.callSystem("hyperspaceGame");
    // EM.callSystem("runOcean");
    EM.callSystem("oceanUVtoPos");
    EM.callSystem("oceanUVDirToRot");
    EM.callSystem("debugLoop");
    // EM.callSystem("initWooden");
    EM.callSystem("runWooden");
  }
  if (GAME === "ld51") {
    // EM.callSystem("initWooden");
    EM.callSystem("runWooden");
    EM.callSystem("woodHealth");
  }
  EM.callSystem("updateBullets");
  EM.callSystem("applyGravity");
  if (GAME === "hyperspace") {
    // TODO(@darzu): noodles broken?
    EM.callSystem("updateNoodles");
  }
  EM.callSystem("updateLifetimes");
  EM.callSystem("interaction");
  EM.callSystem("turretAim");
  EM.callSystem("turretYawPitch");
  EM.callSystem("turretManUnman");
  if (GAME === "hyperspace") {
    EM.callSystem("updateMastBoom");
    EM.callSystem("sail");
    EM.callSystem("orreryMotion");
  }
  EM.callSystem("reloadCannon");
  EM.callSystem("playerControlCannon");
  EM.callSystem("playerManCanon");
  if (GAME === "hyperspace") {
    EM.callSystem("spawnOnTile");
    EM.callSystem("spawnFinishAnimIn");
  }
  EM.callSystem("ensureFillOutLocalFrame");
  EM.callSystem("ensureWorldFrame");
  // EM.callSystem("physicsDeadStuff");
  EM.callSystem("physicsInit");
  EM.callSystem("clampVelocityByContact");
  EM.callSystem("registerPhysicsClampVelocityBySize");
  EM.callSystem("registerPhysicsApplyLinearVelocity");
  EM.callSystem("physicsApplyAngularVelocity");
  if (GAME === "gjk") {
    // TODO(@darzu): Doug, we should talk about this. It is only registered after a one-shot
    if (EM.hasSystem("checkGJK")) EM.callSystem("checkGJK");
  }

  // TODO(@darzu): HACK. we need to think better how to let different areas, like a sandbox game, register systems
  //    to be called in a less cumbersome way than adding text and guards in here.
  for (let sys of gameplaySystems) EM.callSystem(sys);

  EM.callSystem("updateLocalFromPosRotScale");
  EM.callSystem("updateWorldFromLocalAndParent");
  EM.callSystem("registerUpdateWorldAABBs");
  EM.callSystem("updatePhysInContact");
  EM.callSystem("physicsStepContact");
  EM.callSystem("updateWorldFromLocalAndParent2");
  EM.callSystem("colliderMeshes");
  EM.callSystem("debugMeshes");
  EM.callSystem("debugMeshTransform");
  EM.callSystem("bulletCollision");
  callSpringSystems(EM);
  callClothSystems(EM);
  EM.callSystem("modelerOnOff");
  EM.callSystem("modelerClicks");
  EM.callSystem("aabbBuilder");
  if (GAME === "hyperspace") {
    EM.callSystem("toolPickup");
    EM.callSystem("toolDrop");
  }
  EM.callSystem("animateTo");

  EM.callSystem("netDebugSystem");
  EM.callSystem("netAck");
  EM.callSystem("netSync");
  EM.callSystem("sendOutboxes");
  EM.callSystem("detectedEventsToHost");
  EM.callSystem("handleEventRequests");
  EM.callSystem("handleEventRequestAcks");
  EM.callSystem("detectedEventsToRequestedEvents");
  EM.callSystem("requestedEventsToEvents");
  EM.callSystem("sendEvents");
  EM.callSystem("handleEvents");
  EM.callSystem("handleEventAcks");

  EM.callSystem("runEvents");
  EM.callSystem("delete");
  EM.callSystem("smoothMotion");
  EM.callSystem("updateMotionSmoothing");
  EM.callSystem("updateSmoothedWorldFrames");
  EM.callSystem("smoothCamera");
  EM.callSystem("cameraFollowTarget");
  EM.callSystem("retargetCamera");
  EM.callSystem("renderView");
  EM.callSystem("constructRenderables");
  if (DBG_ASSERT) EM.callSystem("deadCleanupWarning"); // SHOULD BE LAST(-ish); warns if cleanup is missing
  EM.checkEntityPromises();
  EM.loops++;
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
  else if (GAME === "ld51") initRogueGame(EM, hosting);
  else if (GAME === "font") initFontEditor(EM);
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
      tick(EM, TIMESTEP);
      resetTempMatrixBuffer();
      callFixedTimestepSystems();
      loops++;
    }
    setSimulationAlpha(accumulator / TIMESTEP);
    EM.callSystem("updateRendererWorldFrames");
    EM.callSystem("updateCameraView");
    {
      // NOTE: these 3 must stay together in this order. See NOTE above renderListDeadHidden
      EM.callSystem("renderListDeadHidden");
      EM.callSystem("renderList");
      EM.callSystem("stepRenderer");
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
