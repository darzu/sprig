import { EntityManager } from "./ecs/entity-manager.js";
import { InputsDef } from "./input/inputs.js";
import { registerInitTransforms } from "./physics/transform.js";
import {
  LocalHsPlayerDef,
  registerHsPlayerSystems,
} from "./hyperspace/hs-player.js";
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
  registerUpdateRendererWorldFrames,
  registerUpdateSmoothedWorldFrames,
  RendererDef,
} from "./render/renderer-ecs.js";
import {
  registerDeadEntitiesSystem,
  registerDeleteEntitiesSystem,
} from "./ecs/delete.js";
import { registerCannonSystems } from "./cannons/cannon.js";
import { registerInteractionSystem } from "./input/interact.js";
import { registerModeler } from "./meshes/modeler.js";
import {
  registerMotionSmoothingRecordLocationsSystem,
  registerMotionSmoothingSystems,
} from "./render/motion-smoothing.js";
import { registerCursorSystems } from "./gui/cursor.js";
import { registerPhysicsSystems } from "./physics/phys.js";
import { registerUpdateLifetimes } from "./ecs/lifetime.js";
import { registerMusicSystems } from "./audio/audio.js";
import { registerNetDebugSystem } from "./net/net-debug.js";
import { callInitFns } from "./init.js";
import { registerTurretSystems } from "./turret/turret.js";
import { registerUISystems } from "./gui/ui.js";
import { registerDevSystems } from "./debug/console.js";
import { registerControllableSystems } from "./input/controllable.js";
import { registerShipSystems } from "./hyperspace/hyperspace-ship.js";
import { registerGameStateSystems } from "./hyperspace/hyperspace-gamestate.js";
import { registerEnemyShipSystems } from "./hyperspace/uv-enemy-ship.js";
import { registerNetSystems } from "./net/net.js";
import { registerNoodleSystem } from "./animation/noodles.js";
import { registerToolSystems } from "./input/tool.js";
import { ENABLE_NET } from "./flags.js";
import { Phase } from "./ecs/sys_phase";

export function registerCommonSystems(em: EntityManager) {
  if (ENABLE_NET) {
    registerNetSystems(em);
  }

  registerInitCanvasSystem(em);
  registerUISystems(em);
  registerDevSystems(em);
  registerGameStateSystems(em);
  registerRenderInitSystem(em);
  registerMusicSystems(em);
  registerHandleNetworkEvents(em);
  registerMotionSmoothingRecordLocationsSystem(em);
  registerUpdateSystem(em);
  registerPredictSystem(em);
  registerJoinSystems(em);
  // registerGroundSystems(em);
  // TODO(@darzu): game-specific registrations!
  registerShipSystems(em);
  registerBuildBulletsSystem(em);
  registerCursorSystems(em);
  registerInitTransforms(em);
  registerEnemyShipSystems(em);
  registerControllableSystems(em);
  registerHsPlayerSystems(em);
  registerBulletUpdate(em);
  // TODO(@darzu): re-enable noodles?
  registerNoodleSystem(em);
  registerUpdateLifetimes(em);
  registerInteractionSystem(em);
  registerTurretSystems(em);
  registerCannonSystems(em);
  registerPhysicsSystems(em);
  registerBulletCollisionSystem(em);
  registerModeler(em);
  // TODO(@darzu): re-enable tools
  registerToolSystems(em);
  registerNetDebugSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerEventSystems(em);
  registerDeleteEntitiesSystem(em);
  registerDeadEntitiesSystem(em);
  registerMotionSmoothingSystems(em);
  registerUpdateSmoothedWorldFrames(em);
  registerUpdateRendererWorldFrames(em);
  registerCameraSystems(em);
  registerRenderViewController(em);
  registerConstructRenderablesSystem(em);
  registerRenderer(em);

  callInitFns(em);
}

function registerRenderViewController(em: EntityManager) {
  em.registerSystem(
    "renderModeToggles",
    Phase.GAME_PLAYERS,
    [],
    [InputsDef, RendererDef, CameraDef],
    (_, { inputs, renderer, camera }) => {
      // check render mode
      if (inputs.keyClicks["1"]) {
        // both lines and tris
        renderer.renderer.drawLines = true;
        renderer.renderer.drawTris = true;
      } else if (inputs.keyClicks["2"]) {
        // "wireframe", lines only
        renderer.renderer.drawLines = true;
        renderer.renderer.drawTris = false;
      }

      // check perspective mode
      if (inputs.keyClicks["3"]) {
        if (camera.perspectiveMode === "ortho")
          camera.perspectiveMode = "perspective";
        else camera.perspectiveMode = "ortho";
      }

      // check camera mode
      if (inputs.keyClicks["4"]) {
        const localHsPlayer = em.getResource(LocalHsPlayerDef);
        const p = em.findEntity(localHsPlayer?.playerId ?? -1, [
          CameraFollowDef,
        ]);
        if (p) {
          const overShoulder = p.cameraFollow.positionOffset[0] !== 0;
          if (overShoulder) setCameraFollowPosition(p, "thirdPerson");
          else setCameraFollowPosition(p, "thirdPersonOverShoulder");
        }
      }
    }
  );
}
