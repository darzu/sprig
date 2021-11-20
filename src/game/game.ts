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
import { Boat, BoatDef, registerStepBoats } from "./boat.js";
import {
  CameraDef,
  CameraProps,
  PlayerEnt,
  PlayerEntDef,
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
  CubeConstruct,
  CubeConstructDef,
} from "./cube.js";
import { registerTimeSystem, addTimeComponents } from "../time.js";
import { ColliderDef } from "../collider.js";
import { PlaneConstructDef, registerBuildPlanesSystem } from "./plane.js";
import { registerItemPickupSystem } from "./pickup.js";

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

const CUBE_MESH = unshareProvokingVertices({
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

abstract class Cube extends GameObject {
  set color(v: vec3) {
    vec3.copy(this._color, v);
  }

  _color: vec3;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this._color = EM.addComponent(e.id, ColorDef);
    vec3.copy(this._color, vec3.fromValues(0.2, 0, 0));
    this.collider = {
      shape: "AABB",
      solid: true,
      aabb: CUBE_AABB,
    };
    this.renderable.mesh = CUBE_MESH;
  }
}

export const BULLET_MESH = scaleMesh(CUBE_MESH, 0.3);

export const BulletDef = EM.defineComponent("bullet", () => true);
export class Bullet extends Cube {
  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0.3, 0.3, 0.8);
    this.collider = {
      shape: "AABB",
      solid: false,
      aabb: getAABBFromMesh(this.mesh()),
    };
    this.renderable.mesh = scaleMesh(super.mesh(), 0.3);
  }

  typeId(): number {
    return ObjectType.Bullet;
  }

  // TODO(@darzu): what to do about bullet location-only syncing on bullets
}

let _hatMesh: Mesh | null = null;

export const HatDef = EM.defineComponent("hat", () => true);

export class HatClass extends Cube {
  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
    this.collider = {
      shape: "AABB",
      solid: false,
      aabb: getAABBFromMesh(this.mesh()),
    };

    EM.addComponent(e.id, HatDef);

    if (!_hatMesh) {
      const hatRaw = importObj(HAT_OBJ);
      if (isParseError(hatRaw)) throw hatRaw;
      const hat = unshareProvokingVertices(hatRaw);
      _hatMesh = hat;
    }
    this.renderable.mesh = _hatMesh;
  }

  typeId(): number {
    return ObjectType.Hat;
  }
}

function createPlayer(em: EntityManager) {
  const e = em.newEntity();

  em.addComponent(e.id, MotionDef, vec3.fromValues(5, 0, 0));
  em.addComponent(e.id, MotionSmoothingDef);
  em.addComponent(e.id, TransformDef);
  em.addComponent(e.id, ParentDef);
  em.addComponent(e.id, RenderableDef, CUBE_MESH);
  const meshHandle = _renderer.addMesh(CUBE_MESH);
  em.addComponent(e.id, MeshHandleDef, meshHandle);
  em.addComponent(e.id, PhysicsStateDef);
  em.addComponent(e.id, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: CUBE_AABB,
  });
  em.addComponent(e.id, InWorldDef, true);
  em.addComponent(e.id, PlayerEntDef, 0.1);
  em.addComponent(e.id, ColorDef, vec3.fromValues(0, 0.2, 0));

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

export class PlayerClass extends Cube {
  hat: number;

  // ECS shims:
  _player: PlayerEnt;

