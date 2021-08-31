import { mat4, vec3, quat } from "./gl-matrix.js";

// defines the geometry and coloring of a mesh
export interface Mesh {
  pos: vec3[];
  tri: vec3[];
  colors: vec3[]; // colors per triangle in r,g,b float [0-1] format
}

export abstract class GameObject {
  location: vec3;
  rotation: quat;
  at_rest: boolean;
  linear_velocity: vec3;
  angular_velocity: vec3;
  owner: number;
  authority: number;

  constructor() {
    this.location = vec3.fromValues(0, 0, 0);
    this.rotation = quat.identity(quat.create());
    this.linear_velocity = vec3.fromValues(0, 0, 0);
    this.angular_velocity = vec3.fromValues(0, 0, 0);
    this.at_rest = true;
    this.owner = 0;
    this.authority = 0;
  }

  transform(): mat4 {
    return mat4.fromRotationTranslation(
      mat4.create(),
      this.rotation,
      this.location
    );
  }

  abstract mesh(): Mesh;
}

export interface GameView {
  viewMatrix(): mat4;
  objects(): GameObject[];
}

export abstract class GameState<Inputs> implements GameView {
  protected time: number;

  constructor(time: number) {
    this.time = time;
  }

  abstract objects(): GameObject[];

  abstract stepGame(dt: number, inputs: Inputs): void;

  abstract viewMatrix(): mat4;

  step(time: number, inputs: Inputs) {
    console.log(`step at time ${time}`);
    let dt = time - this.time;
    this.stepGame(dt, inputs);
    for (let o of this.objects()) {
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
