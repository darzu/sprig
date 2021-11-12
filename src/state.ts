import { mat4, vec3, quat } from "./gl-matrix.js";
import { Serializer, Deserializer } from "./serialize.js";
import { Mesh, MeshHandle, MeshHandleDef } from "./mesh-pool.js";
import { Renderer } from "./render_webgpu.js";
import { AABB, checkCollisions, copyAABB } from "./phys_broadphase.js";
import {
  copyMotionProps,
  createMotionProps,
  Motion,
  MotionDef,
} from "./phys_motion.js";
import { CollidesWith, ReboundData, IdPair } from "./phys.js";
import { Collider, ColliderDef } from "./collider.js";
import { EM, Entity } from "./entity-manager.js";
import {
  Component,
  MotionSmoothingDef,
  Parent,
  ParentDef,
  Renderable,
  RenderableDef,
  TransformDef,
} from "./renderer.js";
import {
  PhysicsResultsDef,
  PhysicsState,
  PhysicsStateDef,
} from "./phys_esc.js";

const SMOOTH = true;

export function scaleMesh(m: Mesh, by: number): Mesh {
  let pos = m.pos.map((p) => vec3.scale(vec3.create(), p, by));
  return { ...m, pos };
}
export function scaleMesh3(m: Mesh, by: vec3): Mesh {
  let pos = m.pos.map((p) => vec3.multiply(vec3.create(), p, by));
  return { ...m, pos };
}

const working_quat = quat.create();
export const identity_quat = quat.create();
const working_vec3 = vec3.create();

export const InWorldDef = EM.defineComponent("inWorld", (is: boolean) => ({
  is,
}));
export type InWorld = Component<typeof InWorldDef>;

/* TODO: add "versioning" of objects. 
Right now we have two types of state updates: full and dynamic. 
A full update is only guaranteed to happen once, on object creation; 
we track which nodes have seen each object and try to only sync each 
object fully once. We could instead track which nodes have seen which 
*version* of each object; we could then trigger a full sync again by 
bumping a version number. We could use this for properties that change 
infrequently.

For objects with so much state that doing a full sync even infrequently is
cost-prohibitive (player objects?), could also imagine a change log. Can use
versions for this, too--a log entry is associated with a version and we sync
nodes all log entries we think they might not have seen.

For both of these, should use typescript's getters and setters to make sure
everything gets updated in the right place.
 */
export abstract class GameObject {
  entity: Entity;

  creator: number;

  authority: number;
  authority_seq: number;
  snap_seq: number;
  deleted: boolean = false;

  // ECS controlled stuff below this
  _inWorld: InWorld;
  get inWorld() {
    return this._inWorld.is;
  }
  set inWorld(b) {
    this._inWorld.is = b;
  }
  get id() {
    return this.entity.id;
  }
  motion: Motion;
  smoothedLocationDiff: vec3;
  smoothedRotationDiff: quat;
  transform: mat4;
  _parent: Parent;
  get parent() {
    return this._parent.id;
  }
  set parent(id: number) {
    this._parent.id = id;
  }
  renderable: Renderable;
  mesh() {
    return this.renderable.mesh;
  }
  _phys: PhysicsState;
  get lastMotion() {
    return this._phys.lastMotion;
  }
  _collider: Collider;
  set collider(c: Collider) {
    Object.assign(this._collider, c);
  }
  get collider() {
    return this._collider;
  }

  constructor(e: Entity, creator: number) {
    this.creator = creator;

    this.entity = e;

    this.motion = EM.addComponent(this.id, MotionDef);

    const err = EM.addComponent(this.id, MotionSmoothingDef);
    this.smoothedLocationDiff = err.locationDiff;
    this.smoothedRotationDiff = err.rotationDiff;

    this.transform = EM.addComponent(this.id, TransformDef);

    this._parent = EM.addComponent(this.id, ParentDef);

    this.renderable = EM.addComponent(this.id, RenderableDef);

    this._phys = EM.addComponent(this.id, PhysicsStateDef);

    this._collider = EM.addComponent(this.id, ColliderDef);

    this._inWorld = EM.addComponent(this.id, InWorldDef, true);

    // TODO(@darzu): ECS this shit
    // this.lastMotion = undefined;
    this.authority = creator;
    this.authority_seq = 0;
    this.snap_seq = -1;
    // this.collider = { shape: "Empty", solid: false };
  }

  syncPriority(firstSync: boolean): number {
    return 10;
  }

  claimAuthority(
    authority: number,
    authority_seq: number,
    snap_seq: number
  ): boolean {
    if (
      snap_seq >= this.snap_seq &&
      (this.authority_seq < authority_seq ||
        (this.authority_seq == authority_seq && authority <= this.authority))
    ) {
      this.authority = authority;
      this.authority_seq = authority_seq;
      this.snap_seq = snap_seq;
      return true;
    }
    return false;
  }

