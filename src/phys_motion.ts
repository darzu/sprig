import { quat, vec3 } from "./gl-matrix.js";
import { _playerId } from "./main.js";
import { clamp } from "./math.js";
import { CollidesWith, idPair, IdPair, ContactData, __step } from "./phys.js";
import { AABB } from "./phys_broadphase.js";
import { vec3Dbg } from "./utils-3d.js";
export interface MotionProps {
  linearVelocity: vec3;
  angularVelocity: vec3;
  location: vec3;
  rotation: quat;
}

export function copyMotionProps(
  dest: MotionProps,
  src: Partial<MotionProps>
): MotionProps {
  if (src.location) vec3.copy(dest.location, src.location);
  if (src.rotation) quat.copy(dest.rotation, src.rotation);
  if (src.linearVelocity) vec3.copy(dest.linearVelocity, src.linearVelocity);
  if (src.angularVelocity) vec3.copy(dest.angularVelocity, src.angularVelocity);
  return dest;
}

export function createMotionProps(init: Partial<MotionProps>): MotionProps {
  // TODO(@darzu): this is difficult to keep in sync with MotionObject as fields are added/removed/changed
  if (!init.location) init.location = vec3.create();
  if (!init.rotation) init.rotation = quat.create();
  if (!init.linearVelocity) init.linearVelocity = vec3.create();
  if (!init.angularVelocity) init.angularVelocity = vec3.create();

  return init as MotionProps;
}

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): implement checkAtRest (deleted in this commit)

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

const _constrainedVelocities = new Map<number, vec3>();

export interface MotionObj {
  id: number;
  motion: MotionProps;
  worldAABB: AABB;
}

export function moveObjects(
  set: Record<number, MotionObj>,
  dt: number,
  lastCollidesWith: CollidesWith,
  lastContactData: Map<IdPair, ContactData>
) {
  const objs = Object.values(set);

  // copy .motion to .motion; we want to try to meet the gameplay wants
  for (let o of objs) {
    copyMotionProps(o.motion, o.motion);
  }

  // TODO(@darzu): probably don't need this intermediate _constrainedVelocities
  _constrainedVelocities.clear();

  // check for collision constraints
  // TODO(@darzu): this is a velocity constraint and ideally should be nicely extracted
  for (let [abId, data] of lastContactData) {
    // TODO(@darzu): we're a bit free with vector creation here, are the memory implications bad?
    const bReboundDir = vec3.clone(data.bToANorm);
    const aReboundDir = vec3.negate(vec3.create(), bReboundDir);

    const a = set[data.aId];
    const b = set[data.bId];

    if (!!a) {
      const aConVel =
        _constrainedVelocities.get(data.aId) ??
        vec3.clone(set[data.aId].motion.linearVelocity);
      const aInDirOfB = vec3.dot(aConVel, aReboundDir);
      if (aInDirOfB > 0) {
        vec3.sub(
          aConVel,
          aConVel,
          vec3.scale(vec3.create(), aReboundDir, aInDirOfB)
        );
        _constrainedVelocities.set(data.aId, aConVel);
      }
    }

    if (!!b) {
      const bConVel =
        _constrainedVelocities.get(data.bId) ??
        vec3.clone(set[data.bId].motion.linearVelocity);
      const bInDirOfA = vec3.dot(bConVel, bReboundDir);
      if (bInDirOfA > 0) {
        vec3.sub(
          bConVel,
          bConVel,
          vec3.scale(vec3.create(), bReboundDir, bInDirOfA)
        );
        _constrainedVelocities.set(data.bId, bConVel);
      }
    }
  }

  // update velocity with constraints
  for (let { id, motion: m } of objs) {
    if (_constrainedVelocities.has(id))
      vec3.copy(m.linearVelocity, _constrainedVelocities.get(id)!);
  }

  for (let { id, motion: m, worldAABB } of objs) {
    // clamp linear velocity based on size
    const vxMax = (worldAABB.max[0] - worldAABB.min[0]) / dt;
    const vyMax = (worldAABB.max[1] - worldAABB.min[1]) / dt;
    const vzMax = (worldAABB.max[2] - worldAABB.min[2]) / dt;
    m.linearVelocity[0] = clamp(m.linearVelocity[0], -vxMax, vxMax);
    m.linearVelocity[1] = clamp(m.linearVelocity[1], -vyMax, vyMax);
    m.linearVelocity[2] = clamp(m.linearVelocity[2], -vzMax, vzMax);

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
