import { test } from "./test.js";
import { _cellChecks, _doesOverlaps, _enclosedBys, _lastCollisionTestTimeMs, } from "./physics/broadphase.js";
import { setupObjImportExporter } from "./download.js";
import { createLocalObjects, createServerObjects, initGame, registerAllSystems, } from "./game/game.js";
import { EM } from "./entity-manager.js";
import { addTimeComponents } from "./time.js";
import { InputsDef, registerInputsSystem } from "./inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debugger.js";
import { RendererDef } from "./render/render_init.js";
export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const ENABLE_NET = false;
const AUTOSTART = true;
export let gameStarted = false;
async function startGame(localPeerName, host) {
    if (gameStarted)
        return;
    gameStarted = true;
    let hosting = host === null;
    const debugDiv = document.getElementById("debug-div");
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
    }
    else {
        EM.addSingletonComponent(JoinDef, host);
    }
    registerAllSystems(EM);
    addTimeComponents(EM);
    addEventComponents(EM);
    initGame(EM);
    if (hosting) {
        createServerObjects(EM);
    }
    else {
        createLocalObjects(EM);
    }
    EM.addSingletonComponent(InputsDef);
    registerInputsSystem(EM);
    const controlsStr = `[WASD space 1 2 3 4 5 r t]`;
    let avgJsTime = 0;
    let avgNetTime = 0;
    let avgSimTime = 0;
    let avgFrameTime = 0;
    let avgWeight = 0.05;
    //let net: Net | null = null;
    let previous_frame_time = start_of_time;
    let frame = () => {
        var _a, _b;
        let frame_start_time = performance.now();
        // apply any state updates from the network
        //if (net) net.updateState(previous_frame_time);
        let sim_time = 0;
        let before_sim = performance.now();
        EM.callSystems();
        sim_time += performance.now() - before_sim;
        /*
        if (net) {
          net.handleEventRequests();
        }*/
        // send updates out to network (if necessary)
        let net_time = 0;
        /*
        let before_net = performance.now();
        if (net) {
          net.sendStateUpdates();
        }
        net_time += performance.now() - before_net;
        */
        // render
        // TODO(@darzu):
        // gameState.renderFrame();
        let jsTime = performance.now() - frame_start_time;
        let frameTime = frame_start_time - previous_frame_time;
        let { reliableBufferSize, unreliableBufferSize, numDroppedUpdates, skew, ping, } = /*net
          ? net.stats()
          : */ {
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
        const debugTxt = debugDiv.firstChild;
        // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
        //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
        //    means we'll need to do more work to get line breaks.
        const usingWebGPU = (_b = (_a = EM.findSingletonComponent(RendererDef)) === null || _a === void 0 ? void 0 : _a.renderer) === null || _b === void 0 ? void 0 : _b.usingWebGPU;
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
                `entities:${EM.entities.size} ` +
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
        }
        catch (e) {
            console.error("Failed to initialize net");
            console.error(e);
            //net = null;
        }
    }
    else {
        frame();
    }
}
function getPeerName(queryString) {
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
    var _a;
    const queryString = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const urlServerId = (_a = queryString["server"]) !== null && _a !== void 0 ? _a : null;
    const peerName = getPeerName(queryString);
    let controls = document.getElementById("server-controls");
    let serverStartButton = document.getElementById("server-start");
    let connectButton = document.getElementById("connect");
    let serverIdInput = document.getElementById("server-id");
    if (ENABLE_NET && !AUTOSTART && !urlServerId) {
        serverStartButton.onclick = () => {
            startGame(peerName, null);
            controls.hidden = true;
        };
        connectButton.onclick = () => {
            startGame(peerName, serverIdInput.value);
            controls.hidden = true;
        };
    }
    else {
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
    }
    catch (e) {
        console.error(e);
    }
})();
// for debugging
window.dbg = dbg;
window.EM = EM;
//# sourceMappingURL=main.js.map