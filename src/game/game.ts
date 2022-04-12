import { Component, EM, EntityManager } from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import {
  registerConstructRenderablesSystem,
  registerRenderer,
  registerUpdateCameraView,
  registerUpdateRendererWorldFrames,
  RenderableConstructDef,
} from "../render/renderer.js";
import {
  PositionDef,
  registerInitTransforms,
  TransformDef,
} from "../physics/transform.js";
import { BoatPropsDef, registerBoatSystems } from "./boat.js";
import {
  LocalPlayerDef,
  PlayerConstructDef,
  registerBuildPlayersSystem,
  registerStepPlayers,
} from "./player.js";
import { CameraDef, registerRetargetCameraSystems } from "../camera.js";
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
import { PhysicsTimerDef, registerTimeSystem } from "../time.js";
import {
  GroundPropsDef,
  GroundSystemDef,
  initGroundSystem,
  registerGroundSystems,
} from "./ground.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { createShip, registerShipSystems, ShipLocalDef } from "./ship.js";
import { HatConstructDef } from "./hat.js";
import { registerBuildBulletsSystem, registerBulletUpdate } from "./bullet.js";
import {
  AssetsDef,
  GROUNDSIZE,
  LIGHT_BLUE,
  registerAssetLoader,
} from "./assets.js";
import { registerInitCanvasSystem } from "../canvas.js";
import {
  registerRenderInitSystem,
  RendererDef,
} from "../render/render_init.js";
import { registerDeleteEntitiesSystem } from "../delete.js";
import { registerCannonSystems } from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import { registerToolSystems } from "./tool.js";
import { registerMotionSmoothingSystems } from "../motion-smoothing.js";
import { registerBuildCursor } from "./cursor.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { registerPhysicsSystems } from "../physics/phys.js";
import { registerNoodleSystem } from "./noodles.js";
import { registerUpdateLifetimes } from "./lifetime.js";
import { registerMusicSystems } from "../music.js";
import { GameState, GameStateDef } from "./gamestate.js";
import { registerRestartSystem } from "./restart.js";
import { registerNetDebugSystem } from "../net/net-debug.js";
import { assert } from "../test.js";
import { callInitFns } from "../init.js";
import { registerGrappleDbgSystems } from "./grapple.js";
import { registerTurretSystems } from "./turret.js";
import {
  registerBuildAmmunitionSystem,
  registerBuildLinstockSystem,
} from "./ammo.js";

export const ColorDef = EM.defineComponent(
  "color",
  (c?: vec3) => c ?? vec3.create()
);
export type Color = Component<typeof ColorDef>;

EM.registerSerializerPair(
  ColorDef,
  (o, writer) => {
    writer.writeVec3(o);
  },
  (o, reader) => {
    reader.readVec3(o);
  }
);

function createPlayer(em: EntityManager) {
  const e = em.newEntity();
  em.addComponent(e.id, PlayerConstructDef, vec3.fromValues(0, 100, 0));
  em.addSingletonComponent(LocalPlayerDef, e.id);
}

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
    [ScoreDef],
    (ships, res) => {
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
  registerTimeSystem(em);
  registerNetSystems(em);
  registerInitCanvasSystem(em);
  registerUISystems(em);
  registerScoreSystems(em);
  registerRenderInitSystem(em);
  registerMusicSystems(em);
  registerHandleNetworkEvents(em);
  registerUpdateSystem(em);
  registerPredictSystem(em);
  registerJoinSystems(em);
  registerAssetLoader(em);
  registerBuildPlayersSystem(em);
  registerGroundSystems(em);
  registerShipSystems(em);
  registerBuildBulletsSystem(em);
  registerBuildAmmunitionSystem(em);
  registerBuildLinstockSystem(em);
  registerBuildCursor(em);
  registerGrappleDbgSystems(em);
  registerInitTransforms(em);
  registerBoatSystems(em);
  registerStepPlayers(em);
  registerBulletUpdate(em);
  registerNoodleSystem(em);
  registerUpdateLifetimes(em);
  registerInteractionSystem(em);
  // registerStepCannonsSystem(em);
  registerTurretSystems(em);
  registerCannonSystems(em);
  registerPhysicsSystems(em);
  registerRetargetCameraSystems(em);
  registerMotionSmoothingSystems(em);
  registerBulletCollisionSystem(em);
  registerModeler(em);
  registerToolSystems(em);
  registerNetDebugSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerEventSystems(em);
  registerRestartSystem(em);
  registerDeleteEntitiesSystem(em);
  // TODO(@darzu): confirm this all works
  registerRenderViewController(em);
  registerUpdateCameraView(em);
  registerConstructRenderablesSystem(em);
  registerUpdateRendererWorldFrames(em);
  registerRenderer(em);

  callInitFns(em);
}

