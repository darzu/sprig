import { EntityManager } from "./ecs/entity-manager.js";
import {
  initNetStateEventSystems,
  initNetSendOutboxes,
} from "./net/network-event-handler.js";
import { initNetJoinSystems } from "./net/join.js";
import {
  initNetSyncSystem,
  initNetUpdateSystems,
  initNetAckUpdateSystem,
} from "./net/sync.js";
import { initNetPredictSystems } from "./net/predict.js";
import { initNetGameEventSystems } from "./net/events.js";
import {
  initNetMotionRecordingSystem,
  initMotionSmoothingSystems,
} from "./render/motion-smoothing.js";
import { initPhysicsSystems } from "./physics/phys.js";
import { initNetDebugSystem } from "./net/net-debug.js";
import { initHtmlUI } from "./gui/ui.js";
import { initDevConsole } from "./debug/console.js";
import { initNetSystems } from "./net/net.js";
import { ENABLE_NET } from "./flags.js";
import { initDbgViewModes } from "./debug/view-modes.js";

export function initCommonSystems() {
  // TODO(@darzu): consolidate, rename, clean up net init
  if (ENABLE_NET) {
    initNetSystems();
  }
  initNetStateEventSystems();
  initNetMotionRecordingSystem();
  initNetUpdateSystems();
  initNetPredictSystems();
  initNetJoinSystems();

  initNetDebugSystem();
  initNetAckUpdateSystem();
  initNetSyncSystem();
  initNetSendOutboxes();
  initNetGameEventSystems();

  initHtmlUI();
  initDevConsole();

  initPhysicsSystems();

  initMotionSmoothingSystems();

  initDbgViewModes();
}
