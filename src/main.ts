import { test } from "./test.js";
import {
  _cellChecks,
  _doesOverlaps,
  _enclosedBys,
  _lastCollisionTestTimeMs,
} from "./physics/broadphase.js";
import { setupObjImportExporter } from "./download.js";
import { initShipGame, registerAllSystems } from "./game/game.js";
import { EM } from "./entity-manager.js";
import { addTimeComponents } from "./time.js";
import { InputsDef, registerInputsSystem } from "./inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debugger.js";
import { RendererDef } from "./render/render_init.js";
import { DevConsoleDef } from "./console.js";
import { initDbgGame } from "./game/sandbox.js";

export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const ENABLE_NET = false;
const AUTOSTART = true;

export let gameStarted = false;
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

  addTimeComponents(EM);
  addEventComponents(EM);

  EM.addSingletonComponent(InputsDef);
  registerInputsSystem(EM);

  // initShipGame(EM, hosting);
  initDbgGame(EM, hosting);

  let previous_frame_time = start_of_time;
  let frame = () => {
    let frame_start_time = performance.now();
    // apply any state updates from the network
    //if (net) net.updateState(previous_frame_time);

    let sim_time = 0;
    let before_sim = performance.now();
    EM.callSystems();
    sim_time += performance.now() - before_sim;

    let jsTime = performance.now() - frame_start_time;
    let frameTime = frame_start_time - previous_frame_time;
    previous_frame_time = frame_start_time;

    const devStats = EM.getResource(DevConsoleDef);
    if (devStats) devStats.updateAvgs(jsTime, frameTime, sim_time);

    requestAnimationFrame(frame);
  };

  if (ENABLE_NET) {
    try {
      /*
      net = new Net(_gameState, host, (id: string) => {
        _renderer.finishInit(); // TODO(@darzu): debugging
        if (hosting) {
          console.log("hello");
          console.log(`Net up and running with id`);
          console.log(`${id}`);
          const url = `${window.location.href}?server=${id}`;
          console.log(url);
          if (navigator.clipboard) navigator.clipboard.writeText(url);
          frame();
        } else {
          frame();
        }
      });*/
    } catch (e) {
      console.error("Failed to initialize net");
      console.error(e);
      //net = null;
    }
  } else {
    frame();
  }
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
