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

interface MotionObj {
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

interface MotionSet {
  objs: MotionObj[];
}

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

function moveAndCheckObjects(set: MotionSet, dt: number) {
  for (let o of set.objs) {
    // change location according to linear velocity
    delta = vec3.scale(delta, o.linearVelocity, dt);
    vec3.add(o.location, o.location, delta);

    // change rotation according to angular velocity
    normalizedVelocity = vec3.normalize(normalizedVelocity, o.angularVelocity);
    let angle = vec3.length(o.angularVelocity) * dt;
    deltaRotation = quat.setAxisAngle(deltaRotation, normalizedVelocity, angle);
    quat.normalize(deltaRotation, deltaRotation);
    // note--quat multiplication is not commutative, need to multiply on the left
    quat.multiply(o.rotation, deltaRotation, o.rotation);

    // remember previous data so we can know if random other code messes
    //    with our physics values.
    o._lastLocation = o.location;
    o._lastRotation = o.rotation;
    o._lastLinearVelocity = o.linearVelocity;
    o._lastAngularVelocity = o.angularVelocity;
    o._lastAtRest = o.atRest;
  }
}
