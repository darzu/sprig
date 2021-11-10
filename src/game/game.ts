import { TimeDef, EM, Entity } from "../entity-manager.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import { importObj, HAT_OBJ, isParseError } from "../import_obj.js";
import { Inputs } from "../inputs.js";
import { CameraProps, _GAME_ASSETS } from "../main.js";
import { jitter } from "../math.js";
import {
  unshareProvokingVertices,
  getAABBFromMesh,
  Mesh,
  MeshHandle,
} from "../mesh-pool.js";
import { registerPhysicsSystems } from "../phys_esc.js";
import { Motion, copyMotionProps, MotionDef } from "../phys_motion.js";
import { registerUpdateTransforms } from "../renderer.js";
import { Renderer } from "../render_webgpu.js";
import { Serializer, Deserializer } from "../serialize.js";
import {
  scaleMesh,
  GameObject,
  scaleMesh3,
  GameEvent,
  GameState,
} from "../state.js";
import { never } from "../util.js";
import { Boat, BoatDef, registerStepBoats } from "./boat.js";
import { PlayerProps, createPlayerProps, stepPlayer } from "./player.js";

const INTERACTION_DISTANCE = 5;
const INTERACTION_ANGLE = Math.PI / 6;

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
  color: vec3;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.clone(DARK_GRAY);
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

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.motion.location);
    buffer.writeVec3(this.color);
  }

  deserializeFull(buffer: Deserializer) {
    buffer.readVec3(this.motion.location);
    buffer.readVec3(this.color);
  }

  serializeDynamic(buffer: Serializer) {
    // don't need to write anything at all here, planes never change
  }

  deserializeDynamic(buffer: Deserializer) {
    //console.log("Deserializing plane");
    // don't need to read anything at all here, planes never change
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

abstract class Cube extends GameObject {
  color: vec3;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0.2, 0, 0);
    this.collider = {
      shape: "AABB",
      solid: true,
      aabb: CUBE_AABB,
    };
    this.renderable.mesh = CUBE_MESH;
  }
}

class Bullet extends Cube {
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

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.motion.location);
    buffer.writeVec3(this.motion.linearVelocity);
    //buffer.writeVec3(vec3.fromValues(0, 0, 0));
    buffer.writeQuat(this.motion.rotation);
    buffer.writeVec3(this.motion.angularVelocity);
    buffer.writeVec3(this.color);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.motion.linearVelocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.motion.angularVelocity);
    buffer.readVec3(this.color);
  }

  serializeDynamic(buffer: Serializer) {
    // rotation and location can both change, but we only really care about syncing location
    buffer.writeVec3(this.motion.location);
  }

  deserializeDynamic(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
  }
}

let _hatMesh: Mesh | null = null;

class Hat extends Cube {
  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
    this.collider = {
      shape: "AABB",
      solid: false,
      aabb: getAABBFromMesh(this.mesh()),
    };

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

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.color);
    buffer.writeVec3(this.motion.location);
  }

  deserializeFull(buffer: Deserializer) {
    buffer.readVec3(this.color);
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
  }

  // after they are created, hats will only change via events
  // TODO: stop syncing empty objects
  serializeDynamic(_buffer: Serializer) {}

  deserializeDynamic(_buffer: Deserializer) {}
}

class Player extends Cube {
  player: PlayerProps;
  hat: number;
  interactingWith: number;
  dropping: boolean;

  constructor(e: Entity, creator: number) {
    super(e, creator);
    this.color = vec3.fromValues(0, 0.2, 0);
    this.hat = 0;
    this.interactingWith = 0;
    this.dropping = false;
    this.player = createPlayerProps();
  }

  syncPriority(_firstSync: boolean): number {
    return 10000;
  }