export const TextDef = EM.defineComponent("text", () => {
  return {
    setText: (s: string) => {},
  };
});

export function registerUISystems(em: EntityManager) {
  const txt = em.addSingletonComponent(TextDef);

  const titleDiv = document.getElementById("title-div") as HTMLDivElement;

  txt.setText = (s: string) => {
    titleDiv.firstChild!.nodeValue = s;
  };
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
        if (camera.cameraMode === "thirdPerson")
          camera.cameraMode = "thirdPersonOverShoulder";
        else camera.cameraMode = "thirdPerson";
      }
    },
    "renderView"
  );
}

export function initGame(em: EntityManager, hosting: boolean) {
  // init camera
  createCamera(em);

  // TODO(@darzu): DEBUGGING
  // debugCreateNoodles(em);
  // debugBoatParts(em);

  if (hosting) {
    createHostObjects(EM);
  }
  createLocalObjects(EM);
}

export function initDbgGame(em: EntityManager, hosting: boolean) {
  // init camera
  createCamera(em);

  // TODO(@darzu): DEBUGGING
  // debugCreateNoodles(em);
  // debugBoatParts(em);

  createPlayer(em);
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

export function createHostObjects(em: EntityManager) {
  // let { id: cubeId } = em.newEntity();
  // em.addComponent(cubeId, CubeConstructDef, 3, LIGHT_BLUE);

  em.addSingletonComponent(GameStateDef);
  // createGround(em);
  registerBoatSpawnerSystem(em);
  createShip();
  // createHats(em);
  // createWorldPlanes(em);
}
export function createLocalObjects(em: EntityManager) {
  createPlayer(em);
  initGroundSystem(em);
}

function createCamera(_em: EntityManager) {
  EM.addSingletonComponent(CameraDef);
}

export const BoatSpawnerDef = EM.defineComponent("boatSpawner", () => ({
  timerMs: 3000,
  timerIntervalMs: 5000,
}));

function registerBoatSpawnerSystem(em: EntityManager) {
  em.addSingletonComponent(BoatSpawnerDef);

  em.registerSystem(
    null,
    [BoatSpawnerDef, PhysicsTimerDef, GroundSystemDef, GameStateDef, MeDef],
    (_, res) => {
      if (!res.me.host) return;
      if (res.gameState.state !== GameState.PLAYING) return;
      const ms = res.physicsTimer.period * res.physicsTimer.steps;
      res.boatSpawner.timerMs -= ms;
      // console.log("res.boatSpawner.timerMs:" + res.boatSpawner.timerMs);
      if (res.boatSpawner.timerMs < 0) {
        res.boatSpawner.timerMs = res.boatSpawner.timerIntervalMs;
        // ramp up difficulty
        res.boatSpawner.timerIntervalMs *= 0.97;
        // ~1 second minimum
        res.boatSpawner.timerIntervalMs = Math.max(
          1500,
          res.boatSpawner.timerIntervalMs
        );

        // console.log("boat ");
        // create boat(s)
        const boatCon = em.addComponent(em.newEntity().id, BoatPropsDef);
        const left = Math.random() < 0.5;
        const z = res.groundSystem.nextScore * 10 + 100;
        boatCon.location = vec3.fromValues(
          -(Math.random() * 0.5 + 0.5) * GROUNDSIZE,
          10,
          z
        );
        boatCon.speed = 0.005 + jitter(0.002);
        boatCon.wheelDir = (Math.PI / 2) * (1 + jitter(0.1));
        boatCon.wheelSpeed = jitter(0.0001);
        if (left) {
          boatCon.location[0] *= -1;
          boatCon.speed *= -1;
          boatCon.wheelDir *= -1;
        }
        // boatCon.wheelSpeed = 0;
      }
    },
    "spawnBoats"
  );
}

function createHats(em: EntityManager) {
  const BOX_STACK_COUNT = 10;
  for (let i = 0; i < BOX_STACK_COUNT; i++) {
    const loc = vec3.fromValues(
      Math.random() * -10 + 10 - 5,
      0,
      Math.random() * -10 - 5
    );
    em.addComponent(em.newEntity().id, HatConstructDef, loc);
  }
}
