import { Component, EM, EntityManager } from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { jitter } from "../math.js";
import {
  registerPhysicsStateInit,
  registerUpdateWorldAABBs,
  registerPhysicsContactSystems,
  registerUpdateWorldFromPosRotScale,
  registerUpdateLocalPhysicsAfterRebound,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import {
  registerAddMeshHandleSystem,
  registerRenderer,
  registerUpdateCameraView,
  RenderableDef,
} from "../renderer.js";
import {
  PositionDef,
  registerInitTransforms,
  registerUpdateLocalFromPosRotScale,
  registerUpdateWorldFromLocalAndParent,
  RotationDef,
  ScaleDef,
  TransformDef,
  updateFrameFromTransform,
} from "../physics/transform.js";
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
import {
  AssetsDef,
  DARK_BLUE,
  LIGHT_BLUE,
  registerAssetLoader,
} from "./assets.js";
import { registerInitCanvasSystem } from "../canvas.js";
import { registerRenderInitSystem, RendererDef } from "../render_init.js";
import { registerDeleteEntitiesSystem } from "../delete.js";
import {
  AmmunitionConstructDef,
  CannonConstructDef,
  LinstockConstructDef,
  registerBuildAmmunitionSystem,
  registerBuildCannonsSystem,
  registerBuildLinstockSystem,
  registerPlayerCannonSystem,
  registerStepCannonsSystem,
} from "./cannon.js";
import { registerInteractionSystem } from "./interact.js";
import { registerModeler } from "./modeler.js";
import { registerToolDropSystem, registerToolPickupSystem } from "./tool.js";
import { registerPhysicsDebuggerSystem } from "../physics/phys-debug.js";
import {
  registerUpdateSmoothingTargetSnapChange,
  registerUpdateSmoothingTargetSmoothChange,
  registerUpdateSmoothingLerp,
  registerUpdateSmoothedTransform,
} from "../smoothing.js";
import { registerBuildCursor } from "./cursor.js";
import { ColliderDef } from "../physics/collider.js";
import { AuthorityDef, MeDef, SyncDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import {
  registerPhysicsApplyAngularVelocity,
  registerPhysicsApplyLinearVelocity,
  registerPhysicsClampVelocityByContact,
  registerPhysicsClampVelocityBySize,
} from "../physics/velocity-system.js";
import { registerPhysicsSystems } from "../physics/phys.js";

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

const WorldPlaneConstDef = EM.defineComponent("worldPlane", (t?: mat4) => {
  return {
    transform: t ?? mat4.create(),
  };
});
EM.registerSerializerPair(
  WorldPlaneConstDef,
  (o, buf) => buf.writeMat4(o.transform),
  (o, buf) => buf.readMat4(o.transform)
);

function createWorldPlanes(em: EntityManager) {
  const ts = [
    mat4.fromRotationTranslationScale(
      mat4.create(),
      quat.fromEuler(quat.create(), 0, 0, Math.PI * 0.5),
      [100, 50, -100],
      [10, 10, 10]
    ),
    mat4.fromRotationTranslationScale(
      mat4.create(),
      quat.fromEuler(quat.create(), 0, 0, 0),
      [0, -1000, -0],
      [100, 100, 100]
    ),
    mat4.fromRotationTranslationScale(
      mat4.create(),
      quat.fromEuler(quat.create(), 0, 0, Math.PI * 1),
      [10, -2, 10],
      [0.2, 0.2, 0.2]
    ),
  ];

  for (let t of ts) {
    em.ensureComponentOn(em.newEntity(), WorldPlaneConstDef, t);
  }
}

function registerBuildWorldPlanes(em: EntityManager) {
  em.registerSystem(
    [WorldPlaneConstDef],
    [AssetsDef, MeDef],
    (es, res) => {
      for (let e of es) {
        if (FinishedDef.isOn(e)) continue;
        em.ensureComponentOn(e, TransformDef, e.worldPlane.transform);
        em.ensureComponentOn(e, ColorDef, [1, 0, 1]);
        em.ensureComponentOn(e, RenderableDef, res.assets.gridPlane.mesh);
        em.ensureComponentOn(e, ColliderDef, {
          shape: "AABB",
          solid: true,
          aabb: res.assets.gridPlane.aabb,
        });
        em.ensureComponentOn(e, SyncDef, [WorldPlaneConstDef.id], []);
        em.ensureComponentOn(e, AuthorityDef, res.me.pid);
        em.ensureComponentOn(e, FinishedDef);
      }
    },
    "buildWorldPlanes"
  );
}

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
  registerAssetLoader(em);
  registerBuildPlayersSystem(em);
  registerBuildPlanesSystem(em);
  registerBuildWorldPlanes(em);
  registerBuildCubesSystem(em);
  registerBuildBoatsSystem(em);
  registerBuildShipSystem(em);
  registerBuildHatSystem(em);
  registerBuildBulletsSystem(em);
  registerBuildCannonsSystem(em);
  registerBuildAmmunitionSystem(em);
  registerBuildLinstockSystem(em);
  registerBuildCursor(em);
  registerInitTransforms(em);
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
  // TODO(@darzu): confirm this all works
  // registerUpdateSmoothedTransform(em);
  registerRenderViewController(em);
  registerUpdateCameraView(em);
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

export function initGame(em: EntityManager) {
  // init camera
  createCamera(em);
}

export function createServerObjects(em: EntityManager) {
  // let { id: cubeId } = em.newEntity();
  // em.addComponent(cubeId, CubeConstructDef, 3, LIGHT_BLUE);

  createPlayer(em);
  createGround(em);
  createBoats(em);
  createShips(em);
  createHats(em);
  createCannons(em);
  createWorldPlanes(em);
}
export function createLocalObjects(em: EntityManager) {
  createPlayer(em);
}

function createCamera(_em: EntityManager) {
  EM.addSingletonComponent(CameraDef);
}
function createShips(em: EntityManager) {
  const rot = quat.create();
  // quat.rotateY(rot, rot, Math.PI * -0.4);
  // const pos: vec3 = [-40, -10, -60];
  const pos: vec3 = [0, 50, 0];
  em.addComponent(em.newEntity().id, ShipConstructDef, pos, rot);
}
function createBoats(em: EntityManager) {
  // create boat(s)
  const BOAT_COUNT = 10;
  for (let i = 0; i < BOAT_COUNT; i++) {
    const boatCon = em.addComponent(em.newEntity().id, BoatConstructDef);
    boatCon.location[1] = -9;
    boatCon.location[0] = (Math.random() - 0.5) * 40 - 20;
    boatCon.location[2] = (Math.random() - 0.5) * 40 - 20;
    boatCon.speed = 0.005 + jitter(0.005);
    boatCon.wheelSpeed = jitter(0.001);
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
  em.addComponent(em.newEntity().id, CannonConstructDef, [-50, -10, 0]);
  em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
  em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
}