  typeId(): number {
    return ObjectType.Player;
  }

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.motion.location);
    buffer.writeVec3(this.motion.linearVelocity);
    buffer.writeQuat(this.motion.rotation);
    buffer.writeVec3(this.motion.angularVelocity);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.motion.linearVelocity);
    vec3.copy(this.motion.linearVelocity, this.motion.linearVelocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.motion.angularVelocity);
    vec3.copy(this.motion.angularVelocity, this.motion.angularVelocity);
  }

  serializeDynamic(buffer: Serializer) {
    this.serializeFull(buffer);
  }

  deserializeDynamic(buffer: Deserializer) {
    this.deserializeFull(buffer);
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

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.motion.location);
    buffer.writeVec3(this.motion.linearVelocity);
    buffer.writeQuat(this.motion.rotation);
    buffer.writeVec3(this.motion.angularVelocity);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.motion.linearVelocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.motion.angularVelocity);
  }

  serializeDynamic(buffer: Serializer) {
    this.serializeFull(buffer);
  }

  deserializeDynamic(buffer: Deserializer) {
    this.deserializeFull(buffer);
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

  serializeFull(buffer: Serializer) {
    buffer.writeVec3(this.motion.location);
    buffer.writeVec3(this.motion.linearVelocity);
    buffer.writeQuat(this.motion.rotation);
    buffer.writeVec3(this.motion.angularVelocity);
  }

  deserializeFull(buffer: Deserializer) {
    let location = buffer.readVec3()!;
    if (!buffer.dummy) {
      this.snapLocation(location);
    }
    buffer.readVec3(this.motion.linearVelocity);
    let rotation = buffer.readQuat()!;
    if (!buffer.dummy) {
      this.snapRotation(rotation);
    }
    buffer.readVec3(this.motion.angularVelocity);
  }

  serializeDynamic(buffer: Serializer) {
    this.serializeFull(buffer);
  }

  deserializeDynamic(buffer: Deserializer) {
    this.deserializeFull(buffer);
  }
}

// TODO(@darzu): for debugging
export let _playerId: number = -1;

export class CubeGameState extends GameState {
  players: Record<number, Player>;
  camera: CameraProps;

  bulletProto: MeshHandle;

  constructor(renderer: Renderer, createObjects: boolean = true) {
    super(renderer);

    // TODO(@darzu): can we do without this lame javascript-ism?
    this.spawnBullet = this.spawnBullet.bind(this);

    this.me = 0;
    let cameraRotation = quat.identity(quat.create());
    quat.rotateX(cameraRotation, cameraRotation, -Math.PI / 8);
    let cameraLocation = vec3.fromValues(0, 0, 10);
    this.camera = {
      rotation: cameraRotation,
      location: cameraLocation,
    };
    this.players = {};

    // create local mesh prototypes
    let bulletProtoObj = this.renderer.addObject(
      new Bullet(EM.newEntity(), this.me)
    );
    mat4.copy(bulletProtoObj.obj.transform, new Float32Array(16)); // zero the transforms so it doesn't render
    mat4.copy(bulletProtoObj.handle.transform, new Float32Array(16));
    this.bulletProto = bulletProtoObj.handle;

    if (createObjects) {
      // create checkered grid
      const NUM_PLANES_X = 10;
      const NUM_PLANES_Z = 10;
      for (let x = 0; x < NUM_PLANES_X; x++) {
        for (let z = 0; z < NUM_PLANES_Z; z++) {
          let plane = new Plane(EM.newEntity(), this.me);
          const xPos = (x - NUM_PLANES_X / 2) * 20 + 10;
          const zPos = (z - NUM_PLANES_Z / 2) * 20;
          const parity = !!((x + z) % 2);
          vec3.copy(
            plane.motion.location,
            vec3.fromValues(xPos, x + z - (NUM_PLANES_X + NUM_PLANES_Z), zPos)
          );
          // plane.motion.location = vec3.fromValues(xPos + 10, -3, 12 + zPos);
          plane.color = parity ? LIGHT_BLUE : DARK_BLUE;
          this.addObject(plane);
        }
      }

      // create boat(s)
      const BOAT_COUNT = 4;
      for (let i = 0; i < BOAT_COUNT; i++) {
        const boat = new BoatClass(EM.newEntity(), this.me);
        boat.motion.location[1] = -9;
        boat.motion.location[0] = (Math.random() - 0.5) * 20 - 10;
        boat.motion.location[2] = (Math.random() - 0.5) * 20 - 20;
        boat.boat.speed = 0.01 + jitter(0.01);
        boat.boat.wheelSpeed = jitter(0.002);
        this.addObject(boat);

        // TODO(@darzu): ECS hack
        console.log("create ent");
        const e = EM.newEntity();
        let boatC = EM.addComponent(e.id, BoatDef);
        Object.assign(boatC, boat.boat);
        let boatM = EM.addComponent(e.id, MotionDef);
        Object.assign(boatM, boat.motion);
      }

      // TODO(@darzu): ECS stuff
      registerStepBoats(EM);
      registerUpdateTransforms(EM);
      registerPhysicsSystems(EM);

      // create ship
      {
        const ship = new Ship(EM.newEntity(), this.me);
        ship.motion.location[0] = -40;
        ship.motion.location[1] = -10;
        ship.motion.location[2] = -60;
        quat.rotateY(
          ship.motion.rotation,
          ship.motion.rotation,
          Math.PI * -0.4
        );
        this.addObject(ship);
      }

      // create stack of boxes
      const BOX_STACK_COUNT = 10;
      for (let i = 0; i < BOX_STACK_COUNT; i++) {
        let b = new Hat(EM.newEntity(), this.me);
        // b.motion.location = vec3.fromValues(0, 5 + i * 2, -2);
        b.motion.location = vec3.fromValues(
          Math.random() * -10 + 10 - 5,
          0,
          Math.random() * -10 - 5
        );
        this.addObject(b);
        // TODO(@darzu): debug
        console.log(`box: ${b.id}`);
      }

      // create player
      const [_, playerObj] = this.addPlayer();
      // TODO(@darzu): debug
      playerObj.motion.location[0] += 5;
      _playerId = playerObj.id;
      // have added our objects, can unmap buffers
      // TODO(@darzu): debug
      // this.renderer.finishInit();
    }
    this.me = 0;
  }

