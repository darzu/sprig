import { vec3, quat } from "./gl-matrix.js";
import { Net } from "./net.js";
import { test } from "./test.js";
import { Renderer, Renderer_WebGPU } from "./render_webgpu.js";
import { attachToCanvas } from "./render_webgl.js";
import {
  _cellChecks,
  _doesOverlaps,
  _enclosedBys,
  _lastCollisionTestTimeMs,
} from "./phys_broadphase.js";
import { _motionPairsLen } from "./phys.js";
import { createInputsReader } from "./inputs.js";
import { setupObjImportExporter } from "./download.js";
import { GameAssets, loadAssets } from "./game/assets.js";
import { CubeGameState } from "./game/game.js";
import { EM, TimeDef } from "./entity-manager.js";

const FORCE_WEBGL = false;
const MAX_MESHES = 20000;
const MAX_VERTICES = 21844;
const ENABLE_NET = true;
const AUTOSTART = true;

export interface CameraProps {
  rotation: quat;
  location: vec3;
}

// ms per network sync (should be the same for all servers)
const NET_DT = 1000.0 / 20;

// local simulation speed
const SIM_DT = 1000.0 / 60;

// TODO(@darzu): very hacky way to pass these around
export let _GAME_ASSETS: GameAssets | null = null;

export let gameStarted = false;
async function startGame(host: string | null) {
  if (gameStarted) return;
  gameStarted = true;

  // TODO(@darzu): stream in assets
  _GAME_ASSETS = await loadAssets();

  let hosting = host === null;
  let canvas = document.getElementById("sample-canvas") as HTMLCanvasElement;
  function onWindowResize() {
    canvas.width = window.innerWidth;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.height = window.innerHeight;
    canvas.style.height = `${window.innerHeight}px`;
  }
  window.onresize = function () {
    onWindowResize();
  };
  onWindowResize();

  // This tells Chrome that the canvas should be pixelated instead of blurred.
  //    this looks better in lower resolution games and gives us full control over
  //    resolution and blur.
  // HACK: for some odd reason, setting this on a timeout is the only way I can get
  //    Chrome to accept this property. Otherwise it'll only apply after the canvas
  //    is resized by the user. (Version 94.0.4604.0 (Official Build) canary (arm64))
  setTimeout(() => {
    canvas.style.imageRendering = `pixelated`;
  }, 50);

  const debugDiv = document.getElementById("debug-div") as HTMLDivElement;

  let rendererInit: Renderer | undefined = undefined;
  let usingWebGPU = false;
  if (!FORCE_WEBGL) {
    // try webgpu
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      const device = await adapter.requestDevice();
      // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
      const context = canvas.getContext(
        "webgpu"
      ) as any as GPUPresentationContext;
      if (context) {
        rendererInit = new Renderer_WebGPU(
          canvas,
          device,
          context,
          adapter,
          MAX_MESHES,
          MAX_VERTICES
        );
        if (rendererInit) usingWebGPU = true;
      }
    }
  }
  if (!rendererInit) {
    rendererInit = attachToCanvas(canvas, MAX_MESHES, MAX_VERTICES);
  }
  if (!rendererInit) throw "Unable to create webgl or webgpu renderer";
  console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);
  const renderer: Renderer = rendererInit;
  let start_of_time = performance.now();

  // TODO(@darzu): ECS stuff
  // init ECS
  if (hosting) {
    // TODO(@darzu): ECS
    EM.setIdRange(1, 10000);
  }
  EM.addSingletonComponent(TimeDef);

  let gameState = new CubeGameState(renderer, hosting);
  let takeInputs = createInputsReader(canvas);
  function doLockMouse() {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  }
  canvas.addEventListener("click", doLockMouse);

  const controlsStr = `[WASD shift/c mouse spacebar]`;
  let avgJsTime = 0;
  let avgNetTime = 0;
  let avgSimTime = 0;
  let avgFrameTime = 0;
  let avgWeight = 0.05;
  let net: Net | null = null;
  let previous_frame_time = start_of_time;
  let net_time_accumulator = 0;
  let sim_time_accumulator = 0;
  let frame = () => {
    let frame_start_time = performance.now();
    const dt = frame_start_time - previous_frame_time;

    // apply any state updates from the network
    if (net) net.updateState(previous_frame_time);

    // simulation step(s)
    sim_time_accumulator += dt;
    sim_time_accumulator = Math.min(sim_time_accumulator, SIM_DT * 2);
    let sim_time = 0;
    while (sim_time_accumulator > SIM_DT) {
      let before_sim = performance.now();
      gameState.step(SIM_DT, takeInputs());
      sim_time_accumulator -= SIM_DT;
      sim_time += performance.now() - before_sim;
    }

    if (net) {
      net.handleEventRequests();
    }

    // send updates out to network (if necessary)
    net_time_accumulator += dt;
    net_time_accumulator = Math.min(net_time_accumulator, NET_DT * 2);
    let net_time = 0;
    while (net_time_accumulator > NET_DT) {
      let before_net = performance.now();
      if (net) {
        net.sendStateUpdates();
      }
      net_time += performance.now() - before_net;
      net_time_accumulator -= NET_DT;
    }

    // render
    gameState.renderFrame();
    let jsTime = performance.now() - frame_start_time;
    let frameTime = frame_start_time - previous_frame_time;
    let {
      reliableBufferSize,
      unreliableBufferSize,
      numDroppedUpdates,
      skew,
      ping,
    } = net
      ? net.stats()
      : {
          reliableBufferSize: 0,
          unreliableBufferSize: 0,
          numDroppedUpdates: 0,
          skew: [],
          ping: [],
        };
    previous_frame_time = frame_start_time;
    avgJsTime = avgJsTime
      ? (1 - avgWeight) * avgJsTime + avgWeight * jsTime
      : jsTime;
    avgFrameTime = avgFrameTime
      ? (1 - avgWeight) * avgFrameTime + avgWeight * frameTime
      : frameTime;
    avgNetTime = avgNetTime
      ? (1 - avgWeight) * avgNetTime + avgWeight * net_time
      : net_time;
    avgSimTime = avgSimTime
      ? (1 - avgWeight) * avgSimTime + avgWeight * sim_time
      : sim_time;
    const avgFPS = 1000 / avgFrameTime;
    const debugTxt = debugDiv.firstChild!;
    // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
    //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
    //    means we'll need to do more work to get line breaks.
    debugTxt.nodeValue =
      controlsStr +
      ` ` +
      `js:${avgJsTime.toFixed(2)}ms ` +
      `net:${avgNetTime.toFixed(2)}ms ` +
      `sim:${avgSimTime.toFixed(2)}ms ` +
      `broad:(${_lastCollisionTestTimeMs.toFixed(1)}ms ` +
      `o:${_doesOverlaps} e:${_enclosedBys} c:${_cellChecks}) ` +
      `fps:${avgFPS.toFixed(1)} ` +
      //`buffers:(r=${reliableBufferSize}/u=${unreliableBufferSize}) ` +
      `dropped:${numDroppedUpdates} ` +
      `objects:${gameState.numObjects} ` +
      `skew: ${skew.join(",")} ` +
      `ping: ${ping.join(",")} ` +
      `${usingWebGPU ? "WebGPU" : "WebGL"}`;
    // // TODO(@darzu): DEBUG
    // debugTxt.nodeValue =
    //   `sim:${avgSimTime.toFixed(2)}ms ` +
    //   `broad:${_lastCollisionTestTimeMs.toFixed(1)}ms ` +
    //   `pairs:${_motionPairsLen} ` +
    //   `o:${_doesOverlaps} e:${_enclosedBys} `;
    requestAnimationFrame(frame);
  };

  if (ENABLE_NET) {
    try {
      net = new Net(gameState, host, (id: string) => {
        renderer.finishInit(); // TODO(@darzu): debugging
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
      });
    } catch (e) {
      console.error("Failed to initialize net");
      console.error(e);
      net = null;
    }
  } else {
    renderer.finishInit(); // TODO(@darzu): debugging
    frame();
  }
}

async function main() {
  const queryString = Object.fromEntries(
    new URLSearchParams(window.location.search).entries()
  );
  const urlServerId = queryString["server"] ?? null;

  let controls = document.getElementById("server-controls") as HTMLDivElement;
  let serverStartButton = document.getElementById(
    "server-start"
  ) as HTMLButtonElement;
  let connectButton = document.getElementById("connect") as HTMLButtonElement;
  let serverIdInput = document.getElementById("server-id") as HTMLInputElement;
  if (ENABLE_NET && !AUTOSTART && !urlServerId) {
    serverStartButton.onclick = () => {
      startGame(null);
      controls.hidden = true;
    };
    connectButton.onclick = () => {
      startGame(serverIdInput.value);
      controls.hidden = true;
    };
  } else {
    startGame(urlServerId);
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