  get player() {
    return this._player;
  }
  get interactingWith() {
    return this._player.interactingWith;
  }
  get dropping() {
    return this._player.dropping;
  }

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0, 0.2, 0);
    this.hat = 0;

    const playerEnt = EM.addComponent(e.id, PlayerEntDef);
    this._player = playerEnt;
  }

  syncPriority(_firstSync: boolean): number {
    return 10000;
  }

  typeId(): number {
    return ObjectType.Player;
  }

  // mesh(): Mesh {
  //   // TODO(@darzu): player is ship
  //   const ship = _GAME_ASSETS?.ship!;
  //   return scaleMesh(ship, 0.1);

  //   // TODO(@darzu): player is hat
  //   // const hatRaw = importObj(HAT_OBJ);
  //   // if (isParseError(hatRaw)) throw hatRaw;
  //   // const hat = unshareProvokingVertices(hatRaw);
  //   // return hat;
  //   // const hat2Str = exportObj(hat);
  //   // const hat2 = importObj(hat2Str);
  //   // if (isParseError(hat2)) throw hat2;
  //   // return unshareProvokingVertices(hat2);
  // }
}

class Ship extends Cube {
  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0.3, 0.3, 0.1);
    // TODO(@darzu): we need colliders for this ship
    this.collider = {
      shape: "AABB",
      solid: true,
      aabb: {
        min: [0, 0, 0],
        max: [0, 0, 0],
      },
    };

    this.renderable.mesh = _GAME_ASSETS?.ship!;
  }

  typeId(): number {
    return ObjectType.Ship;
  }
}

class BoatClass extends Cube {
  public boat: Boat;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0.2, 0.1, 0.05);
    this.renderable.mesh = scaleMesh3(super.mesh(), [5, 0.3, 2.5]);
    this.collider = {
      shape: "AABB",
      solid: true,
      aabb: getAABBFromMesh(this.mesh()),
    };
    this.boat = BoatDef.construct();
  }

  typeId(): number {
    return ObjectType.Boat;
  }
}

// TODO(@darzu): for debugging
export let _playerId: number = -1;

