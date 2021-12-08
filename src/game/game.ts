import { Component, EM, EntityManager } from "../entity-manager.js";
import { quat, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { _GAME_ASSETS } from "../main.js";
import { jitter } from "../math.js";
import {
  registerPhysicsSystems,
  registerUpdateSmoothingLerp,
  registerUpdateSmoothingTargetSmoothChange,
  registerUpdateSmoothingTargetSnapChange,
} from "../phys_esc.js";
import {
  registerAddMeshHandleSystem,
  registerRenderer,
  registerUpdateCameraView,
  registerUpdateTransforms,
} from "../renderer.js";
import {
  BoatConstructDef,
  registerBuildBoatsSystem,
  registerStepBoats,
} from "./boat.js";
import {
  CameraDef,
  PlayerConstructDef,
  registerBuildPlayersSystem,
  registerStepPlayers,
} from "./player.js";
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
import {
  registerBuildCubesSystem,
  registerMoveCubesSystem,
  CubeConstructDef,
} from "./cube.js";
import { registerTimeSystem } from "../time.js";
import { PlaneConstructDef, registerBuildPlanesSystem } from "./plane.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { registerBuildShipSystem, ShipConstructDef } from "./ship.js";
import {
  HatConstructDef,
  registerBuildHatSystem,
  registerHatPickupSystem,
  registerHatDropSystem,
} from "./hat.js";
import { registerBuildBulletsSystem } from "./bullet.js";
import { DARK_BLUE, LIGHT_BLUE } from "./assets.js";
import { registerInitCanvasSystem } from "../canvas.js";
import { registerRenderInitSystem, RendererDef } from "../render_init.js";
import { registerDeleteEntitiesSystem } from "../delete.js";
import {
  AmmunitionConstructDef,
  CannonConstructDef,
  registerBuildAmmunitionSystem,
  registerBuildCannonsSystem,
  registerPlayerCannonSystem,
  registerStepCannonsSystem,
} from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import { registerToolDropSystem, registerToolPickupSystem } from "./tool.js";
import { registerPhysicsDebuggerSystem } from "../phys_debug.js";

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
  em.addComponent(e.id, PlayerConstructDef, vec3.fromValues(5, 0, 0));

  // TODO(@darzu):  move _playerId to a LocalPlayer component or something
  _playerId = e.id;
}

function createGround(em: EntityManager) {
  // create checkered grid
  const NUM_PLANES_X = 10;
  const NUM_PLANES_Z = 10;
  for (let x = 0; x < NUM_PLANES_X; x++) {
    for (let z = 0; z < NUM_PLANES_Z; z++) {
      const xPos = (x - NUM_PLANES_X / 2) * 20 + 10;
      const zPos = (z - NUM_PLANES_Z / 2) * 20;
      const parity = !!((x + z) % 2);
      const loc = vec3.fromValues(
        xPos,
        x + z - (NUM_PLANES_X + NUM_PLANES_Z),
        zPos
      );
      const color = parity ? LIGHT_BLUE : DARK_BLUE;
      let { id } = em.newEntity();
      em.addComponent(id, PlaneConstructDef, loc, color);
    }
  }
}

// TODO(@darzu): for debugging
export let _playerId: number = -1;

// TODO(@darzu): integrate
export function registerAllSystems(em: EntityManager) {
  registerTimeSystem(em);
  registerNetSystems(em);
  registerInitCanvasSystem(em);
  registerRenderInitSystem(em);
  registerHandleNetworkEvents(em);
  registerUpdateSmoothingTargetSnapChange(em);
  registerUpdateSystem(em);
  registerPredictSystem(em);
  registerUpdateSmoothingTargetSmoothChange(em);
  registerJoinSystems(em);
  registerBuildPlayersSystem(em);
  registerBuildPlanesSystem(em);
  registerBuildCubesSystem(em);
  registerBuildBoatsSystem(em);
  registerBuildShipSystem(em);
  registerBuildHatSystem(em);
  registerBuildBulletsSystem(em);
  registerBuildCannonsSystem(em);
  registerBuildAmmunitionSystem(em);
  registerMoveCubesSystem(em);
  registerStepBoats(em);
  registerStepPlayers(em);
  registerInteractionSystem(em);
  registerStepCannonsSystem(em);
  registerPlayerCannonSystem(em);
  registerUpdateSmoothingLerp(em);
  registerPhysicsSystems(em);
  registerBulletCollisionSystem(em);
  registerModeler(em);
  registerHatPickupSystem(em);
  registerHatDropSystem(em);
  registerToolPickupSystem(em);
  registerToolDropSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerEventSystems(em);
  registerDeleteEntitiesSystem(em);
  registerUpdateTransforms(em);
  registerRenderViewController(em);
  registerUpdateCameraView(em);
  registerPhysicsDebuggerSystem(em);
  registerAddMeshHandleSystem(em);
  registerRenderer(em);
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

      // check render mode
      if (inputs.keyClicks["3"]) {
        camera.perspectiveMode = "perspective";
      } else if (inputs.keyClicks["4"]) {
        camera.perspectiveMode = "ortho";
      }
    }
  );
}

export function initGame(em: EntityManager) {
  // init camera
  createCamera(em);
}

export function createServerObjects(em: EntityManager) {
  let { id: cubeId } = em.newEntity();
  em.addComponent(cubeId, CubeConstructDef, 3, LIGHT_BLUE);

  createPlayer(em);
  createGround(em);
  createBoats(em);
  createShips(em);
  createHats(em);
  createCannons(em);
}
export function createLocalObjects(em: EntityManager) {
  createPlayer(em);
}

function createCamera(em: EntityManager) {
  let cameraRotation = quat.identity(quat.create());
  quat.rotateX(cameraRotation, cameraRotation, -Math.PI / 8);
  let cameraLocation = vec3.fromValues(0, 0, 10);

  let camera = EM.addSingletonComponent(CameraDef);
  camera.rotation = cameraRotation;
  camera.location = cameraLocation;
}
function createShips(em: EntityManager) {
  const rot = quat.create();
  quat.rotateY(rot, rot, Math.PI * -0.4);
  em.addComponent(em.newEntity().id, ShipConstructDef, [-40, -10, -60], rot);
}
function createBoats(em: EntityManager) {
  // create boat(s)
  const BOAT_COUNT = 4;
  for (let i = 0; i < BOAT_COUNT; i++) {
    const boatCon = em.addComponent(em.newEntity().id, BoatConstructDef);
    boatCon.location[1] = -9;
    boatCon.location[0] = (Math.random() - 0.5) * 20 - 10;
    boatCon.location[2] = (Math.random() - 0.5) * 20 - 20;
    boatCon.speed = 0.01 + jitter(0.01);
    boatCon.wheelSpeed = jitter(0.002);
    boatCon.wheelDir = 0;
  }
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

function createCannons(em: EntityManager) {
  em.addComponent(em.newEntity().id, CannonConstructDef, [-40, 10, 0]);
  em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -9, 0], 3);
}
