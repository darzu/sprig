import { mat4, vec3, quat } from "./gl-matrix.js";
import { scaleMesh, GameObject, GameState, scaleMesh3, } from "./state.js";
import { Net } from "./net.js";
import { test } from "./test.js";
import { Renderer_WebGPU } from "./render_webgpu.js";
import { attachToCanvas } from "./render_webgl.js";
import { getAABBFromMesh, unshareProvokingVertices, } from "./mesh-pool.js";
import { _cellChecks, _doesOverlaps, _enclosedBys, _lastCollisionTestTimeMs, } from "./phys_broadphase.js";
import { createBoatProps, stepBoats } from "./boat.js";
import { jitter } from "./math.js";
import { createPlayerProps, stepPlayer } from "./player.js";
import { never } from "./util.js";
import { createInputsReader } from "./inputs.js";
import { copyMotionProps } from "./phys_motion.js";
import { HAT_OBJ, importObj, isParseError } from "./import_obj.js";
import { setupObjImportExporter } from "./download.js";
import { loadAssets } from "./assets.js";
const FORCE_WEBGL = false;
const MAX_MESHES = 20000;
const MAX_VERTICES = 21844;
const ENABLE_NET = true;
const AUTOSTART = true;
const INTERACTION_DISTANCE = 5;
const INTERACTION_ANGLE = Math.PI / 6;
var ObjectType;
(function (ObjectType) {
    ObjectType[ObjectType["Plane"] = 0] = "Plane";
    ObjectType[ObjectType["Player"] = 1] = "Player";
    ObjectType[ObjectType["Bullet"] = 2] = "Bullet";
    ObjectType[ObjectType["Boat"] = 3] = "Boat";
    ObjectType[ObjectType["Hat"] = 4] = "Hat";
    ObjectType[ObjectType["Ship"] = 5] = "Ship";
})(ObjectType || (ObjectType = {}));
var EventType;
(function (EventType) {
    EventType[EventType["BulletBulletCollision"] = 0] = "BulletBulletCollision";
    EventType[EventType["BulletPlayerCollision"] = 1] = "BulletPlayerCollision";
    EventType[EventType["HatGet"] = 2] = "HatGet";
    EventType[EventType["HatDrop"] = 3] = "HatDrop";
})(EventType || (EventType = {}));
const BLACK = vec3.fromValues(0, 0, 0);
const PLANE_MESH = unshareProvokingVertices(scaleMesh({
    pos: [
        [+1, 0, +1],
        [-1, 0, +1],
        [+1, 0, -1],
        [-1, 0, -1],
    ],
    tri: [
        [0, 2, 3],
        [0, 3, 1],
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
}, 10));
const PLANE_AABB = getAABBFromMesh(PLANE_MESH);
const DARK_GRAY = vec3.fromValues(0.02, 0.02, 0.02);
const LIGHT_GRAY = vec3.fromValues(0.2, 0.2, 0.2);
const DARK_BLUE = vec3.fromValues(0.03, 0.03, 0.2);
const LIGHT_BLUE = vec3.fromValues(0.05, 0.05, 0.2);
class Plane extends GameObject {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.clone(DARK_GRAY);
        this.collider = {
            shape: "AABB",
            solid: true,
            aabb: PLANE_AABB,
        };
    }
    mesh() {
        return PLANE_MESH;
    }
    typeId() {
        return ObjectType.Plane;
    }
    syncPriority(firstSync) {
        return firstSync ? 20000 : 1;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.motion.location);
        buffer.writeVec3(this.color);
    }
    deserializeFull(buffer) {
        buffer.readVec3(this.motion.location);
        buffer.readVec3(this.color);
    }
    serializeDynamic(buffer) {
        // don't need to write anything at all here, planes never change
    }
    deserializeDynamic(buffer) {
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
        [0, 2, 3],
        [4, 5, 1],
        [4, 1, 0],
        [3, 4, 0],
        [3, 7, 4],
        [2, 1, 5],
        [2, 5, 6],
        [6, 3, 2],
        [6, 7, 3],
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
class Cube extends GameObject {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.fromValues(0.2, 0, 0);
        this.collider = {
            shape: "AABB",
            solid: true,
            aabb: CUBE_AABB,
        };
    }
    mesh() {
        return CUBE_MESH;
    }
}
class Bullet extends Cube {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.fromValues(0.3, 0.3, 0.8);
        this.collider = {
            shape: "AABB",
            solid: false,
            aabb: getAABBFromMesh(this.mesh()),
        };
    }
    mesh() {
        // TODO(@darzu): this should be computed only once.
        return scaleMesh(super.mesh(), 0.3);
    }
    typeId() {
        return ObjectType.Bullet;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.motion.location);
        buffer.writeVec3(this.motion.linearVelocity);
        //buffer.writeVec3(vec3.fromValues(0, 0, 0));
        buffer.writeQuat(this.motion.rotation);
        buffer.writeVec3(this.motion.angularVelocity);
        buffer.writeVec3(this.color);
    }
    deserializeFull(buffer) {
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
        buffer.readVec3(this.motion.linearVelocity);
        let rotation = buffer.readQuat();
        if (!buffer.dummy) {
            this.snapRotation(rotation);
        }
        buffer.readVec3(this.motion.angularVelocity);
        buffer.readVec3(this.color);
    }
    serializeDynamic(buffer) {
        // rotation and location can both change, but we only really care about syncing location
        buffer.writeVec3(this.motion.location);
    }
    deserializeDynamic(buffer) {
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
    }
}
let _hatMesh = null;
class Hat extends Cube {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.fromValues(Math.random(), Math.random(), Math.random());
        this.collider = {
            shape: "AABB",
            solid: false,
            aabb: getAABBFromMesh(this.mesh()),
        };
    }
    mesh() {
        if (!_hatMesh) {
            const hatRaw = importObj(HAT_OBJ);
            if (isParseError(hatRaw))
                throw hatRaw;
            const hat = unshareProvokingVertices(hatRaw);
            _hatMesh = hat;
        }
        return _hatMesh;
    }
    typeId() {
        return ObjectType.Hat;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.color);
        buffer.writeVec3(this.motion.location);
    }
    deserializeFull(buffer) {
        buffer.readVec3(this.color);
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
    }
    // after they are created, hats will only change via events
    // TODO: stop syncing empty objects
    serializeDynamic(_buffer) { }
    deserializeDynamic(_buffer) { }
}
class Player extends Cube {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.fromValues(0, 0.2, 0);
        this.hat = 0;
        this.interactingWith = 0;
        this.dropping = false;
        this.player = createPlayerProps();
    }
    syncPriority(_firstSync) {
        return 10000;
    }
    typeId() {
        return ObjectType.Player;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.motion.location);
        buffer.writeVec3(this.motion.linearVelocity);
        buffer.writeQuat(this.motion.rotation);
        buffer.writeVec3(this.motion.angularVelocity);
    }
    deserializeFull(buffer) {
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
        buffer.readVec3(this.motion.linearVelocity);
        vec3.copy(this.motion.linearVelocity, this.motion.linearVelocity);
        let rotation = buffer.readQuat();
        if (!buffer.dummy) {
            this.snapRotation(rotation);
        }
        buffer.readVec3(this.motion.angularVelocity);
        vec3.copy(this.motion.angularVelocity, this.motion.angularVelocity);
    }
    serializeDynamic(buffer) {
        this.serializeFull(buffer);
    }
    deserializeDynamic(buffer) {
        this.deserializeFull(buffer);
    }
}
class Ship extends Cube {
    constructor(id, creator) {
        super(id, creator);
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
    }
    typeId() {
        return ObjectType.Ship;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.motion.location);
        buffer.writeVec3(this.motion.linearVelocity);
        buffer.writeQuat(this.motion.rotation);
        buffer.writeVec3(this.motion.angularVelocity);
    }
    deserializeFull(buffer) {
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
        buffer.readVec3(this.motion.linearVelocity);
        let rotation = buffer.readQuat();
        if (!buffer.dummy) {
            this.snapRotation(rotation);
        }
        buffer.readVec3(this.motion.angularVelocity);
    }
    serializeDynamic(buffer) {
        this.serializeFull(buffer);
    }
    deserializeDynamic(buffer) {
        this.deserializeFull(buffer);
    }
    mesh() {
        return _GAME_ASSETS === null || _GAME_ASSETS === void 0 ? void 0 : _GAME_ASSETS.ship;
    }
}
class Boat extends Cube {
    constructor(id, creator) {
        super(id, creator);
        this.color = vec3.fromValues(0.2, 0.1, 0.05);
        this.collider = {
            shape: "AABB",
            solid: true,
            aabb: getAABBFromMesh(this.mesh()),
        };
        this.boat = createBoatProps();
    }
    mesh() {
        // TODO(@darzu): this should be computed only once.
        return scaleMesh3(super.mesh(), [5, 0.3, 2.5]);
    }
    typeId() {
        return ObjectType.Boat;
    }
    serializeFull(buffer) {
        buffer.writeVec3(this.motion.location);
        buffer.writeVec3(this.motion.linearVelocity);
        buffer.writeQuat(this.motion.rotation);
        buffer.writeVec3(this.motion.angularVelocity);
    }
    deserializeFull(buffer) {
        let location = buffer.readVec3();
        if (!buffer.dummy) {
            this.snapLocation(location);
        }
        buffer.readVec3(this.motion.linearVelocity);
        let rotation = buffer.readQuat();
        if (!buffer.dummy) {
            this.snapRotation(rotation);
        }
        buffer.readVec3(this.motion.angularVelocity);
    }
    serializeDynamic(buffer) {
        this.serializeFull(buffer);
    }
    deserializeDynamic(buffer) {
        this.deserializeFull(buffer);
    }
}
// TODO(@darzu): for debugging
export let _playerId = -1;
class CubeGameState extends GameState {
    constructor(renderer, createObjects = true) {
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
        let bulletProtoObj = this.renderer.addObject(new Bullet(this.newId(), this.me));
        bulletProtoObj.obj.transform = new Float32Array(16); // zero the transforms so it doesn't render
        bulletProtoObj.handle.transform = new Float32Array(16);
        this.bulletProto = bulletProtoObj.handle;
        if (createObjects) {
            // create checkered grid
            const NUM_PLANES_X = 10;
            const NUM_PLANES_Z = 10;
            for (let x = 0; x < NUM_PLANES_X; x++) {
                for (let z = 0; z < NUM_PLANES_Z; z++) {
                    let plane = new Plane(this.newId(), this.me);
                    const xPos = (x - NUM_PLANES_X / 2) * 20 + 10;
                    const zPos = (z - NUM_PLANES_Z / 2) * 20;
                    const parity = !!((x + z) % 2);
                    plane.motion.location = vec3.fromValues(xPos, x + z - (NUM_PLANES_X + NUM_PLANES_Z), zPos);
                    // plane.motion.location = vec3.fromValues(xPos + 10, -3, 12 + zPos);
                    plane.color = parity ? LIGHT_BLUE : DARK_BLUE;
                    this.addObject(plane);
                }
            }
            // create boat(s)
            const BOAT_COUNT = 4;
            for (let i = 0; i < BOAT_COUNT; i++) {
                const boat = new Boat(this.newId(), this.me);
                boat.motion.location[1] = -9;
                boat.motion.location[0] = (Math.random() - 0.5) * 20 - 10;
                boat.motion.location[2] = (Math.random() - 0.5) * 20 - 20;
                boat.boat.speed = 0.01 + jitter(0.01);
                boat.boat.wheelSpeed = jitter(0.002);
                this.addObject(boat);
            }
            // create ship
            {
                const ship = new Ship(this.newId(), this.me);
                ship.motion.location[0] = -40;
                ship.motion.location[1] = -10;
                ship.motion.location[2] = -60;
                quat.rotateY(ship.motion.rotation, ship.motion.rotation, Math.PI * -0.4);
                this.addObject(ship);
            }
            // create stack of boxes
            const BOX_STACK_COUNT = 10;
            for (let i = 0; i < BOX_STACK_COUNT; i++) {
                let b = new Hat(this.newId(), this.me);
                // b.motion.location = vec3.fromValues(0, 5 + i * 2, -2);
                b.motion.location = vec3.fromValues(Math.random() * -10 + 10 - 5, 0, Math.random() * -10 - 5);
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
    playerObject(playerId) {
        let p = new Player(this.newId(), this.me);
        p.authority = playerId;
        p.authority_seq = 1;
        return p;
    }
    objectOfType(typeId, id, creator) {
        switch (typeId) {
            case ObjectType.Plane:
                return new Plane(id, creator);
            case ObjectType.Bullet:
                return new Bullet(id, creator);
            case ObjectType.Player:
                return new Player(id, creator);
            case ObjectType.Boat:
                return new Boat(id, creator);
            case ObjectType.Hat:
                return new Hat(id, creator);
            case ObjectType.Ship:
                return new Ship(id, creator);
            default:
                return never(typeId, `No such object type ${typeId}`);
        }
    }
    addObject(obj) {
        super.addObject(obj);
        if (obj instanceof Player) {
            this.players[obj.authority] = obj;
        }
    }
    addObjectInstance(obj, otherMesh) {
        super.addObjectInstance(obj, otherMesh);
        if (obj instanceof Player) {
            this.players[obj.authority] = obj;
        }
    }
    player() {
        return this.players[this.me];
    }
    spawnBullet(motion) {
        let bullet = new Bullet(this.newId(), this.me);
        copyMotionProps(bullet.motion, motion);
        vec3.copy(bullet.motion.linearVelocity, motion.linearVelocity);
        vec3.copy(bullet.motion.angularVelocity, motion.angularVelocity);
        this.addObjectInstance(bullet, this.bulletProto);
    }
    // TODO: this function is very bad. It should probably use an oct-tree or something.
    getInteractionObject(player) {
        let bestDistance = INTERACTION_DISTANCE;
        let bestObj = 0;
        for (let obj of this.liveObjects()) {
            if (obj instanceof Hat && obj.inWorld) {
                let to = vec3.sub(vec3.create(), obj.motion.location, player.motion.location);
                let distance = vec3.len(to);
                if (distance < bestDistance) {
                    let direction = vec3.normalize(to, to);
                    let playerDirection = vec3.fromValues(0, 0, -1);
                    vec3.transformQuat(playerDirection, playerDirection, player.motion.rotation);
                    if (Math.abs(vec3.angle(direction, playerDirection)) < INTERACTION_ANGLE) {
                        bestDistance = distance;
                        bestObj = obj.id;
                    }
                }
            }
        }
        return bestObj;
    }
    stepGame(dt, inputs) {
        // check render mode
        if (inputs.keyClicks["1"]) {
            this.renderer.wireMode = "normal";
        }
        else if (inputs.keyClicks["2"]) {
            this.renderer.wireMode = "wireframe";
        }
        // check render mode
        if (inputs.keyClicks["3"]) {
            this.renderer.perspectiveMode = "perspective";
        }
        else if (inputs.keyClicks["4"]) {
            this.renderer.perspectiveMode = "ortho";
        }
        // move boats
        const boats = this.liveObjects().filter((o) => o instanceof Boat && o.authority === this.me);
        stepBoats(boats, dt);
        // TODO(@darzu): IMPLEMENT
        // move player(s)
        const players = this.liveObjects().filter((o) => o instanceof Player && o.authority === this.me);
        //console.log(`Stepping ${players.length} players`);
        for (let player of players) {
            let interactionObject = this.getInteractionObject(player);
            if (interactionObject > 0) {
                console.log(`Interaction object is ${interactionObject}`);
            }
            stepPlayer(player, interactionObject, dt, inputs, this.camera, this.spawnBullet);
        }
    }
    handleCollisions() {
        // check collisions
        for (let o of this.liveObjects()) {
            if (o instanceof Bullet) {
                if (this.collidesWith.has(o.id)) {
                    let collidingObjects = this.collidesWith
                        .get(o.id)
                        .map((id) => this.getObject(id));
                    // find other bullets this bullet is colliding with. only want to find each collision once
                    let collidingBullets = collidingObjects.filter((obj) => obj instanceof Bullet && obj.id > o.id);
                    for (let otherBullet of collidingBullets) {
                        this.recordEvent(EventType.BulletBulletCollision, [
                            o.id,
                            otherBullet.id,
                        ]);
                    }
                    // find players this bullet is colliding with, other than the player who shot the bullet
                    let collidingPlayers = collidingObjects.filter((obj) => obj instanceof Player && obj.authority !== o.creator);
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
    eventAuthority(type, objects) {
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
    legalEvent(event) {
        switch (event.type) {
            case EventType.BulletPlayerCollision:
                return !this.getObject(event.objects[0]).deleted;
            case EventType.BulletBulletCollision:
                return (!this.getObject(event.objects[0]).deleted &&
                    !this.getObject(event.objects[1]).deleted);
            case EventType.HatGet:
                return this.getObject(event.objects[1]).inWorld;
            case EventType.HatDrop:
                return (this.getObject(event.objects[0]).hat === event.objects[1]);
            default:
                return super.legalEvent(event);
        }
    }
    runEvent(event) {
        // return; // TODO(@darzu): DEBUG, this is very slow when done with >100s of objs.
        // console.log(`Running event of type ${EventType[event.type]}`);
        switch (event.type) {
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
                    }
                    else if (obj && obj instanceof Player) {
                        vec3.add(obj.color, obj.color, vec3.fromValues(0.1, 0, 0));
                    }
                }
                break;
            case EventType.HatGet: {
                let player = this.getObject(event.objects[0]);
                let hat = this.getObject(event.objects[1]);
                hat.parent = player.id;
                hat.inWorld = false;
                vec3.set(hat.motion.location, 0, 1, 0);
                player.hat = hat.id;
                break;
            }
            case EventType.HatDrop: {
                let player = this.getObject(event.objects[0]);
                let hat = this.getObject(event.objects[1]);
                hat.inWorld = true;
                hat.parent = 0;
                vec3.copy(hat.motion.location, event.location);
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
            mat4.multiply(viewMatrix, viewMatrix, mat4.fromQuat(mat4.create(), this.player().motion.rotation));
        }
        mat4.multiply(viewMatrix, viewMatrix, mat4.fromQuat(mat4.create(), this.camera.rotation));
        mat4.translate(viewMatrix, viewMatrix, this.camera.location);
        mat4.invert(viewMatrix, viewMatrix);
        return viewMatrix;
    }
}
// ms per network sync (should be the same for all servers)
const NET_DT = 1000.0 / 20;
// local simulation speed
const SIM_DT = 1000.0 / 60;
// TODO(@darzu): very hacky way to pass these around
export let _GAME_ASSETS = null;
export let gameStarted = false;
async function startGame(host) {
    var _a;
    if (gameStarted)
        return;
    gameStarted = true;
    // TODO(@darzu): stream in assets
    _GAME_ASSETS = await loadAssets();
    let hosting = host === null;
    let canvas = document.getElementById("sample-canvas");
    function onWindowResize() {
        canvas.width = window.innerWidth;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.height = window.innerHeight;
        canvas.style.height = `${window.innerHeight}px`;
    }
    window.onresize = function () {
        onWindowResize();
    };
    onWindowResize();
    // This tells Chrome that the canvas should be pixelated instead of blurred.
    //    this looks better in lower resolution games and gives us full control over
    //    resolution and blur.
    // HACK: for some odd reason, setting this on a timeout is the only way I can get
    //    Chrome to accept this property. Otherwise it'll only apply after the canvas
    //    is resized by the user. (Version 94.0.4604.0 (Official Build) canary (arm64))
    setTimeout(() => {
        canvas.style.imageRendering = `pixelated`;
    }, 50);
    const debugDiv = document.getElementById("debug-div");
    let rendererInit = undefined;
    let usingWebGPU = false;
    if (!FORCE_WEBGL) {
        // try webgpu
        const adapter = await ((_a = navigator.gpu) === null || _a === void 0 ? void 0 : _a.requestAdapter());
        if (adapter) {
            const device = await adapter.requestDevice();
            // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
            const context = canvas.getContext("webgpu");
            if (context) {
                rendererInit = new Renderer_WebGPU(canvas, device, context, adapter, MAX_MESHES, MAX_VERTICES);
                if (rendererInit)
                    usingWebGPU = true;
            }
        }
    }
    if (!rendererInit) {
        rendererInit = attachToCanvas(canvas, MAX_MESHES, MAX_VERTICES);
    }
    if (!rendererInit)
        throw "Unable to create webgl or webgpu renderer";
    console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);
    const renderer = rendererInit;
    let start_of_time = performance.now();
    let gameState = new CubeGameState(renderer, hosting);
    let takeInputs = createInputsReader(canvas);
    function doLockMouse() {
        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }
    }
    canvas.addEventListener("click", doLockMouse);
    const controlsStr = `[WASD shift/c mouse spacebar]`;
    let avgJsTime = 0;
    let avgNetTime = 0;
    let avgSimTime = 0;
    let avgFrameTime = 0;
    let avgWeight = 0.05;
    let net = null;
    let previous_frame_time = start_of_time;
    let net_time_accumulator = 0;
    let sim_time_accumulator = 0;
    let frame = () => {
        let frame_start_time = performance.now();
        const dt = frame_start_time - previous_frame_time;
        // apply any state updates from the network
        if (net)
            net.updateState(previous_frame_time);
        // simulation step(s)
        sim_time_accumulator += dt;
        sim_time_accumulator = Math.min(sim_time_accumulator, SIM_DT * 2);
        let sim_time = 0;
        while (sim_time_accumulator > SIM_DT) {
            let before_sim = performance.now();
            gameState.step(SIM_DT, takeInputs());
            sim_time_accumulator -= SIM_DT;
            sim_time += performance.now() - before_sim;
        }
        if (net) {
            net.handleEventRequests();
        }
        // send updates out to network (if necessary)
        net_time_accumulator += dt;
        net_time_accumulator = Math.min(net_time_accumulator, NET_DT * 2);
        let net_time = 0;
        while (net_time_accumulator > NET_DT) {
            let before_net = performance.now();
            if (net) {
                net.sendStateUpdates();
            }
            net_time += performance.now() - before_net;
            net_time_accumulator -= NET_DT;
        }
        // render
        gameState.renderFrame();
        let jsTime = performance.now() - frame_start_time;
        let frameTime = frame_start_time - previous_frame_time;
        let { reliableBufferSize, unreliableBufferSize, numDroppedUpdates, skew, ping, } = net
            ? net.stats()
            : {
                reliableBufferSize: 0,
                unreliableBufferSize: 0,
                numDroppedUpdates: 0,
                skew: [],
                ping: [],
            };
        previous_frame_time = frame_start_time;
        avgJsTime = avgJsTime
            ? (1 - avgWeight) * avgJsTime + avgWeight * jsTime
            : jsTime;
        avgFrameTime = avgFrameTime
            ? (1 - avgWeight) * avgFrameTime + avgWeight * frameTime
            : frameTime;
        avgNetTime = avgNetTime
            ? (1 - avgWeight) * avgNetTime + avgWeight * net_time
            : net_time;
        avgSimTime = avgSimTime
            ? (1 - avgWeight) * avgSimTime + avgWeight * sim_time
            : sim_time;
        const avgFPS = 1000 / avgFrameTime;
        const debugTxt = debugDiv.firstChild;
        // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
        //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
        //    means we'll need to do more work to get line breaks.
        debugTxt.nodeValue =
            controlsStr +
                ` ` +
                `js:${avgJsTime.toFixed(2)}ms ` +
                `net:${avgNetTime.toFixed(2)}ms ` +
                `sim:${avgSimTime.toFixed(2)}ms ` +
                `broad:(${_lastCollisionTestTimeMs.toFixed(1)}ms ` +
                `o:${_doesOverlaps} e:${_enclosedBys} c:${_cellChecks}) ` +
                `fps:${avgFPS.toFixed(1)} ` +
                //`buffers:(r=${reliableBufferSize}/u=${unreliableBufferSize}) ` +
                `dropped:${numDroppedUpdates} ` +
                `objects:${gameState.numObjects} ` +
                `skew: ${skew.join(",")} ` +
                `ping: ${ping.join(",")} ` +
                `${usingWebGPU ? "WebGPU" : "WebGL"}`;
        // // TODO(@darzu): DEBUG
        // debugTxt.nodeValue =
        //   `sim:${avgSimTime.toFixed(2)}ms ` +
        //   `broad:${_lastCollisionTestTimeMs.toFixed(1)}ms ` +
        //   `pairs:${_motionPairsLen} ` +
        //   `o:${_doesOverlaps} e:${_enclosedBys} `;
        requestAnimationFrame(frame);
    };
    if (ENABLE_NET) {
        try {
            net = new Net(gameState, host, (id) => {
                renderer.finishInit(); // TODO(@darzu): debugging
                if (hosting) {
                    console.log("hello");
                    console.log(`Net up and running with id`);
                    console.log(`${id}`);
                    const url = `${window.location.href}?server=${id}`;
                    console.log(url);
                    if (navigator.clipboard)
                        navigator.clipboard.writeText(url);
                    frame();
                }
                else {
                    frame();
                }
            });
        }
        catch (e) {
            console.error("Failed to initialize net");
            console.error(e);
            net = null;
        }
    }
    else {
        renderer.finishInit(); // TODO(@darzu): debugging
        frame();
    }
}
async function main() {
    var _a;
    const queryString = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const urlServerId = (_a = queryString["server"]) !== null && _a !== void 0 ? _a : null;
    let controls = document.getElementById("server-controls");
    let serverStartButton = document.getElementById("server-start");
    let connectButton = document.getElementById("connect");
    let serverIdInput = document.getElementById("server-id");
    if (ENABLE_NET && !AUTOSTART && !urlServerId) {
        serverStartButton.onclick = () => {
            startGame(null);
            controls.hidden = true;
        };
        connectButton.onclick = () => {
            startGame(serverIdInput.value);
            controls.hidden = true;
        };
    }
    else {
        startGame(urlServerId);
        controls.hidden = true;
    }
}
test();
// dom dependant stuff
window.onload = () => {
    setupObjImportExporter();
};
(async () => {
    // TODO(@darzu): work around for lack of top-level await in Safari
    try {
        await main();
    }
    catch (e) {
        console.error(e);
    }
})();
//# sourceMappingURL=main.js.map