  // By default, simulate ballistic motion. Subclasses can override
  simulate(dt: number) {
    //console.log(`simulating forward ${dt} ms`);
    vec3.scale(working_vec3, this.motion.linearVelocity, dt);
    vec3.add(this.motion.location, this.motion.location, working_vec3);

    let axis = vec3.normalize(working_vec3, this.motion.angularVelocity);
    let angle = vec3.length(this.motion.angularVelocity) * dt;
    let deltaRotation = quat.setAxisAngle(working_quat, axis, angle);
    quat.normalize(deltaRotation, deltaRotation);
    quat.multiply(this.motion.rotation, deltaRotation, this.motion.rotation);
    quat.normalize(this.motion.rotation, this.motion.rotation);
  }

  // TODO(@darzu): dummy definitions, just here until Doug changes how we serialize things
  // TODO(@darzu): delete these
  serializeFull(buf: Serializer) {}
  deserializeFull(buf: Deserializer) {}
  serializeDynamic(buf: Serializer) {}
  deserializeDynamic(buf: Deserializer) {}

  abstract typeId(): number;
}

export interface GameEvent {
  type: number;
  id: number;
  objects: number[];
  authority: number;
  location: vec3 | null;
}

export abstract class GameState {
  protected nextPlayerId: number;
  nextObjectId: number;
  protected renderer: Renderer;
  // TODO: make this a Map
  private _objects: Map<number, GameObject>;
  private _liveObjects: GameObject[];
  requestedEvents: GameEvent[];
  me: number;
  numObjects: number = 0;
  collidesWith: CollidesWith;

  constructor(renderer: Renderer) {
    this.me = 0;
    this.renderer = renderer;
    this.nextPlayerId = 0;
    this.nextObjectId = 1;
    this._objects = new Map();
    this._liveObjects = [];
    this.requestedEvents = [];
    this.collidesWith = new Map();
  }

  abstract playerObject(playerId: number): GameObject;

  abstract stepGame(dt: number): void;

  abstract handleCollisions(): void;

  abstract runEvent(event: GameEvent): void;

  abstract objectOfType(
    typeID: number,
    id: number,
    creator: number
  ): GameObject;

  addObject(obj: GameObject) {
    this.numObjects++;
    this._objects.set(obj.id, obj);

    // TODO(@darzu): adding the MeshHandle outside the constructor is a little wierd
    const meshHandle = this.renderer.addMesh(obj.mesh());
    EM.addComponent(obj.entity.id, MeshHandleDef, meshHandle);

    this._liveObjects.push(obj);
  }

  addObjectInstance(obj: GameObject, otherMesh: MeshHandle) {
    this.numObjects++;
    this._objects.set(obj.id, obj);

    // TODO(@darzu): adding the MeshHandle outside the constructor is a little wierd
    const meshHandle = this.renderer.addMeshInstance(otherMesh);
    EM.addComponent(obj.entity.id, MeshHandleDef, meshHandle);

    this._liveObjects.push(obj);
  }

  private computeLiveObjects() {
    this._liveObjects = [];
    for (let obj of this._objects.values()) {
      if (!obj.deleted) this._liveObjects.push(obj);
    }
  }

  removeObject(obj: GameObject) {
    this.numObjects--;
    obj.deleted = true;
    this.computeLiveObjects();

    const { meshHandle } = EM.findEntity(obj.id, [MeshHandleDef])!;

    this.renderer.removeMesh(meshHandle);
  }

  getObject(id: number) {
    return this._objects.get(id);
  }

  allObjects(): GameObject[] {
    return Array.from(this._objects.values());
  }

  liveObjects(): GameObject[] {
    return this._liveObjects;
  }

  liveObjectsMap(): Map<number, GameObject> {
    let output = new Map();
    for (let obj of this._objects.values()) {
      if (!obj.deleted) output.set(obj.id, obj);
    }
    return output;
  }

  addPlayer(): [number, GameObject] {
    let id = this.nextPlayerId;
    this.nextPlayerId += 1;
    let obj = this.playerObject(id);
    this.addObject(obj);
    return [id, obj];
  }

  newId(): number {
    return this.nextObjectId++;
  }

  recordEvent(type: number, objects: number[], location?: vec3 | null) {
    if (!location) location = null;
    // return; // TODO(@darzu): TO DEBUG this fn is costing a ton of memory
    let objs = objects.map((id) => this._objects.get(id)!);
    // check to see whether we're the authority for this event
    if (this.eventAuthority(type, objs) == this.me) {
      // TODO(@darzu): DEBUGGING
      // console.log(`Recording event type=${type}`);
      let id = this.newId();
      let event = { id, type, objects, authority: this.me, location };
      if (!this.legalEvent(event)) {
        throw "Ilegal event in recordEvent--game logic should prevent this";
      }
      this.requestedEvents.push(event);
    }
  }

  legalEvent(_event: GameEvent) {
    return true;
  }

  // Subclasses can override this to handle authority differently depending on the event type
  eventAuthority(_type: number, objects: GameObject[]) {
    return Math.min(...objects.map((o) => o.authority));
  }

  step(dt: number) {
    this.stepGame(dt);

    // move, check collisions
    // TODO(@darzu): Remove after ECS stuff
    const { physicsResults } = EM.findSingletonEntity(PhysicsResultsDef)!;
    this.collidesWith = physicsResults.collidesWith;

    // deal with any collisions
    this.handleCollisions();
  }
}
