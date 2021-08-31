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
  color: vec3;

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
    this.color = vec3.fromValues(0, 0, 0);
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
    const os = Object.values(this.objects);
    for (let o of os) {
      // change location according to linear velocity
      let delta = vec3.scale(vec3.create(), o.linear_velocity, dt);
      vec3.add(o.location, o.location, delta);
    }

    // check collisions
    const collidesWith = checkCollisions(os);
    // TODO(@darzu): hack.
    for (let o of os) {
      o.color = collidesWith[o.id] ? vec3.fromValues(0.2, 0.0, 0.0) : vec3.fromValues(0.0, 0.2, 0.0)
    }

    for (let o of os) {
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

interface CollidesWith {
  // one-to-many GameObject ids
  [key: number]: number[]
}
export let _lastCollisionTestTimeMs = 0; // TODO(@darzu): hack
function checkCollisions(os: { aabb: () => AABB, id: number }[]): CollidesWith {
  const start = performance.now()
  const aabbs = os.map(o => o.aabb())
  const collidesWith: CollidesWith = {}
  // TODO(@darzu): do better than n^2. oct-tree
  // TODO(@darzu): be more precise than just AABBs. broad & narrow phases.
  // TODO(@darzu): also use better memory pooling for aabbs and collidesWith relation
  for (let i0 = 0; i0 < aabbs.length; i0++) {
    const box0 = aabbs[i0]
    for (let i1 = i0 + 1; i1 < aabbs.length; i1++) {
      const box1 = aabbs[i1]
      if (doesOverlap(box0, box1)) {
        const id0 = os[i0].id
        const id1 = os[i1].id
        collidesWith[id0] = [...(collidesWith[id0] ?? []), id1]
        collidesWith[id1] = [...(collidesWith[id1] ?? []), id0]
      }
    }
  }
  _lastCollisionTestTimeMs = performance.now() - start;
  return collidesWith;
}
function doesOverlap(a: AABB, b: AABB) {
  return true
    && b.min[0] <= a.max[0]
    && b.min[1] <= a.max[1]
    && b.min[2] <= a.max[2]
    && a.min[0] <= b.max[0]
    && a.min[1] <= b.max[1]
    && a.min[2] <= b.max[2]
}


// import dimforgeRapier3d from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';
import * as RAPIER from './rapier3d-dz.js';
console.dir(RAPIER)

{
  // Use the RAPIER module here.
  let gravity = { x: 0.0, y: -9.81, z: 0.0 };
  let world = new RAPIER.World(gravity);

  // Create the ground
  let groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0);
  world.createCollider(groundColliderDesc);

  // Create a dynamic rigid-body.
  let rigidBodyDesc = RAPIER.RigidBodyDesc.newDynamic()
    .setTranslation(0.0, 1.0, 0.0);
  let rigidBody = world.createRigidBody(rigidBodyDesc);

  // Create a cuboid collider attached to the dynamic rigidBody.
  let colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
  let collider = world.createCollider(colliderDesc, rigidBody.handle);

  // Game loop. Replace by your own game loop system.
  let gameLoop = () => {
    // Ste the simulation forward.  
    world.step();

    // Get and print the rigid-body's position.
    let position = rigidBody.translation();
    console.log("Rigid-body position: ", position.x, position.y, position.z);

    setTimeout(gameLoop, 16);
  };

  gameLoop();
}