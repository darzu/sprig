import { mat4, vec3, quat } from "./gl-matrix.js";
import { Renderer } from "./render.js";

// defines the geometry and coloring of a mesh
export interface Mesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
}

export function scaleMesh(m: Mesh, by: number): Mesh {
  let pos = m.pos.map((p) => vec3.scale(vec3.create(), p, by));
  return { pos, tri: m.tri, colors: m.colors };
}

// axis-aligned bounding-box
export interface AABB {
  min: vec3;
  max: vec3;
}

export abstract class GameObject {
  id: number;
  location: vec3;
  rotation: quat;
  at_rest: boolean;
  linear_velocity: vec3;
  angular_velocity: vec3;
  authority: number;
  authority_seq: number;
  snap_seq: number;

  constructor(id: number) {
    this.id = id;
    this.location = vec3.fromValues(0, 0, 0);
    this.rotation = quat.identity(quat.create());
    this.linear_velocity = vec3.fromValues(0, 0, 0);
    this.angular_velocity = vec3.fromValues(0, 0, 0);
    this.at_rest = true;
    this.authority = 0;
    this.authority_seq = 0;
    this.snap_seq = -1;
  }

  transform(): mat4 {
    return mat4.fromRotationTranslation(
      mat4.create(),
      this.rotation,
      this.location
    );
  }

  netObject(): NetObject {
    let obj: any = {
      id: this.id,
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

  abstract mesh(): Mesh;

  abstract type(): string;

  abstract aabb(): AABB;
}

export type NetObject = any;

export abstract class GameState<Inputs> {
  protected time: number;
  protected nextPlayerId: number;
  protected nextObjectId: number;
  protected renderer: Renderer;
  objects: Record<number, GameObject>;
  me: number;

  constructor(time: number, renderer: Renderer) {
    this.me = 0;
    this.time = time;
    this.renderer = renderer;
    this.nextPlayerId = 0;
    this.nextObjectId = 0;
    this.objects = [];
  }

  abstract playerObject(playerId: number): GameObject;

  abstract stepGame(dt: number, inputs: Inputs): void;

  abstract viewMatrix(): mat4;

  abstract objectFromNetObject(NetObject: NetObject): GameObject;

  addObject(obj: GameObject) {
    this.objects[obj.id] = obj;
    this.renderer.addObject(obj);
  }

  addObjectFromNet(netObj: NetObject): GameObject {
    let obj = this.objectFromNetObject(netObj);
    obj.id = netObj.id;

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

  step(time: number, inputs: Inputs) {
    let dt = time - this.time;
    this.stepGame(dt, inputs);
    for (let o of Object.values(this.objects)) {
      // TODO(@darzu): collisions, push-back
      // change location according to linear velocity
      let delta = vec3.scale(vec3.create(), o.linear_velocity, dt);
      vec3.add(o.location, o.location, delta);

      // change rotation according to angular velocity
      let normalized_velocity = vec3.normalize(
        vec3.create(),
        o.angular_velocity
      );
      let angle = vec3.length(o.angular_velocity) * dt;
      let deltaRotation = quat.setAxisAngle(
        quat.create(),
        normalized_velocity,
        angle
      );
      quat.normalize(deltaRotation, deltaRotation);
      // note--quat multiplication is not commutative, need to multiply on the left
      quat.multiply(o.rotation, deltaRotation, o.rotation);
    }
    this.time = time;
  }
}

/*
collision detection
  define AABB boxes for everyone
  check for collisions

*/