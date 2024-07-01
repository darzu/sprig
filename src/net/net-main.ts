import { EM } from "../ecs/ecs.js";
import { ENABLE_NET, VERBOSE_NET_LOG } from "../flags.js";
import { randInt } from "../utils/math.js";
import { toInt } from "../utils/util-no-import.js";
import { getWebQueryString } from "../web/webnav.js";
import { PeerNameDef, MeDef, HostDef, JoinDef } from "./components.js";
import { addEventComponents, initNetGameEventSystems } from "./events.js";
import { initNetJoinSystems } from "./join.js";
import { initNetDebugSystem } from "./net-debug.js";
import { initNetSystems } from "./net.js";
import {
  initNetStateEventSystems,
  initNetSendOutboxes,
} from "./network-event-handler.js";
import { initNetPredictSystems } from "./predict.js";
import {
  initNetUpdateSystems,
  initNetAckUpdateSystem,
  initNetSyncSystem,
} from "./sync.js";

// old net-related stuff that was in main

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

export interface NetStart {
  isHosting: boolean;
}

export function startNet(): NetStart {
  const queryString = getWebQueryString();
  const urlServerId = queryString.get("server");

  const isHosting = !urlServerId;

  // const userId = toInt(queryString.get("user")) ?? 1;
  // TODO(@darzu): RE-JOIN. don't assign random client user ids

  // const peerName2 = getPeerName(queryString);
  // const peerName = "myPeerName";
  const peerName = isHosting
    ? `sprigHost_${randInt(1, 2 ** 20)}`
    : `sprigClient_${randInt(1, 256)}`;

  if (VERBOSE_NET_LOG) console.log(`hosting: ${isHosting}`);

  // TODO(@darzu): ECS stuff
  // init ECS
  EM.addResource(PeerNameDef, peerName);
  if (isHosting) {
    // TODO(@darzu): ECS
    EM.setDefaultRange("net");
    EM.setIdRange("net", 10001, 20000);
    EM.addResource(MeDef, 0, true);
    EM.addResource(HostDef);
  } else {
    EM.addResource(JoinDef, urlServerId);
  }

  // TODO(@darzu): consolidate, rename, clean up net init
  if (ENABLE_NET) {
    initNetSystems();
  }
  initNetStateEventSystems();

  initNetUpdateSystems();
  initNetPredictSystems();
  initNetJoinSystems();

  initNetDebugSystem();
  initNetAckUpdateSystem();
  initNetSyncSystem();
  initNetSendOutboxes();
  initNetGameEventSystems();

  addEventComponents(); // TODO(@darzu): move elsewhere!

  return {
    isHosting,
  };
}
