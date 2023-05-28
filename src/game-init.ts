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
import { initBulletCollisionSystem } from "./cannons/bullet-collision.js";
import {
  registerConstructRenderablesSystem,
  registerRenderer,
  registerRiggedRenderablesSystems,
  registerUpdateRendererWorldFrames,
} from "./render/renderer-ecs.js";
import { initCannonSystems } from "./cannons/cannon.js";
import { initInteractablesSystem } from "./input/interact.js";
import { init3DModeler } from "./meshes/modeler.js";
import {
  initNetMotionRecordingSystem,
  initMotionSmoothingSystems,
} from "./render/motion-smoothing.js";
import { initPhysicsSystems } from "./physics/phys.js";
import { initLifetimesSystem } from "./ecs/lifetime.js";
import { initNetDebugSystem } from "./net/net-debug.js";
import { callInitFns } from "./init.js";
import { initTurretSystems } from "./turret/turret.js";
import { initHtmlUI } from "./gui/ui.js";
import { initDevConsole } from "./debug/console.js";
import { initControllablesSystems } from "./input/controllable.js";
import { initNetSystems } from "./net/net.js";
import { ENABLE_NET } from "./flags.js";
import { initGravitySystem } from "./motion/gravity.js";
import { initParameterMotionSystems } from "./motion/parametric-motion.js";
import { initAnimateToSystems } from "./animation/animate-to.js";
import { registerClothSystems } from "./cloth/cloth.js";
import { registerSpringSystems } from "./cloth/spring.js";
import { registerSkeletalAnimSystems } from "./animation/skeletal.js";
import { registerStdMeshUpload } from "./render/pipelines/std-mesh.js";
import { registerOceanDataUpload } from "./render/pipelines/std-ocean.js";
import { registerRenderViewController } from "./debug/view-modes.js";
import { registerWoodSplinterSystem } from "./wood/wood-splinters.js";
import { registerWoodSystems } from "./wood/wood.js";

export function initCommonSystems(em: EntityManager) {
  if (ENABLE_NET) {
    initNetSystems(em);
  }
  initNetStateEventSystems(em);
  initNetMotionRecordingSystem(em);
  initNetUpdateSystems(em);
  initNetPredictSystems(em);
  initNetJoinSystems(em);

  initHtmlUI(em);
  initDevConsole(em);

  initControllablesSystems(em);

  initLifetimesSystem(em);

  initInteractablesSystem(em);

  initTurretSystems(em);
  initCannonSystems(em);

  initGravitySystem(em);
  initAnimateToSystems();
  initParameterMotionSystems(em);

  initPhysicsSystems(em);

  // TODO(@darzu): too game-specific
  initBulletCollisionSystem(em);

  init3DModeler(em);

  initNetDebugSystem(em);
  initNetAckUpdateSystem(em);
  initNetSyncSystem(em);
  initNetSendOutboxes(em);
  initNetGameEventSystems(em);

  initMotionSmoothingSystems(em);
  registerUpdateRendererWorldFrames(em);
  registerRenderViewController(em);
  registerConstructRenderablesSystem(em);
  registerRiggedRenderablesSystems(em);
  registerRenderer(em);
  registerClothSystems();
  registerSpringSystems();
  registerSkeletalAnimSystems();
  registerStdMeshUpload();
  registerOceanDataUpload();
  registerWoodSplinterSystem();
  registerWoodSystems();

  callInitFns(em);
}
