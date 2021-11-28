import { Component, EM, Entity, EntityManager } from "../entity-manager.js";
import { TimeDef } from "../time.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { importObj, HAT_OBJ, isParseError } from "../import_obj.js";
import { InputsDef } from "../inputs.js";
import { _GAME_ASSETS, _renderer } from "../main.js";
import { jitter } from "../math.js";
import {
  unshareProvokingVertices,
  getAABBFromMesh,
  Mesh,
  MeshHandle,
  MeshHandleDef,
  scaleMesh,
  scaleMesh3,
} from "../mesh-pool.js";
import {
  PhysicsResultsDef,
  PhysicsStateDef,
  registerPhysicsSystems,
  registerUpdateSmoothingLerp,
  registerUpdateSmoothingTargetSmoothChange,
  registerUpdateSmoothingTargetSnapChange,
} from "../phys_esc.js";
import { Motion, copyMotionProps, MotionDef } from "../phys_motion.js";
import {
  MotionSmoothingDef,
  ParentDef,
  registerAddMeshHandleSystem,
  registerRenderer,
  registerUpdatePlayerView,
  registerUpdateTransforms,
  RenderableDef,
  TransformDef,
} from "../renderer.js";
import { Renderer } from "../render_webgpu.js";
import { Serializer, Deserializer } from "../serialize.js";
import { GameObject, GameEvent, GameState, InWorldDef } from "../state.js";
import { never } from "../util.js";
import {
  Boat,
  BoatConstructDef,
  BoatDef,
  registerBuildBoatsSystem,
  registerStepBoats,
} from "./boat.js";
import {
  CameraDef,
  CameraProps,
  PlayerConstructDef,
  PlayerEnt,
  PlayerEntDef,
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
import { registerEventSystems } from "../net/events.js";
import {
  registerBuildCubesSystem,
  registerMoveCubesSystem,
  CubeConstructDef,
} from "./cube.js";
import { registerTimeSystem, addTimeComponents } from "../time.js";
import { PlaneConstructDef, registerBuildPlanesSystem } from "./plane.js";
import { registerItemPickupSystem } from "./pickup.js";
import { registerBulletCollisionSystem } from "./bullet-collision.js";
import { registerBuildShipSystem, ShipConstructDef } from "./ship.js";
import { HatConstructDef, registerBuildHatSystem } from "./hat.js";
import { registerBuildBulletsSystem } from "./bullet.js";

enum ObjectType {
  Plane,
  Player,
  Bullet,
  Boat,
  Hat,
  Ship,
}

enum EventType {
  BulletBulletCollision,
  BulletPlayerCollision,
  HatGet,
  HatDrop,
}

const BLACK = vec3.fromValues(0, 0, 0);
const PLANE_MESH = unshareProvokingVertices(
  scaleMesh(
    {
      pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
      ],
      tri: [
        [0, 2, 3],
        [0, 3, 1], // top
        [3, 2, 0],
        [1, 3, 0], // bottom
      ],
      lines: [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ],
      colors: [BLACK, BLACK, BLACK, BLACK],
    },
    10
  )
);
const PLANE_AABB = getAABBFromMesh(PLANE_MESH);

const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);
class Plane extends GameObject {
  set color(v: vec3) {
    vec3.copy(this._color, v);
  }

  _color: vec3;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this._color = EM.addComponent(e.id, ColorDef);
    vec3.copy(this._color, DARK_GRAY);
    this.collider = {
      shape: "AABB",
      solid: true,
      aabb: PLANE_AABB,
    };
    this.renderable.mesh = PLANE_MESH;
  }

  typeId(): number {
    return ObjectType.Plane;
  }

  syncPriority(firstSync: boolean) {
    return firstSync ? 20000 : 1;
  }
}

export const CUBE_MESH = unshareProvokingVertices({
  pos: [
    [+1.0, +1.0, +1.0],
    [-1.0, +1.0, +1.0],
    [-1.0, -1.0, +1.0],
    [+1.0, -1.0, +1.0],

    [+1.0, +1.0, -1.0],
    [-1.0, +1.0, -1.0],
    [-1.0, -1.0, -1.0],
    [+1.0, -1.0, -1.0],
  ],
  tri: [
    [0, 1, 2],
    [0, 2, 3], // front
    [4, 5, 1],
    [4, 1, 0], // top
    [3, 4, 0],
    [3, 7, 4], // right
    [2, 1, 5],
    [2, 5, 6], // left
    [6, 3, 2],
    [6, 7, 3], // bottom
    [5, 4, 7],
    [5, 7, 6], // back
  ],
  lines: [
    // top
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    // bottom
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    // connectors
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ],
  colors: [
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
    BLACK,
  ],
});
const CUBE_AABB = getAABBFromMesh(CUBE_MESH);

export const ColorDef = EM.defineComponent(
  "color",
  (c?: vec3) => c ?? vec3.create()
);
export type Color = Component<typeof ColorDef>;

function serializeColor(o: Color, buf: Serializer) {
  buf.writeVec3(o);
}
function deserializeColor(o: Color, buf: Deserializer) {
  buf.readVec3(o);
}
EM.registerSerializerPair(ColorDef, serializeColor, deserializeColor);

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
  registerEventSystems(em);
  registerHandleNetworkEvents(em);
  registerUpdateSmoothingTargetSnapChange(em);
  registerUpdateSystem(em);
  registerUpdateSmoothingTargetSmoothChange(em);
  registerJoinSystems(em);
  registerBuildPlayersSystem(em);
  registerBuildPlanesSystem(em);
  registerBuildCubesSystem(em);
  registerBuildBoatsSystem(em);
  registerBuildShipSystem(em);
  registerBuildHatSystem(em);
  registerBuildBulletsSystem(em);
  registerMoveCubesSystem(em);
  registerStepBoats(em);
  registerStepPlayers(em);
  registerUpdateSmoothingLerp(em);
  registerPhysicsSystems(em);
  registerBulletCollisionSystem(em);
  registerItemPickupSystem(em);
  registerAckUpdateSystem(em);
  registerSyncSystem(em);
  registerSendOutboxes(em);
  registerUpdateTransforms(em);
  registerRenderViewController(em);
  registerUpdatePlayerView(em);
  registerAddMeshHandleSystem(em);
  registerRenderer(em);
}

function registerRenderViewController(em: EntityManager) {
  em.registerSystem([], [TimeDef, InputsDef], (_, { time, inputs }) => {
    // check render mode
    if (inputs.keyClicks["1"]) {
      _renderer.wireMode = "normal";
    } else if (inputs.keyClicks["2"]) {
      _renderer.wireMode = "wireframe";
    }

    // check render mode
    if (inputs.keyClicks["3"]) {
      _renderer.perspectiveMode = "perspective";
    } else if (inputs.keyClicks["4"]) {
      _renderer.perspectiveMode = "ortho";
    }
  });
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
