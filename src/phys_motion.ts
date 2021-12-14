import { Collider } from "./collider.js";
import { quat, vec3 } from "./gl-matrix.js";
import { clamp } from "./math.js";
import { CollidesWith, idPair, IdPair, ContactData } from "./phys.js";
import { AABB } from "./phys_broadphase.js";
import { vec3Dbg } from "./utils-3d.js";
import { Position, Rotation } from "./transform.js";
import { AngularVelocity, LinearVelocity } from "./motion.js";
import { BulletDef } from "./game/bullet.js";

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): implement checkAtRest (deleted in this commit)

const _constrainedVelocities = new Map<number, vec3>();

export interface MotionObj {
  id: number;
  position: Position;
  linearVelocity?: LinearVelocity;
  rotation?: Rotation;
  angularVelocity?: AngularVelocity;
  collider: Collider;
  _phys: {
    world: AABB;
  };
}

export function moveObjects(
  objDict: Map<number, MotionObj>,
  dt: number,
  lastContactData: Map<IdPair, ContactData>
) {
  const objs = Array.from(objDict.values());

  // TODO(@darzu): probably don't need this intermediate _constrainedVelocities
  _constrainedVelocities.clear();

  // check for collision constraints
  // TODO(@darzu): this is a velocity constraint and ideally should be nicely extracted
  for (let [abId, data] of lastContactData) {
    // TODO(@darzu): we're a bit free with vector creation here, are the memory implications bad?
    const bReboundDir = vec3.clone(data.bToANorm);
    const aReboundDir = vec3.negate(vec3.create(), bReboundDir);

    const a = objDict.get(data.aId);
    const b = objDict.get(data.bId);

    if (!!a && a.collider.solid) {
      const aConVel =
        _constrainedVelocities.get(data.aId) ??
        vec3.clone(objDict.get(data.aId)!.linearVelocity ?? vec3.create());
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

    if (!!b && b.collider.solid) {
      const bConVel =
        _constrainedVelocities.get(data.bId) ??
        vec3.clone(objDict.get(data.bId)!.linearVelocity ?? vec3.create());
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
  for (let o of objs) {
    const { id, linearVelocity } = o;
    if (_constrainedVelocities.has(id) && linearVelocity) {
      if (BulletDef.isOn(o))
        console.log(
          `bullet ${vec3Dbg(linearVelocity)} => ${vec3Dbg(
            _constrainedVelocities.get(id)!
          )}`
        );
      vec3.copy(linearVelocity, _constrainedVelocities.get(id)!);
    }
  }

  for (let o of objs) {
    const {
      id,
      position,
      linearVelocity,
      angularVelocity,
      rotation,
      _phys: { world },
    } = o;

    if (BulletDef.isOn(o)) {
      console.log(`bullet: ${linearVelocity ? vec3Dbg(linearVelocity) : null}`);
    }

    // clamp linear velocity based on size
    if (linearVelocity) {
      const vxMax = (world.max[0] - world.min[0]) / dt;
      const vyMax = (world.max[1] - world.min[1]) / dt;
      const vzMax = (world.max[2] - world.min[2]) / dt;
      linearVelocity[0] = clamp(linearVelocity[0], -vxMax, vxMax);
      linearVelocity[1] = clamp(linearVelocity[1], -vyMax, vyMax);
      linearVelocity[2] = clamp(linearVelocity[2], -vzMax, vzMax);

      if (BulletDef.isOn(o)) {
        console.log(
          `bullet (clamped): ${linearVelocity ? vec3Dbg(linearVelocity) : null}`
        );
      }
    }

    // change position according to linear velocity
    if (linearVelocity) {
      delta = vec3.scale(delta, linearVelocity, dt);
      vec3.add(position, position, delta);
    }

    // change rotation according to angular velocity
    if (angularVelocity && rotation) {
      normalizedVelocity = vec3.normalize(normalizedVelocity, angularVelocity);
      let angle = vec3.length(angularVelocity) * dt;
      deltaRotation = quat.setAxisAngle(
        deltaRotation,
        normalizedVelocity,
        angle
      );
      quat.normalize(deltaRotation, deltaRotation);
      // note--quat multiplication is not commutative, need to multiply on the left
      quat.multiply(rotation, deltaRotation, rotation);
    }
  }
}
