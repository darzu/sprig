import { test } from "./test.js";
import { setupObjImportExporter } from "./download.js";
import { EM } from "./entity-manager.js";
import { tick } from "./time.js";
import { InputsDef, registerInputsSystem } from "./inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debugger.js";
import { DevConsoleDef } from "./console.js";
import {
  initClothSandbox,
  initGJKSandbox,
  initReboundSandbox,
} from "./game/sandbox.js";
import { callClothSystems } from "./game/cloth.js";
import { callSpringSystems } from "./game/spring.js";
import { initShipGame, registerAllSystems } from "./game/game.js";
import { setSimulationAlpha } from "./render/renderer-ecs.js";
import { never } from "./util.js";
import { initHyperspaceGame } from "./game/xp-hyperspace.js";
import { initCubeGame } from "./game/xp-cube.js";

export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const ENABLE_NET = false;
const AUTOSTART = true;

const GAME = "hyperspace" as
  | "ship"
  | "gjk"
  | "rebound"
  | "cloth"
  | "hyperspace"
  | "cube";

// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;

// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 3;

export let gameStarted = false;

function callFixedTimestepSystems() {
  EM.callSystem("inputs");
  EM.callSystem("getStatsFromNet");
  EM.callSystem("getEventsFromNet");
  EM.callSystem("sendEventsToNet");
  EM.callSystem("canvas");
  EM.callSystem("uiText");
  EM.callSystem("devConsoleToggle");
  EM.callSystem("devConsole");
  EM.callSystem("restartTimer");
  EM.callSystem("updateScore");
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
  if (GAME === "ship") {
    EM.callSystem("initGroundSystem");
    EM.callSystem("groundSystem");
    EM.callSystem("startGame");
    EM.callSystem("shipHealthCheck");
    EM.callSystem("easeRudder");
    EM.callSystem("shipMove");
    EM.callSystem("shipScore");
    EM.callSystem("groundPropsBuild");
    EM.callSystem("boatPropsBuild");
    EM.callSystem("cannonPropsBuild");
    EM.callSystem("gemPropsBuild");
    EM.callSystem("rudderPropsBuild");
    EM.callSystem("shipPropsBuild");
  }
  EM.callSystem("buildBullets");
  EM.callSystem("buildCursor");
  EM.callSystem("placeCursorAtScreenCenter");
  EM.callSystem("stepBoats");
  EM.callSystem("boatsFire");
  EM.callSystem("breakBoats");
  EM.callSystem("controllableInput");
  EM.callSystem("controllableCameraFollow");
  EM.callSystem("buildPlayers");
  EM.callSystem("playerFacingDir");
  EM.callSystem("stepPlayers");
  EM.callSystem("playerLookingForShip");
  if (GAME === "rebound") {
    EM.callSystem("sandboxSpawnBoxes");
  }
  if (GAME === "cloth") {
    EM.callSystem("clothSandbox");
  }
  if (GAME === "hyperspace") {
    EM.callSystem("startGame");
    EM.callSystem("shipHealthCheck");
    EM.callSystem("easeRudder");
    EM.callSystem("shipMove");
    EM.callSystem("shipScore");
    EM.callSystem("boatPropsBuild");
    EM.callSystem("cannonPropsBuild");
    EM.callSystem("gemPropsBuild");
    EM.callSystem("rudderPropsBuild");
    EM.callSystem("shipPropsBuild");

    EM.callSystem("hyperspaceGame");
    EM.callSystem("runOcean");
  }
  EM.callSystem("updateBullets");
  EM.callSystem("updateNoodles");
  EM.callSystem("updateLifetimes");
  EM.callSystem("interaction");
  EM.callSystem("turretAim");
  EM.callSystem("turretYawPitch");
  EM.callSystem("turretManUnman");
  EM.callSystem("reloadCannon");
  EM.callSystem("playerControlCannon");
  EM.callSystem("playerManCanon");
  if (GAME === "ship") {
    EM.callSystem("spawnOnTile");
    EM.callSystem("spawnFinishAnimIn");
  }
  EM.callSystem("ensureFillOutLocalFrame");
  EM.callSystem("ensureWorldFrame");
  EM.callSystem("physicsInit");
  EM.callSystem("clampVelocityByContact");
  EM.callSystem("registerPhysicsClampVelocityBySize");
  EM.callSystem("registerPhysicsApplyLinearVelocity");
  EM.callSystem("physicsApplyAngularVelocity");
  if (GAME === "gjk") {
    // TODO(@darzu): Doug, we should talk about this. It is only registered after a one-shot
    if (EM.hasSystem("checkGJK")) EM.callSystem("checkGJK");
  }
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
  EM.callSystem("toolPickup");
  EM.callSystem("toolDrop");
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
  EM.callOneShotSystems();
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
  EM.addSingletonComponent(PeerNameDef, localPeerName);
  if (hosting) {
    // TODO(@darzu): ECS
    EM.setDefaultRange("net");
    EM.setIdRange("net", 10001, 20000);
    EM.addSingletonComponent(MeDef, 0, true);
    EM.addSingletonComponent(HostDef);
  } else {
    EM.addSingletonComponent(JoinDef, host!);
  }

  registerAllSystems(EM);

  addEventComponents(EM);

  EM.addSingletonComponent(InputsDef);
  registerInputsSystem(EM);

  if (GAME === "ship") initShipGame(EM, hosting);
  else if (GAME === "gjk") initGJKSandbox(EM, hosting);
  else if (GAME === "rebound") initReboundSandbox(EM, hosting);
  else if (GAME === "cloth") initClothSandbox(EM, hosting);
  else if (GAME === "hyperspace") initHyperspaceGame(EM);
  else if (GAME === "cube") initCubeGame(EM);
  else never(GAME, "TODO game");

  let previous_frame_time = start_of_time;
  let accumulator = 0;
  let frame = (frame_time: number) => {
    let before_frame = performance.now();
    accumulator += frame_time - previous_frame_time;
    let loops = 0;
    while (accumulator > TIMESTEP) {
      if (loops > MAX_SIM_LOOPS) {
        console.log("too many sim loops, resetting accumulator");
        accumulator = 0;
        break;
      }
      accumulator -= TIMESTEP;
      tick(EM, TIMESTEP);
      callFixedTimestepSystems();
      loops++;
    }
    setSimulationAlpha(accumulator / TIMESTEP);
    EM.callSystem("updateRendererWorldFrames");
    EM.callSystem("updateCameraView");
    EM.callSystem("stepRenderer");
    let jsTime = performance.now() - before_frame;
    let frameTime = frame_time - previous_frame_time;
    previous_frame_time = frame_time;

    const devStats = EM.getResource(DevConsoleDef);
    if (devStats) devStats.updateAvgs(jsTime, frameTime, jsTime);

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

  const peerName = getPeerName(queryString);

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
