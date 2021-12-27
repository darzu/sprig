import { Collider, ColliderDef } from "./collider.js";
import { EntityManager } from "./entity-manager.js";
import { quat, vec3 } from "./gl-matrix.js";
import { clamp } from "./math.js";
import { IdPair, ContactData } from "./phys.js";
import {
  PhysicsResultsDef,
  PhysicsState,
  PhysicsStateDef,
  WorldFrameDef,
} from "./phys_esc.js";
import { PhysicsTimerDef } from "./time.js";
import { Frame, updateFrameFromPosRotScale } from "./transform.js";

let delta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): implement checkAtRest (deleted in this commit)

const _constrainedVelocities = new Map<number, vec3>();

export interface MotionObj {
  id: number;
  collider: Collider;
  _phys: PhysicsState;
  world: Frame;
}

const _objDict: Map<number, MotionObj> = new Map();

export function registerPhysicsMoveObjects(em: EntityManager) {
  em.registerSystem(
    [ColliderDef, PhysicsStateDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsResultsDef],
    (objs, res) => {
      for (let si = 0; si < res.physicsTimer.steps; si++) {
        // build a dict
        // TODO(@darzu): would be great of EntityManager handled this
        _objDict.clear();
        for (let o of objs) _objDict.set(o.id, o);

        // TODO(@darzu): moveObjects needs to be moved out so that we can update the
        //    world transform afterward
        // move objects
        moveObjects(
          _objDict,
          res.physicsTimer.period,
          res.physicsResults.contactData
        );
      }
    },
    "physicsMove"
  );
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
        vec3.clone(objDict.get(data.aId)!._phys.wLinVel ?? vec3.create());
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
        vec3.clone(objDict.get(data.bId)!._phys.wLinVel ?? vec3.create());
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
  for (let { id, _phys } of objs) {
    if (_constrainedVelocities.has(id) && _phys.wLinVel) {
      vec3.copy(_phys.wLinVel, _constrainedVelocities.get(id)!);
    }
  }

  for (let { id, _phys, world } of objs) {
    // clamp linear velocity based on size
    if (_phys.wLinVel) {
      const vxMax = (_phys.worldAABB.max[0] - _phys.worldAABB.min[0]) / dt;
      const vyMax = (_phys.worldAABB.max[1] - _phys.worldAABB.min[1]) / dt;
      const vzMax = (_phys.worldAABB.max[2] - _phys.worldAABB.min[2]) / dt;
      _phys.wLinVel[0] = clamp(_phys.wLinVel[0], -vxMax, vxMax);
      _phys.wLinVel[1] = clamp(_phys.wLinVel[1], -vyMax, vyMax);
      _phys.wLinVel[2] = clamp(_phys.wLinVel[2], -vzMax, vzMax);
    }

    // translate position and AABB according to linear velocity
    if (_phys.wLinVel) {
      delta = vec3.scale(delta, _phys.wLinVel, dt);
      vec3.add(world.position, world.position, delta);
      vec3.add(_phys.worldAABB.min, _phys.worldAABB.min, delta);
      vec3.add(_phys.worldAABB.max, _phys.worldAABB.max, delta);
    }

    // change rotation according to angular velocity
    // TODO(@darzu): rotation needs to be seperated out so we can do collision
    //   detection on rotation.
    // TODO(@darzu): update AABB based on rotation
    if (_phys.wAngVel && world.rotation) {
      normalizedVelocity = vec3.normalize(normalizedVelocity, _phys.wAngVel);
      let angle = vec3.length(_phys.wAngVel) * dt;
      deltaRotation = quat.setAxisAngle(
        deltaRotation,
        normalizedVelocity,
        angle
      );
      quat.normalize(deltaRotation, deltaRotation);
      // note--quat multiplication is not commutative, need to multiply on the left
      quat.multiply(world.rotation, deltaRotation, world.rotation);
    }
  }
}
