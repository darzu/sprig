import { mat4, vec3, quat } from "./gl-matrix.js";
import { Serializer, Deserializer } from "./serialize.js";
import { Mesh, MeshHandle } from "./mesh-pool.js";
import { Renderer } from "./render_webgpu.js";
import { AABB, checkCollisions, copyAABB } from "./phys_broadphase.js";
import {
  copyMotionProps,
  createMotionProps,
  Motion,
  MotionDef,
} from "./phys_motion.js";
import { CollidesWith, ReboundData, IdPair } from "./phys.js";
import { Inputs } from "./inputs.js";
import { Collider, ColliderDef } from "./collider.js";
import { EM, Entity } from "./entity-manager.js";
import {
  MotionErrorDef,
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
const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;

export function scaleMesh(m: Mesh, by: number): Mesh {
  let pos = m.pos.map((p) => vec3.scale(vec3.create(), p, by));
  return { ...m, pos };
}
export function scaleMesh3(m: Mesh, by: vec3): Mesh {
  let pos = m.pos.map((p) => vec3.multiply(vec3.create(), p, by));
  return { ...m, pos };
}

const working_quat = quat.create();
const identity_quat = quat.create();
const working_vec3 = vec3.create();

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
  inWorld: boolean = true;
  deleted: boolean = false;

  // ECS controlled stuff below this
  get id() {
    return this.entity.id;
  }
  motion: Motion;
  location_error: vec3;
  rotation_error: quat;
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

    const err = EM.addComponent(this.id, MotionErrorDef);
    this.location_error = err.location_error;
    this.rotation_error = err.rotation_error;

    this.transform = EM.addComponent(this.id, TransformDef);

    this._parent = EM.addComponent(this.id, ParentDef);

    this.renderable = EM.addComponent(this.id, RenderableDef);

    this._phys = EM.addComponent(this.id, PhysicsStateDef);

    this._collider = EM.addComponent(this.id, ColliderDef);

    // TODO(@darzu): ECS this shit
    // this.lastMotion = undefined;
    this.authority = creator;
    this.authority_seq = 0;
    this.snap_seq = -1;
    // this.collider = { shape: "Empty", solid: false };
  }

  snapLocation(location: vec3) {
    // TODO: this is a hack to see if we're setting our location for the first time
    if (vec3.length(this.motion.location) === 0) {
      vec3.copy(this.motion.location, location);
      return;
    }
    let current_location = vec3.add(
      this.motion.location,
      this.motion.location,
      this.location_error
    );
    let location_error = vec3.sub(current_location, current_location, location);

    // The order of these copies is important. At this point, the calculated
    // location error actually lives in this.motion.location. So we copy it over
    // to this.location_error, then copy the new location into this.motion.location.

    vec3.copy(this.location_error, location_error);
    vec3.copy(this.motion.location, location);
  }

  snapRotation(rotation: quat) {
    // TODO: this is a hack to see if we're setting our rotation for the first time
    let id = identity_quat;
    if (quat.equals(rotation, id)) {
      this.motion.rotation = quat.copy(this.motion.rotation, rotation);
      return;
    }
    let current_rotation = quat.mul(
      this.motion.rotation,
      this.motion.rotation,
      this.rotation_error
    );
    // sort of a hack--reuse our current rotation error quat to store the
    // rotation inverse to avoid a quat allocation
    let rotation_inverse = quat.invert(this.rotation_error, rotation);
    let rotation_error = quat.mul(
      current_rotation,
      current_rotation,
      rotation_inverse
    );

    // The order of these copies is important--see the similar comment in
    // snapLocation above.

    this.rotation_error = quat.copy(this.rotation_error, rotation_error);
    this.motion.rotation = quat.copy(this.motion.rotation, rotation);
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
    this.snapLocation(
      vec3.add(working_vec3, this.motion.location, working_vec3)
    );

    let axis = vec3.normalize(working_vec3, this.motion.angularVelocity);
    let angle = vec3.length(this.motion.angularVelocity) * dt;
    let deltaRotation = quat.setAxisAngle(working_quat, axis, angle);
    quat.normalize(deltaRotation, deltaRotation);
    quat.multiply(working_quat, deltaRotation, this.motion.rotation);
    quat.normalize(working_quat, working_quat);
    this.snapRotation(working_quat);
  }

  abstract serializeFull(buf: Serializer): void;

  abstract serializeDynamic(buf: Serializer): void;

  abstract deserializeFull(buf: Deserializer): void;

  abstract deserializeDynamic(buf: Deserializer): void;

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

  abstract stepGame(dt: number, inputs: Inputs): void;

  abstract handleCollisions(): void;

  abstract runEvent(event: GameEvent): void;

  abstract viewMatrix(): mat4;

  abstract objectOfType(
    typeID: number,
    id: number,
    creator: number
  ): GameObject;

  addObject(obj: GameObject) {
    this.numObjects++;
    this._objects.set(obj.id, obj);
    this.renderer.addObject(obj);
    this._liveObjects.push(obj);
  }

  addObjectInstance(obj: GameObject, otherMesh: MeshHandle) {
    this.numObjects++;
    this._objects.set(obj.id, obj);
    this.renderer.addObjectInstance(obj, otherMesh);
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
    this.renderer.removeObject(obj);
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

  renderFrame() {
    this.renderer.renderFrame(this.viewMatrix());
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

  // Does a topological sort on objects according to the parent relationship
  // TODO: optimize this
  private sortedObjects(): GameObject[] {
    let objects = this._objects.values();
    let children: { [id: number]: number[] } = {};
    let sources: GameObject[] = [];
    let output: GameObject[] = [];
    // find each object's children
    for (let o of objects) {
      if (o.deleted) continue;
      let parent = o.parent;
      if (parent > 0) {
        if (!children[parent]) {
          children[parent] = [];
        }
        children[parent].push(o.id);
      } else {
        sources.push(o);
      }
    }
    while (sources.length > 0) {
      let o = sources.pop()!;
      output.push(o);
      if (children[o.id]) {
        for (let c of children[o.id]) {
          sources.push(this._objects.get(c)!);
        }
      }
    }
    return output;
  }

  // Subclasses can override this to handle authority differently depending on the event type
  eventAuthority(_type: number, objects: GameObject[]) {
    return Math.min(...objects.map((o) => o.authority));
  }

  step(dt: number, inputs: Inputs) {
    this.stepGame(dt, inputs);

    const objs = this.sortedObjects();

    // reduce error in location and rotation
    let identity_quat = quat.set(working_quat, 0, 0, 0, 1);

    for (let o of objs) {
      o.location_error = vec3.scale(
        o.location_error,
        o.location_error,
        ERROR_SMOOTHING_FACTOR ** dt
      );
      let location_error_magnitude = vec3.length(o.location_error);
      if (
        location_error_magnitude !== 0 &&
        location_error_magnitude < EPSILON
      ) {
        //console.log(`Object ${o.id} reached 0 location error`);
        o.location_error = vec3.set(o.location_error, 0, 0, 0);
      }
      o.rotation_error = quat.slerp(
        o.rotation_error,
        o.rotation_error,
        identity_quat,
        1 - ERROR_SMOOTHING_FACTOR ** dt
      );
      quat.normalize(o.rotation_error, o.rotation_error);
      let rotation_error_magnitude = Math.abs(
        quat.getAngle(o.rotation_error, identity_quat)
      );
      if (
        rotation_error_magnitude !== 0 &&
        rotation_error_magnitude < EPSILON
      ) {
        //console.log(`Object ${o.id} reached 0 rotation error`);
        o.rotation_error = quat.copy(o.rotation_error, identity_quat);
      }
    }

    // move, check collisions
    // TODO(@darzu): Remove after ECS stuff
    const { physicsResults } = EM.findSingletonEntity(PhysicsResultsDef);
    this.collidesWith = physicsResults.collidesWith;

    // deal with any collisions
    this.handleCollisions();
  }
}
