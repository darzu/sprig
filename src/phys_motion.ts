import { quat, vec3 } from "./gl-matrix.js";

/*
TODO:
forces, velocity, acceleration, etc.

from GameObject:

location: vec3;
rotation: quat;
at_rest: boolean;
linear_velocity: vec3;
angular_velocity: vec3;

location_error: vec3;
rotation_error: quat;

error handling:
    SnapLocation:
        current_location += location_error
        location_error = 0
    otherwise, slowly decrease error
    render at: location + location_error

How do we handle error w/ the physics system?
     lerp values?

How do we do push back?
     velocity in a direction,
     collision with other AABB,
     push back / displace objects
        which objects?
            based on mass?

Motion system:
    check for changes since last update, for each property
        (loc - last_loc)
    
*/

export interface MotionObject {
  location: vec3;
  rotation: quat;
  linearVelocity: vec3;
  angularVelocity: vec3;
  atRest: boolean;

  _lastLocation: vec3;
  _lastRotation: quat;
  _lastLinearVelocity: vec3;
  _lastAngularVelocity: vec3;
  _lastAtRest: boolean;
}

export function createMotionObject(init: Partial<MotionObject>): MotionObject {
  // TODO(@darzu): this is difficult to keep in sync with MotionObject as fields are added/removed/changed
  if (!init.location) init.location = vec3.create();
  if (!init.rotation) init.rotation = quat.create();
  if (!init.linearVelocity) init.linearVelocity = vec3.create();
  if (!init.angularVelocity) init.angularVelocity = vec3.create();
  if (!init.atRest) init.atRest = false;

  init._lastLocation = vec3.copy(
    init._lastLocation ?? vec3.create(),
    init.location
  );
  init._lastRotation = quat.copy(
    init._lastRotation ?? quat.create(),
    init.rotation
  );
  init._lastLinearVelocity = vec3.copy(
    init._lastLinearVelocity ?? vec3.create(),
    init.linearVelocity
  );
  init._lastAngularVelocity = vec3.copy(
    init._lastAngularVelocity ?? vec3.create(),
    init.angularVelocity
  );
  init._lastAtRest = init.atRest;

  return init as MotionObject;
}

// TODO(@darzu): Do we need state besides the list
interface MotionSet {
  objs: MotionObject[];
}

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

export function moveAndCheckObjects(
  set: { motion: MotionObject }[],
  dt: number
) {
  for (let { motion: m } of set) {
    // change location according to linear velocity
    delta = vec3.scale(delta, m.linearVelocity, dt);
    vec3.add(m.location, m.location, delta);

    // change rotation according to angular velocity
    normalizedVelocity = vec3.normalize(normalizedVelocity, m.angularVelocity);
    let angle = vec3.length(m.angularVelocity) * dt;
    deltaRotation = quat.setAxisAngle(deltaRotation, normalizedVelocity, angle);
    quat.normalize(deltaRotation, deltaRotation);
    // note--quat multiplication is not commutative, need to multiply on the left
    quat.multiply(m.rotation, deltaRotation, m.rotation);

    // remember previous data so we can know if random other code messes
    //    with our physics values.
    vec3.copy(m._lastLocation, m.location);
    quat.copy(m._lastRotation, m.rotation);
    vec3.copy(m._lastLinearVelocity, m.linearVelocity);
    vec3.copy(m._lastAngularVelocity, m.angularVelocity);
    m._lastAtRest = m.atRest;
  }
}
