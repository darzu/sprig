import { quat, vec3 } from "./gl-matrix.js";
import { _playerId } from "./main.js";
import { clamp } from "./math.js";
import { CollidesWith, CollisionData, idPair, IdPair } from "./phys.js";
import { AABB } from "./phys_broadphase.js";
import { vec3Dbg } from "./utils-3d.js";

/*
How to manage sliding on contact ?
  Track contact pairs
    track normal of collision
    if still pushing into each other
      zero out the normal-of-collision component
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

export function checkAtRest(
  set: { motion: MotionProps; lastMotion: MotionProps }[],
  dt: number
) {
  // TODO(@darzu): IMPLEMENT. A lot more thought is needed for
  // putting objects to sleep and waking them up.
  for (let o of set) {
    const { motion: m, lastMotion: lm } = o;
    if (m.atRest) {
      // awake an object if its velocity changes
      if (
        !vec3.exactEquals(m.linearVelocity, lm.linearVelocity) ||
        !vec3.exactEquals(m.angularVelocity, lm.angularVelocity)
      ) {
        // console.log("awaken");
        m.atRest = false;
      }
    } else {
      if (
        // m.linearVelocity === lm.linearVelocity &&
        // m.angularVelocity === lm.angularVelocity &&
        !didMove(o)
      ) {
        // if we didn't move, we must have bumped into something
        // if that something is static, we're truely going to stay at rest
        // if that something is dynamic, we will count on it to awaken us
        //    a dynamic object that prevents another object from moving must awaken that object
        //    this is required of all constraint solvers
        // console.log("to sleep");
        m.atRest = true;
      }
    }
  }
}

export function didMove(o: {
  motion: MotionProps;
  lastMotion: MotionProps;
}): boolean {
  // TODO(@darzu): this might be redundent with vec3.equals which does a epsilon check
  const EPSILON = 0.01;
  return (
    Math.abs(o.motion.location[0] - o.lastMotion.location[0]) > EPSILON ||
    Math.abs(o.motion.location[1] - o.lastMotion.location[1]) > EPSILON ||
    Math.abs(o.motion.location[2] - o.lastMotion.location[2]) > EPSILON
  );
}

// TODO(@darzu):
// function normalOfCollisions(a: PhysicsObject, b: PhysicsObject) {
//   const x =
// }

// TODO(@darzu): physics step
export function moveObjects(
  set: Record<number, { id: number; motion: MotionProps; worldAABB: AABB }>,
  dt: number,
  lastCollidesWith: CollidesWith,
  lastCollidesData: Map<IdPair, CollisionData>
) {
  const objs = Object.values(set);

  for (let { id, motion: m, worldAABB } of objs) {
    // TODO(@darzu): IMPLEMENT
    // if (m.atRest) {
    //   continue;
    // }

    // clamp linear velocity based on size
    const vxMax = (worldAABB.max[0] - worldAABB.min[0]) / dt;
    const vyMax = (worldAABB.max[1] - worldAABB.min[1]) / dt;
    const vzMax = (worldAABB.max[2] - worldAABB.min[2]) / dt;
    m.linearVelocity[0] = clamp(m.linearVelocity[0], -vxMax, vxMax);
    m.linearVelocity[1] = clamp(m.linearVelocity[1], -vyMax, vyMax);
    m.linearVelocity[2] = clamp(m.linearVelocity[2], -vzMax, vzMax);

    // check for collision constraints
    const constrainedVelocity = vec3.clone(m.linearVelocity);
    for (let oId of lastCollidesWith.get(id) ?? []) {
      const other = set[oId];
      if (!other) continue;

      const data = lastCollidesData.get(idPair(id, oId));
      if (!data) continue;

      // // TODO(@darzu): DEBUG
      // if (_playerId === id) {
      //   console.log(`col w/ ${oId}`);
      // }

      // TODO(@darzu): this is a mess
      const overlap = data.aId === id ? data.aOverlap : data.bOverlap;
      const reboundDir = vec3.normalize(vec3.create(), overlap);
      vec3.negate(reboundDir, reboundDir);
      const aInDirOfB = vec3.dot(constrainedVelocity, reboundDir);
      if (aInDirOfB > 0) {
        // TODO(@darzu): re-enable
        vec3.sub(
          constrainedVelocity,
          constrainedVelocity,
          vec3.scale(vec3.create(), reboundDir, aInDirOfB)
        );

        // TODO(@darzu): DEBUG
        if (id === _playerId) {
          console.log(
            `playerV: ${vec3Dbg(m.linearVelocity)}->${vec3Dbg(
              constrainedVelocity
            )}`
          );
        }
      } else {
        // if (_playerId === id) {
        //   console.log(
        //     `${vec3Dbg(m.linearVelocity)} dot ${vec3Dbg(
        //       reboundDir
        //     )} = aInDirOfB ${aInDirOfB}`
        //   );
        // }
      }

      // TODO(@darzu): We need normal of collision and nearest points
      //    we need this in the CollidesWith set. not good to compute here
    }

    // change location according to linear velocity
    // TODO(@darzu): DEBUGGING
    delta = vec3.scale(delta, constrainedVelocity, dt);
    // delta = vec3.scale(delta, m.linearVelocity, dt);
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
