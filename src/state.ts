import { mat4, vec3, quat } from "./gl-matrix.js";
import { Mesh } from "./mesh-pool.js";
import { Renderer } from "./render_webgpu.js";

const ERROR_SMOOTHING_FACTOR = 0.8;
const EPSILON = 0.0001;

export function scaleMesh(m: Mesh, by: number): Mesh {
  let pos = m.pos.map((p) => vec3.scale(vec3.create(), p, by));
  return { ...m, pos };
}

const working_quat = quat.create();
const working_vec3 = vec3.create();

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
  private _transform: mat4;

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
    this._transform = mat4.create();
  }

  snapLocation(location: vec3) {
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

  transform(): mat4 {
    return mat4.fromRotationTranslation(
      this._transform,
      quat.mul(working_quat, this.rotation, this.rotation_error),
      vec3.add(working_vec3, this.location, this.location_error)
    );
  }

  netObject(): NetObject {
    let obj: any = {
      id: this.id,
      creator: this.creator,
      location: Array.from(this.location),
      rotation: Array.from(this.rotation),
      at_rest: this.at_rest,
      linear_velocity: Array.from(this.linear_velocity),
      angular_velocity: Array.from(this.angular_velocity),
      authority: this.authority,
      authority_seq: this.authority_seq,
      type: this.type(),
    };
    return obj;
  }

  syncPriority(): number {
    return 1;
  }

  abstract mesh(): Mesh;

  abstract type(): string;
}

export type NetObject = any;

export abstract class GameState<Inputs> {
  protected nextPlayerId: number;
  nextObjectId: number;
  protected renderer: Renderer;
  objects: Record<number, GameObject>;
  me: number;

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

  abstract objectFromNetObject(NetObject: any): GameObject;

  addObject(obj: GameObject) {
    this.objects[obj.id] = obj;
    this.renderer.addObject(obj);
  }

  addObjectFromNet(netObj: NetObject): GameObject {
    let obj = this.objectFromNetObject(netObj);
    obj.id = netObj.id;
    obj.creator = netObj.creator;

    obj.authority = netObj.authority;
    obj.authority_seq = netObj.authority_seq;

    obj.location = netObj.location;
    obj.linear_velocity = netObj.linear_velocity;

    obj.at_rest = netObj.at_rest;

    obj.angular_velocity = netObj.angular_velocity;
    obj.rotation = netObj.rotation;
    this.addObject(obj);
    return obj;
  }

  netObjects(): NetObject[] {
    return Object.values(this.objects).map((obj: GameObject) =>
      obj.netObject()
    );
  }

  renderFrame() {
    this.renderer.renderFrame(this.viewMatrix());
  }

  addPlayer(): [number, NetObject] {
    let id = this.nextPlayerId;
    this.nextPlayerId += 1;
    let obj = this.playerObject(id);
    this.addObject(obj);
    return [id, obj.netObject()];
  }

  id(): number {
    return this.nextObjectId++;
  }

  step(dt: number, inputs: Inputs) {
    this.stepGame(dt, inputs);
    let identity_quat = quat.create();
    let delta = vec3.create();
    let normalized_velocity = vec3.create();
    let deltaRotation = quat.create();
    for (let o of Object.values(this.objects)) {
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
  }
}