// TODO(@darzu): integrate
export function registerAllSystems(em: EntityManager) {
  registerTimeSystem(EM);
  registerNetSystems(EM);
  registerEventSystems(EM);
  registerHandleNetworkEvents(EM);
  registerUpdateSmoothingTargetSnapChange(EM);
  registerUpdateSystem(EM);
  registerUpdateSmoothingTargetSmoothChange(EM);
  registerJoinSystems(EM);
  registerBuildPlanesSystem(EM);
  registerBuildCubesSystem(EM);
  registerMoveCubesSystem(EM);
  registerStepBoats(EM);
  registerStepPlayers(EM);
  registerUpdateSmoothingLerp(EM);
  registerPhysicsSystems(EM);
  registerBulletCollisionHandler(EM);
  registerItemPickupSystem(EM);
  registerAckUpdateSystem(EM);
  registerSyncSystem(EM);
  registerSendOutboxes(EM);
  registerUpdateTransforms(EM);
  registerRenderViewController(EM);
  registerUpdatePlayerView(EM);
  registerAddMeshHandleSystem(EM);
  registerRenderer(EM);
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

export let _bulletProto: MeshHandle;
export function initGame(em: EntityManager) {
  // re-usable bullet mesh
  _bulletProto = _renderer.addMesh(BULLET_MESH);
  mat4.copy(_bulletProto.transform, new Float32Array(16)); // zero the transforms so it doesn't render

  // init camera
  createCamera(em);
}

export function createGameObjects(em: EntityManager) {
  let { id: cubeId } = em.newEntity();
  em.addComponent(cubeId, CubeConstructDef, 3, LIGHT_BLUE);

  createPlayer(em);
  createGround(em);
}

export class CubeGameState extends GameState {
  players: Record<number, PlayerClass>;

  constructor(renderer: Renderer, createObjects: boolean = true) {
    super(renderer);

    // TODO(@darzu): can we do without this lame javascript-ism?
    // this.spawnBullet = this.spawnBullet.bind(this);

    this.me = 0;

    this.players = {};

    this.me = 0;
  }

  playerObject(playerId: number): GameObject {
    let p = new PlayerClass(EM.newEntity(), this.me);
    p.authority = playerId;
    p.authority_seq = 1;
    return p;
  }

  objectOfType(typeId: ObjectType, id: number, creator: number): GameObject {
    const e = EM.registerEntity(id);

    switch (typeId) {
      case ObjectType.Plane:
        return new Plane(e, creator);
      case ObjectType.Bullet:
        return new Bullet(e, creator);
      case ObjectType.Player:
        return new PlayerClass(e, creator);
      case ObjectType.Boat:
        return new BoatClass(e, creator);
      case ObjectType.Hat:
        return new HatClass(e, creator);
      case ObjectType.Ship:
        return new Ship(e, creator);
      default:
        return never(typeId, `No such object type ${typeId}`);
    }
  }

  addObject(obj: GameObject) {
    super.addObject(obj);
    if (obj instanceof PlayerClass) {
      this.players[obj.authority] = obj;
    }
  }
  addObjectInstance(obj: GameObject, otherMesh: MeshHandle) {
    super.addObjectInstance(obj, otherMesh);
    if (obj instanceof PlayerClass) {
      this.players[obj.authority] = obj;
    }
  }

  stepGame(dt: number) {
    // TODO(@darzu): this should all be a system
    const { inputs } = EM.findSingletonEntity(InputsDef)!;
  }

  handleCollisions() {
    // TODO(@darzu): PARTLY RE-WORKED! See below
  }

  eventAuthority(type: EventType, objects: GameObject[]) {
    switch (type) {
      // Players always have authority over bullets that hit them
      case EventType.BulletPlayerCollision:
        return objects[0].authority;
      // Players always have authority over getting a hat
      case EventType.HatGet:
        return objects[0].authority;
      // Players always have authority over dropping a hat
      case EventType.HatDrop:
        return objects[0].authority;
      default:
        return super.eventAuthority(type, objects);
    }
  }

  legalEvent(event: GameEvent): boolean {
    switch (event.type) {
      case EventType.BulletPlayerCollision:
        return !this.getObject(event.objects[0])!.deleted;
      case EventType.BulletBulletCollision:
        return (
          !this.getObject(event.objects[0])!.deleted &&
          !this.getObject(event.objects[1])!.deleted
        );
      case EventType.HatGet:
        return this.getObject(event.objects[1])!.inWorld;
      case EventType.HatDrop:
        return (
          (this.getObject(event.objects[0]) as PlayerClass).hat ===
          event.objects[1]
        );
      default:
        return super.legalEvent(event);
    }
  }

  runEvent(event: GameEvent) {
    // return; // TODO(@darzu): DEBUG, this is very slow when done with >100s of objs.
    // console.log(`Running event of type ${EventType[event.type]}`);
    switch (event.type as EventType) {
      case EventType.BulletBulletCollision:
        for (let id of event.objects) {
          let obj = this.getObject(id);
          if (obj && obj instanceof Bullet) {
            // delete all bullet objects in collision
            // TODO: figure out how object deletion should really work
            this.removeObject(obj);
          }
        }
        break;
      case EventType.BulletPlayerCollision:
        // TODO: this code is unnecessarily complicated--the player is always
        // the first object, bullet is second
        for (let id of event.objects) {
          let obj = this.getObject(id);
          if (obj && obj instanceof Bullet) {
            // delete all bullet objects in collision
            // TODO: figure out how object deletion should really work
            this.removeObject(obj);
          } else if (obj && obj instanceof PlayerClass) {
            vec3.add(obj.color, obj.color, vec3.fromValues(0.1, 0, 0));
          }
        }
        break;
      case EventType.HatGet: {
        let player = this.getObject(event.objects[0]) as PlayerClass;
        let hat = this.getObject(event.objects[1]) as HatClass;
        hat.parent = player.id;
        hat.inWorld = false;
        vec3.set(hat.motion.location, 0, 1, 0);
        player.hat = hat.id;
        break;
      }
      case EventType.HatDrop: {
        let player = this.getObject(event.objects[0]) as PlayerClass;
        let hat = this.getObject(event.objects[1]) as HatClass;
        hat.inWorld = true;
        hat.parent = 0;
        vec3.copy(hat.motion.location, event.location!);
        player.hat = 0;
        break;
      }
      default:
        throw `Bad event type ${event.type} for event ${event.id}`;
    }
  }
}

// const meshHandle = _renderer.addMesh(obj.mesh());
// EM.addComponent(obj.entity.id, MeshHandleDef, meshHandle);

function createCamera(em: EntityManager) {
  let cameraRotation = quat.identity(quat.create());
  quat.rotateX(cameraRotation, cameraRotation, -Math.PI / 8);
  let cameraLocation = vec3.fromValues(0, 0, 10);

  let camera = EM.addSingletonComponent(CameraDef);
  camera.rotation = cameraRotation;
  camera.location = cameraLocation;
}
function createShip(em: EntityManager, creator: number) {
  // create ship
  const ship = new Ship(EM.newEntity(), creator);
  ship.motion.location[0] = -40;
  ship.motion.location[1] = -10;
  ship.motion.location[2] = -60;
  quat.rotateY(ship.motion.rotation, ship.motion.rotation, Math.PI * -0.4);
  // addObject(ship);
}
function createCubeStack(em: EntityManager, creator: number) {
  // create stack of boxes
  const BOX_STACK_COUNT = 10;
  for (let i = 0; i < BOX_STACK_COUNT; i++) {
    let b = new HatClass(EM.newEntity(), creator);
    // b.motion.location = vec3.fromValues(0, 5 + i * 2, -2);
    b.motion.location = vec3.fromValues(
      Math.random() * -10 + 10 - 5,
      0,
      Math.random() * -10 - 5
    );
    // addObject(b);
    // TODO(@darzu): debug
    console.log(`box: ${b.id}`);
  }
}
// function createPlayer(em: EntityManager, creator: number) {
//   // create player
//   const playerObj = new PlayerClass(EM.newEntity(), creator);
//   // addObject(playerObj);
//   // TODO(@darzu): debug
//   playerObj.motion.location[0] += 5;
//   // TODO(@darzu):  move _playerId to a LocalPlayer component or something
//   _playerId = playerObj.id;

//   // TODO(@darzu): what's up with our renderer init?
//   // have added our objects, can unmap buffers
//   // TODO(@darzu): debug
//   // __renderer.finishInit();

//   // TODO(@darzu): how do we handle authority on creating players?
// }

// // create local mesh prototypes
// let bulletProto = _renderer.addMesh(BULLET_MESH);
// mat4.copy(bulletProto.transform, new Float32Array(16)); // zero the transforms so it doesn't render

// if (createObjects) {
//   createGround(em, me);
//   createBoats(em, me);
//   createShip(em, me);
//   createCubeStack(em, me);
//   createPlayer(em, me);
// }

function registerBulletCollisionHandler(em: EntityManager) {
  // TODO(@darzu):
  em.registerSystem([BulletDef], [PhysicsResultsDef], (bullets, resources) => {
    const { collidesWith } = resources.physicsResults;

    for (let o of bullets) {
      if (collidesWith.has(o.id)) {
        let otherIds = collidesWith.get(o.id)!;
        let otherBullets = otherIds.map(
          (id) => id > o.id && em.findEntity(id, [BulletDef])
        );
        // find other bullets this bullet is colliding with. only want to find each collision once
        for (let otherBullet of otherBullets) {
          if (otherBullet) {
            // TODO: Doug, call new recordEvent
            // recordEvent(EventType.BulletBulletCollision, [
            //   o.id,
            //   otherBullet.id,
            // ]);
          }
        }

        // find players this bullet is colliding with, other than the player who shot the bullet
        let otherPlayers = otherIds.map((id) =>
          em.findEntity(id, [PlayerEntDef])
        );
        for (let otherPlayer of otherPlayers) {
          // if (obj.authority !== o.creator)
          //   recordEvent(EventType.BulletPlayerCollision, [player.id, o.id]);
        }
      }
    }
  });
}

// registerAllSystems(EM);
