import { EntityManager } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { registerInitTransforms } from "../physics/transform.js";
import { LocalPlayerDef, registerPlayerSystems } from "./player.js";
import {
  CameraDef,
  CameraFollowDef,
  registerCameraSystems,
  setCameraFollowPosition,
} from "../camera.js";
import {
  registerHandleNetworkEvents,
  registerSendOutboxes,
} from "../net/network-event-handler.js";
import { registerJoinSystems } from "../net/join.js";
import {
  registerSyncSystem,
  registerUpdateSystem,
  registerAckUpdateSystem,
} from "../net/sync.js";
import { registerPredictSystem } from "../net/predict.js";
import { registerEventSystems } from "../net/events.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { registerBuildBulletsSystem, registerBulletUpdate } from "./bullet.js";
import { registerInitCanvasSystem } from "../canvas.js";
import {
  registerConstructRenderablesSystem,
  registerRenderer,
  registerRenderInitSystem,
  registerUpdateRendererWorldFrames,
  registerUpdateSmoothedWorldFrames,
  RendererDef,
} from "../render/renderer-ecs.js";
import {
  registerDeadEntitiesSystem,
  registerDeleteEntitiesSystem,
} from "../delete.js";
import { registerCannonSystems } from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import {
  registerMotionSmoothingRecordLocationsSystem,
  registerMotionSmoothingSystems,
} from "../motion-smoothing.js";
import { registerCursorSystems } from "./cursor.js";
import { registerPhysicsSystems } from "../physics/phys.js";
import { registerUpdateLifetimes } from "./lifetime.js";
import { registerMusicSystems } from "../audio.js";
import { registerNetDebugSystem } from "../net/net-debug.js";
import { callInitFns } from "../init.js";
import { registerGrappleDbgSystems } from "./grapple.js";
import { registerTurretSystems } from "./turret.js";
import { registerUISystems } from "./ui.js";
import { registerDevSystems } from "../console.js";
import { registerControllableSystems } from "./controllable.js";
import { registerShipSystems } from "./hyperspace/player-ship.js";
import { registerGameStateSystems } from "./hyperspace/gamestate.js";
import { registerEnemyShipSystems } from "./hyperspace/enemy-ship.js";
import { registerNetSystems } from "../net/net.js";
import { registerNoodleSystem } from "./noodles.js";
import { registerToolSystems } from "./tool.js";
import { ENABLE_NET } from "../flags.js";

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
  registerGrappleDbgSystems(em);
  registerInitTransforms(em);
  registerEnemyShipSystems(em);
  registerControllableSystems(em);
  registerPlayerSystems(em);
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
        const localPlayer = em.getResource(LocalPlayerDef);
        const p = em.findEntity(localPlayer?.playerId ?? -1, [CameraFollowDef]);
        if (p) {
          const overShoulder = p.cameraFollow.positionOffset[0] !== 0;
          if (overShoulder) setCameraFollowPosition(p, "thirdPerson");
          else setCameraFollowPosition(p, "thirdPersonOverShoulder");
        }
      }
    },
    "renderView"
  );
}
