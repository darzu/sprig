import { mat4, vec3, quat } from "./gl-matrix.js";
import { Serializer, Deserializer } from "./serialize.js";
import { Mesh } from "./mesh-pool.js";
import { Renderer } from "./render_webgpu.js";
import { AABB, checkCollisions } from "./physics.js";

const ERROR_SMOOTHING_FACTOR = 0.8;
const EPSILON = 0.0001;

export function scaleMesh(m: Mesh, by: number): Mesh {
  let pos = m.pos.map((p) => vec3.scale(vec3.create(), p, by));
  return { ...m, pos };
}

const working_quat = quat.create();
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
  id: number;
  creator: number;
  location: vec3;
  rotation: quat;
  at_rest: boolean;
  linear_velocity: vec3;
  angular_velocity: vec3;
  authority: number;
  authority_seq: number;
  snap_seq: number;
  location_error: vec3;
  rotation_error: quat;
  localAABB: AABB;

  // derivative state:
  // NOTE: it kinda sucks to have duplicate sources of truth on loc & rot, 
  // but it's more important that we don't unnecessarily recompute this transform
  transform: mat4;

  constructor(id: number, creator: number) {
    this.id = id;
    this.creator = creator;
    this.location = vec3.fromValues(0, 0, 0);
    this.rotation = quat.identity(quat.create());
    this.linear_velocity = vec3.fromValues(0, 0, 0);
    this.angular_velocity = vec3.fromValues(0, 0, 0);
    this.at_rest = true;
    this.authority = creator;
    this.authority_seq = 0;
    this.snap_seq = -1;
    this.location_error = vec3.fromValues(0, 0, 0);
    this.rotation_error = quat.create();
    this.transform = mat4.create();
    this.localAABB = { min: vec3.fromValues(-1, -1, -1), max: vec3.fromValues(1, 1, 1) };
  }

  snapLocation(location: vec3) {
    // TODO: this is a hack to see if we're setting our location for the first time
    if (vec3.length(this.location) === 0) {
      this.location = location;
      return;
    }
    let current_location = vec3.add(
      this.location,
      this.location,
      this.location_error
    );
    let location_error = vec3.sub(current_location, current_location, location);
    this.location = location;
    this.location_error = location_error;
  }

  snapRotation(rotation: quat) {
    // TODO: this is a hack to see if we're setting our rotation for the first time
    let id = quat.identity(working_quat);
    if (quat.equals(rotation, id)) {
      this.rotation = rotation;
      return;
    }
    let current_rotation = quat.mul(
      this.rotation,
      this.rotation,
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
    this.rotation = rotation;
    this.rotation_error = rotation_error;
  }

  syncPriority(): number {
    return 1;
  }

  claimAuthority(authority: number, authority_seq: number): boolean {
    if (
      this.authority_seq < authority_seq ||
      (this.authority_seq == authority_seq && authority <= this.authority)
    ) {
      this.authority = authority;
      this.authority_seq = authority_seq;
      return true;
    }
    return false;
  }

  abstract serializeFull(buf: Serializer): void;

  abstract serializeDynamic(buf: Serializer): void;

  abstract deserializeFull(buf: Deserializer): void;

  abstract deserializeDynamic(buf: Deserializer): void;

  abstract mesh(): Mesh;

  abstract typeId(): number;
}

export abstract class GameState<Inputs> {
  protected nextPlayerId: number;
  nextObjectId: number;
  protected renderer: Renderer;
  objects: Record<number, GameObject>;
  me: number;
  numObjects: number = 0;

  constructor(renderer: Renderer) {
    this.me = 0;
    this.renderer = renderer;
    this.nextPlayerId = 0;
    this.nextObjectId = 0;
    this.objects = [];
  }

  abstract playerObject(playerId: number): GameObject;

  abstract stepGame(dt: number, inputs: Inputs): void;

  abstract viewMatrix(): mat4;

  abstract objectOfType(
    typeID: number,
    id: number,
    creator: number
  ): GameObject;

  addObject(obj: GameObject) {
    this.numObjects++;
    this.objects[obj.id] = obj;
    this.renderer.addObject(obj);
  }

  renderFrame() {
    this.renderer.renderFrame(this.viewMatrix());
  }

  addPlayer(): [number, Object] {
    let id = this.nextPlayerId;
    this.nextPlayerId += 1;
    let obj = this.playerObject(id);
    this.addObject(obj);
    return [id, obj];
  }

  id(): number {
    return this.nextObjectId++;
  }

  step(dt: number, inputs: Inputs) {
    this.stepGame(dt, inputs);

    const objs = Object.values(this.objects)

    // update location and rotation
    let identity_quat = quat.create();
    let delta = vec3.create();
    let normalized_velocity = vec3.create();
    let deltaRotation = quat.create();
    for (let o of objs) {
      // reduce error in location and rotation
      o.location_error = vec3.scale(
        o.location_error,
        o.location_error,
        ERROR_SMOOTHING_FACTOR
      );
      let location_error_magnitude = vec3.length(o.location_error);
      if (
        location_error_magnitude !== 0 &&
        location_error_magnitude < EPSILON
      ) {
        //console.log(`Object ${o.id} reached 0 location error`);
        o.location_error = vec3.fromValues(0, 0, 0);
      }

      o.rotation_error = quat.slerp(
        o.rotation_error,
        o.rotation_error,
        identity_quat,
        1 - ERROR_SMOOTHING_FACTOR
      );
      let rotation_error_magnitude = Math.abs(
        quat.getAngle(o.rotation_error, identity_quat)
      );
      if (
        rotation_error_magnitude !== 0 &&
        rotation_error_magnitude < EPSILON
      ) {
        //console.log(`Object ${o.id} reached 0 rotation error`);
        o.rotation_error = identity_quat;
      }

      // change location according to linear velocity
      delta = vec3.scale(delta, o.linear_velocity, dt);
      vec3.add(o.location, o.location, delta);

      // change rotation according to angular velocity
      normalized_velocity = vec3.normalize(
        normalized_velocity,
        o.angular_velocity
      );
      let angle = vec3.length(o.angular_velocity) * dt;
      deltaRotation = quat.setAxisAngle(
        deltaRotation,
        normalized_velocity,
        angle
      );
      quat.normalize(deltaRotation, deltaRotation);
      // note--quat multiplication is not commutative, need to multiply on the left
      quat.multiply(o.rotation, deltaRotation, o.rotation);
    }

    // update transforms based on new rotations and positions
    for (let o of objs) {
      mat4.fromRotationTranslation(
        o.transform,
        quat.mul(working_quat, o.rotation, o.rotation_error),
        vec3.add(working_vec3, o.location, o.location_error)
      );
    }

    // check collisions
    // TODO(@darzu): hack. also we need AABBs on objects
    // const collidesWith = checkCollisions(objs);
    // for (let o of os) {
    //   o.color = collidesWith[o.id] ? vec3.fromValues(0.2, 0.0, 0.0) : vec3.fromValues(0.0, 0.2, 0.0)
    // }
  }
}