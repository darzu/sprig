import { EM, EntityManager } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { PositionDef, registerInitTransforms } from "../physics/transform.js";
import { registerBoatSystems } from "./boat.js";
import {
  createPlayer,
  LocalPlayerDef,
  registerPlayerSystems,
} from "./player.js";
import {
  CameraDef,
  CameraFollowDef,
  registerCameraSystems,
  setCameraFollowPosition,
} from "../camera.js";
import { registerNetSystems } from "../net/net.js";
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
import { initGroundSystem, registerGroundSystems } from "./ground.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { createShip, registerShipSystems, ShipLocalDef } from "./ship.js";
import { registerBuildBulletsSystem, registerBulletUpdate } from "./bullet.js";
import { AssetsDef } from "./assets.js";
import { registerInitCanvasSystem } from "../canvas.js";
import {
  registerConstructRenderablesSystem,
  registerRenderer,
  registerRenderInitSystem,
  registerUpdateRendererWorldFrames,
  registerUpdateSmoothedWorldFrames,
  RendererDef,
} from "../render/renderer-ecs.js";
import { registerDeleteEntitiesSystem } from "../delete.js";
import { registerCannonSystems } from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import { registerToolSystems } from "./tool.js";
import {
  registerMotionSmoothingRecordLocationsSystem,
  registerMotionSmoothingSystems,
} from "../motion-smoothing.js";
import { registerCursorSystems } from "./cursor.js";
import { registerPhysicsSystems } from "../physics/phys.js";
import { registerNoodleSystem } from "./noodles.js";
import { registerUpdateLifetimes } from "./lifetime.js";
import { registerMusicSystems } from "../music.js";
import { registerNetDebugSystem } from "../net/net-debug.js";
import { callInitFns } from "../init.js";
import { registerGrappleDbgSystems } from "./grapple.js";
import { registerTurretSystems } from "./turret.js";
import { registerUISystems, TextDef } from "./ui.js";
import { DevConsoleDef, registerDevSystems } from "../console.js";
import { registerControllableSystems } from "./controllable.js";
import {
  GameStateDef,
  GameState,
  registerGameStateSystems,
} from "./gamestate.js";
import { MeDef } from "../net/components.js";
import { stdRenderPipeline, postProcess } from "../render/std-pipeline.js";
import { shadowPipeline } from "../render/std-shadow.js";

export const ScoreDef = EM.defineComponent("score", () => {
  return {
    maxScore: 0,
    currentScore: 0,
  };
});

function registerScoreSystems(em: EntityManager) {
  em.addSingletonComponent(ScoreDef);

  em.registerSystem(
    [ShipLocalDef, PositionDef],
    [ScoreDef, GameStateDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      if (ships.length) {
        const ship = ships.reduce(
          (p, n) => (n.position[2] > p.position[2] ? n : p),
          ships[0]
        );
        const currentScore = Math.round(ship.position[2] / 10);
        res.score.maxScore = Math.max(currentScore, res.score.maxScore);
        res.score.currentScore = currentScore;
      }
    },
    "updateScore"
  );
}

export function registerAllSystems(em: EntityManager) {
  registerNetSystems(em);
  registerInitCanvasSystem(em);
  registerUISystems(em);
  registerDevSystems(em);
  registerGameStateSystems(em);
  registerScoreSystems(em);
  registerRenderInitSystem(em);
  registerMusicSystems(em);
  registerHandleNetworkEvents(em);
  registerMotionSmoothingRecordLocationsSystem(em);
  registerUpdateSystem(em);
  registerPredictSystem(em);
  registerJoinSystems(em);
  registerGroundSystems(em);
  registerShipSystems(em);
  registerBuildBulletsSystem(em);
  registerCursorSystems(em);
  registerGrappleDbgSystems(em);
  registerInitTransforms(em);
  registerBoatSystems(em);
  registerControllableSystems(em);
  registerPlayerSystems(em);
  registerBulletUpdate(em);
  registerNoodleSystem(em);
  registerUpdateLifetimes(em);
  registerInteractionSystem(em);
  registerTurretSystems(em);
  registerCannonSystems(em);
  registerPhysicsSystems(em);
  registerBulletCollisionSystem(em);
  registerModeler(em);
  registerToolSystems(em);
  registerNetDebugSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerEventSystems(em);
  registerDeleteEntitiesSystem(em);
  registerMotionSmoothingSystems(em);
  registerUpdateSmoothedWorldFrames(em);
  registerUpdateRendererWorldFrames(em);
  registerCameraSystems(em);
  registerRenderViewController(em);
  registerConstructRenderablesSystem(em);
  registerRenderer(em);

  callInitFns(em);
}

function registerShipGameUI(em: EntityManager) {
  em.registerSystem(
    null,
    [TextDef, DevConsoleDef],
    (_, res) => {
      const avgFPS = 1000 / res.dev.avgFrameTime;
      const lowerTxt = `Belgus, you are the last hope of the Squindles, keep the gemheart alive! Failure is inevitable. move: WASD, mouse; cannon: e, left-click; fps:${avgFPS.toFixed(
        1
      )}`;
      res.text.lowerText = lowerTxt;
    },
    "shipUI"
  );
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

export function initShipGame(em: EntityManager, hosting: boolean) {
  registerShipGameUI(em);
  EM.addSingletonComponent(CameraDef);
  EM.addSingletonComponent(GameStateDef);

  initGroundSystem(em);

  if (hosting) {
    createShip();
  }
  // create player once MeDef is present (meaning we've joined, if
  // we're not the host)
  em.registerOneShotSystem(null, [MeDef], () => createPlayer(em));

  em.registerOneShotSystem(null, [RendererDef], (_, res) => {
    res.renderer.pipelines = [shadowPipeline, stdRenderPipeline, postProcess];
  });
}

function debugBoatParts(em: EntityManager) {
  let once = false;
  em.registerSystem(
    [],
    [AssetsDef],
    (_, res) => {
      if (once) return;
      once = true;

      // TODO(@darzu): this works!
      // const bigM = res.assets.boat_broken;
      // for (let i = 0; i < bigM.length; i++) {
      //   const e = em.newEntity();
      //   em.ensureComponentOn(e, RenderableConstructDef, bigM[i].mesh);
      //   em.ensureComponentOn(e, PositionDef, [0, 0, 0]);
      // }
    },
    "debugBoatParts"
  );
}