  playerObject(playerId: number): GameObject {
    let p = new Player(EM.newEntity(), this.me);
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
        return new Player(e, creator);
      case ObjectType.Boat:
        return new BoatClass(e, creator);
      case ObjectType.Hat:
        return new Hat(e, creator);
      case ObjectType.Ship:
        return new Ship(e, creator);
      default:
        return never(typeId, `No such object type ${typeId}`);
    }
  }

  addObject(obj: GameObject) {
    super.addObject(obj);
    if (obj instanceof Player) {
      this.players[obj.authority] = obj;
    }
  }
  addObjectInstance(obj: GameObject, otherMesh: MeshHandle) {
    super.addObjectInstance(obj, otherMesh);
    if (obj instanceof Player) {
      this.players[obj.authority] = obj;
    }
  }

  private player() {
    return this.players[this.me];
  }

  spawnBullet(motion: Motion) {
    const e = EM.newEntity();
    let bullet = new Bullet(e, this.me);
    copyMotionProps(bullet.motion, motion);
    vec3.copy(bullet.motion.linearVelocity, motion.linearVelocity);
    vec3.copy(bullet.motion.angularVelocity, motion.angularVelocity);
    this.addObjectInstance(bullet, this.bulletProto);
  }

  // TODO: this function is very bad. It should probably use an oct-tree or something.
  getInteractionObject(player: Player): number {
    let bestDistance = INTERACTION_DISTANCE;
    let bestObj = 0;
    for (let obj of this.liveObjects()) {
      if (obj instanceof Hat && obj.inWorld) {
        let to = vec3.sub(
          vec3.create(),
          obj.motion.location,
          player.motion.location
        );
        let distance = vec3.len(to);
        if (distance < bestDistance) {
          let direction = vec3.normalize(to, to);
          let playerDirection = vec3.fromValues(0, 0, -1);
          vec3.transformQuat(
            playerDirection,
            playerDirection,
            player.motion.rotation
          );
          if (
            Math.abs(vec3.angle(direction, playerDirection)) < INTERACTION_ANGLE
          ) {
            bestDistance = distance;
            bestObj = obj.id;
          }
        }
      }
    }
    return bestObj;
  }

  stepGame(dt: number, inputs: Inputs) {
    // check render mode
    if (inputs.keyClicks["1"]) {
      this.renderer.wireMode = "normal";
    } else if (inputs.keyClicks["2"]) {
      this.renderer.wireMode = "wireframe";
    }

    // check render mode
    if (inputs.keyClicks["3"]) {
      this.renderer.perspectiveMode = "perspective";
    } else if (inputs.keyClicks["4"]) {
      this.renderer.perspectiveMode = "ortho";
    }

    // TODO(@darzu): wierd ECS
    const { time } = EM.findSingletonEntity(TimeDef);
    time.dt = dt;

    // move boats
    // const boats = this.liveObjects().filter(
    //   (o) => o instanceof BoatClass && o.authority === this.me
    // ) as BoatClass[];
    // stepBoats(boats, { time: { dt: dt } });
    EM.callSystems();

    // TODO(@darzu): IMPLEMENT
    // move player(s)
    const players = this.liveObjects().filter(
      (o) => o instanceof Player && o.authority === this.me
    ) as Player[];
    //console.log(`Stepping ${players.length} players`);

    for (let player of players) {
      let interactionObject = this.getInteractionObject(player);
      if (interactionObject > 0) {
        console.log(`Interaction object is ${interactionObject}`);
      }
      stepPlayer(
        player,
        interactionObject,
        dt,
        inputs,
        this.camera,
        this.spawnBullet
      );
    }
  }

  handleCollisions() {
    // check collisions
    for (let o of this.liveObjects()) {
      if (o instanceof Bullet) {
        if (this.collidesWith.has(o.id)) {
          let collidingObjects = this.collidesWith
            .get(o.id)!
            .map((id) => this.getObject(id)!);
          // find other bullets this bullet is colliding with. only want to find each collision once
          let collidingBullets = collidingObjects.filter(
            (obj) => obj instanceof Bullet && obj.id > o.id
          );
          for (let otherBullet of collidingBullets) {
            this.recordEvent(EventType.BulletBulletCollision, [
              o.id,
              otherBullet.id,
            ]);
          }
          // find players this bullet is colliding with, other than the player who shot the bullet
          let collidingPlayers = collidingObjects.filter(
            (obj) => obj instanceof Player && obj.authority !== o.creator
          );
          for (let player of collidingPlayers) {
            this.recordEvent(EventType.BulletPlayerCollision, [
              player.id,
              o.id,
            ]);
          }
        }
      }
      if (o instanceof Player) {
        if (o.hat === 0 && o.interactingWith > 0) {
          this.recordEvent(EventType.HatGet, [o.id, o.interactingWith]);
        }
        if (o.hat > 0 && o.dropping) {
          let dropLocation = vec3.fromValues(0, 0, -5);
          vec3.transformQuat(dropLocation, dropLocation, o.motion.rotation);
          vec3.add(dropLocation, dropLocation, o.motion.location);
          this.recordEvent(EventType.HatDrop, [o.id, o.hat], dropLocation);
        }
      }
    }
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
          (this.getObject(event.objects[0]) as Player).hat === event.objects[1]
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
          } else if (obj && obj instanceof Player) {
            vec3.add(obj.color, obj.color, vec3.fromValues(0.1, 0, 0));
          }
        }
        break;
      case EventType.HatGet: {
        let player = this.getObject(event.objects[0]) as Player;
        let hat = this.getObject(event.objects[1]) as Hat;
        hat.parent = player.id;
        hat.inWorld = false;
        vec3.set(hat.motion.location, 0, 1, 0);
        player.hat = hat.id;
        break;
      }
      case EventType.HatDrop: {
        let player = this.getObject(event.objects[0]) as Player;
        let hat = this.getObject(event.objects[1]) as Hat;
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

  viewMatrix() {
    //TODO: this calculation feels like it should be simpler but Doug doesn't
    //understand quaternions.
    let viewMatrix = mat4.create();
    if (this.player()) {
      mat4.translate(viewMatrix, viewMatrix, this.player().motion.location);
      mat4.multiply(
        viewMatrix,
        viewMatrix,
        mat4.fromQuat(mat4.create(), this.player().motion.rotation)
      );
    }
    mat4.multiply(
      viewMatrix,
      viewMatrix,
      mat4.fromQuat(mat4.create(), this.camera.rotation)
    );
    mat4.translate(viewMatrix, viewMatrix, this.camera.location);
    mat4.invert(viewMatrix, viewMatrix);
    return viewMatrix;
  }
}
