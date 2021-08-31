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

export interface MotionProps {
  location: vec3;
  rotation: quat;
  linearVelocity: vec3;
  angularVelocity: vec3;
  atRest: boolean;
}

export function copyMotionProps(
  dest: MotionProps,
  src: MotionProps
): MotionProps {
  vec3.copy(dest.location, src.location);
  quat.copy(dest.rotation, src.rotation);
  vec3.copy(dest.linearVelocity, src.linearVelocity);
  vec3.copy(dest.angularVelocity, src.angularVelocity);
  dest.atRest = dest.atRest;
  return dest;
}

export function createMotionProps(init: Partial<MotionProps>): MotionProps {
  // TODO(@darzu): this is difficult to keep in sync with MotionObject as fields are added/removed/changed
  if (!init.location) init.location = vec3.create();
  if (!init.rotation) init.rotation = quat.create();
  if (!init.linearVelocity) init.linearVelocity = vec3.create();
  if (!init.angularVelocity) init.angularVelocity = vec3.create();
  if (!init.atRest) init.atRest = false;

  return init as MotionProps;
}

// TODO(@darzu): Do we need state besides the list
// interface MotionSet {
//   objs: MotionProps[];
// }

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): physics step
export function moveObjects(set: { motion: MotionProps }[], dt: number) {
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
  }
}
