import { EntityManager } from "./ecs/entity-manager.js";
import { InputsDef } from "./input/inputs.js";
import { registerInitTransforms } from "./physics/transform.js";
import { LocalHsPlayerDef } from "./hyperspace/hs-player.js";
import {
  CameraDef,
  CameraFollowDef,
  registerCameraSystems,
  setCameraFollowPosition,
} from "./camera/camera.js";
import {
  registerHandleNetworkEvents,
  registerSendOutboxes,
} from "./net/network-event-handler.js";
import { registerJoinSystems } from "./net/join.js";
import {
  registerSyncSystem,
  registerUpdateSystem,
  registerAckUpdateSystem,
} from "./net/sync.js";
import { registerPredictSystem } from "./net/predict.js";
import { registerEventSystems } from "./net/events.js";
import { registerBulletCollisionSystem } from "./cannons/bullet-collision.js";
import {
  registerBuildBulletsSystem,
  registerBulletUpdate,
} from "./cannons/bullet.js";
import { registerInitCanvasSystem } from "./render/canvas.js";
import {
  registerConstructRenderablesSystem,
  registerRenderer,
  registerRenderInitSystem,
  registerRiggedRenderablesSystems,
  registerUpdateRendererWorldFrames,
  registerUpdateSmoothedWorldFrames,
  RendererDef,
} from "./render/renderer-ecs.js";
import { registerCannonSystems } from "./cannons/cannon.js";
import { registerInteractionSystem } from "./input/interact.js";
import { registerModeler } from "./meshes/modeler.js";
import {
  registerMotionSmoothingRecordLocationsSystem,
  registerMotionSmoothingSystems,
} from "./render/motion-smoothing.js";
import { registerPhysicsSystems } from "./physics/phys.js";
import { registerUpdateLifetimes } from "./ecs/lifetime.js";
import { registerMusicSystems } from "./audio/audio.js";
import { registerNetDebugSystem } from "./net/net-debug.js";
import { callInitFns } from "./init.js";
import { registerTurretSystems } from "./turret/turret.js";
import { registerUISystems } from "./gui/ui.js";
import { registerDevSystems } from "./debug/console.js";
import { registerControllableSystems } from "./input/controllable.js";
import { registerNetSystems } from "./net/net.js";
import { ENABLE_NET } from "./flags.js";
import { Phase } from "./ecs/sys-phase.js";
import { registerGravitySystem } from "./motion/gravity.js";
import { registerParameterMotionSystems } from "./motion/parametric-motion.js";
import { registerAnimateToSystems } from "./animation/animate-to.js";
import { registerClothSystems } from "./cloth/cloth.js";
import { registerSpringSystems } from "./cloth/spring.js";
import { registerUploadGrassData } from "./grass/std-grass.js";
import { registerSkeletalAnimSystems } from "./animation/skeletal.js";
import { registerStdMeshUpload } from "./render/pipelines/std-mesh.js";
import { registerOceanDataUpload } from "./render/pipelines/std-ocean.js";
import { registerRenderViewController } from "./debug/view-modes.js";

export function registerCommonSystems(em: EntityManager) {
  if (ENABLE_NET) {
    registerNetSystems(em);
  }

  registerInitCanvasSystem(em);
  registerUISystems(em);
  registerDevSystems(em);
  // registerGameStateSystems(em);
  registerRenderInitSystem(em);
  registerMusicSystems(em);
  registerHandleNetworkEvents(em);
  registerMotionSmoothingRecordLocationsSystem(em);
  registerUpdateSystem(em);
  registerPredictSystem(em);
  registerJoinSystems(em);
  // registerGroundSystems(em);
  // TODO(@darzu): game-specific registrations!
  // registerShipSystems(em);
  registerBuildBulletsSystem(em);
  // registerCursorSystems(em);
  registerInitTransforms(em);
  // registerEnemyShipSystems(em);
  registerControllableSystems(em);
  // registerHsPlayerSystems(em);
  registerBulletUpdate(em);
  // TODO(@darzu): re-enable noodles?
  // registerNoodleSystem(em);
  registerUpdateLifetimes(em);
  registerInteractionSystem(em);
  registerTurretSystems(em);
  registerCannonSystems(em);
  registerGravitySystem(em);
  registerAnimateToSystems();
  registerParameterMotionSystems(em);
  registerPhysicsSystems(em);
  registerBulletCollisionSystem(em);
  registerModeler(em);
  // TODO(@darzu): re-enable tools
  // registerToolSystems(em);
  registerNetDebugSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerEventSystems(em);
  // registerDeleteEntitiesSystem(em);
  // registerDeadEntitiesSystem(em);
  registerMotionSmoothingSystems(em);
  registerUpdateSmoothedWorldFrames(em);
  registerUpdateRendererWorldFrames(em);
  registerCameraSystems(em);
  registerRenderViewController(em);
  registerConstructRenderablesSystem(em);
  registerRiggedRenderablesSystems(em);
  registerRenderer(em);
  registerClothSystems();
  registerSpringSystems();
  registerSkeletalAnimSystems();
  registerStdMeshUpload();
  registerOceanDataUpload();

  callInitFns(em);
}
