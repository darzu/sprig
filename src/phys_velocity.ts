import { Collider, ColliderDef } from "./collider.js";
import { EntityManager } from "./entity-manager.js";
import { __lastPlayerId } from "./game/player.js";
import { mat3, mat4, quat, vec3 } from "./gl-matrix.js";
import { clamp } from "./math.js";
import { LinearVelocity, LinearVelocityDef } from "./motion.js";
import { IdPair, ContactData } from "./phys.js";
import {
  PhysicsResultsDef,
  PhysicsState,
  PhysicsStateDef,
  WorldFrameDef,
} from "./phys_esc.js";
import { tempVec } from "./temp-pool.js";
import { PhysicsTimerDef } from "./time.js";
import {
  Frame,
  PhysicsParent,
  PhysicsParentDef,
  Position,
  PositionDef,
  updateFrameFromPosRotScale,
} from "./transform.js";

let linVelDelta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): implement checkAtRest (deleted in this commit)

const _constrainedVelocities = new Map<number, vec3>();

export interface MotionObj {
  id: number;
  collider: Collider;
  _phys: PhysicsState;
  linearVelocity?: LinearVelocity;
  position?: Position;
  world: Frame;
}

const _objDict: Map<number, MotionObj> = new Map();

export function registerPhysicsMoveObjects(em: EntityManager) {
  em.registerSystem(
    [ColliderDef, PhysicsStateDef, WorldFrameDef],
    [PhysicsTimerDef, PhysicsResultsDef],
    (objs, res) => {
      _objDict.clear();
      for (let o of objs) _objDict.set(o.id, o);

      const dt = res.physicsTimer.period;
      const lastContactData = res.physicsResults.contactData;

      for (let si = 0; si < res.physicsTimer.steps; si++) {
        // build a dict
        // TODO(@darzu): would be great of EntityManager handled this

        // TODO(@darzu): probably don't need this intermediate _constrainedVelocities
        _constrainedVelocities.clear();

        // check for collision constraints
        // TODO(@darzu): this is a velocity constraint and ideally should be nicely extracted
        for (let [abId, data] of lastContactData) {
          const a = _objDict.get(data.aId);
          const b = _objDict.get(data.bId);
          // both objects must still exist
          if (!a || !b) continue;
          // both objects must be solid
          if (!a.collider.solid || !b.collider.solid) continue;

          if (b.linearVelocity) {
            let bToAInBParent = data.bToANorm;
            if (PhysicsParentDef.isOn(b) && b.physicsParent.id) {
              // TODO(@darzu): this is inefficient, cache the inverse
              const bp = em.findEntity(b.physicsParent.id, [WorldFrameDef]);
              if (!bp)
                throw `Parent ${b.physicsParent.id} doesnt have WorldFrame`;
              const p3 = mat3.fromMat4(mat3.create(), bp.world.transform);
              const worldToParent3 = mat3.invert(mat3.create(), p3);
              bToAInBParent = vec3.transformMat3(
                tempVec(),
                data.bToANorm,
                worldToParent3
              );
              vec3.normalize(bToAInBParent, bToAInBParent);
            }

            const bInDirOfA = vec3.dot(b.linearVelocity, bToAInBParent);
            if (bInDirOfA > 0) {
              vec3.sub(
                b.linearVelocity,
                b.linearVelocity,
                vec3.scale(tempVec(), bToAInBParent, bInDirOfA)
              );
            }
          }

          if (a.linearVelocity) {
            let bToAInAParent = data.bToANorm;
            if (PhysicsParentDef.isOn(a) && a.physicsParent.id) {
              // TODO(@darzu): this is inefficient, cache the inverse
              const ap = em.findEntity(a.physicsParent.id, [WorldFrameDef]);
              if (!ap)
                throw `Parent ${a.physicsParent.id} doesnt have WorldFrame`;
              const p3 = mat3.fromMat4(mat3.create(), ap.world.transform);
              const worldToParent3 = mat3.invert(mat3.create(), p3);
              bToAInAParent = vec3.transformMat3(
                tempVec(),
                data.bToANorm,
                worldToParent3
              );
              vec3.normalize(bToAInAParent, bToAInAParent);
            }

            const aInDirOfB = -vec3.dot(a.linearVelocity, bToAInAParent);
            if (aInDirOfB > 0) {
              vec3.sub(
                a.linearVelocity,
                a.linearVelocity,
                vec3.scale(tempVec(), bToAInAParent, -aInDirOfB)
              );
            }
          }
        }

        for (let o of objs) {
          const { id, _phys, linearVelocity, position, world } = o as MotionObj;
          // clamp linear velocity based on size
          if (linearVelocity) {
            const vxMax =
              (_phys.localAABB.max[0] - _phys.localAABB.min[0]) / dt;
            const vyMax =
              (_phys.localAABB.max[1] - _phys.localAABB.min[1]) / dt;
            const vzMax =
              (_phys.localAABB.max[2] - _phys.localAABB.min[2]) / dt;
            linearVelocity[0] = clamp(linearVelocity[0], -vxMax, vxMax);
            linearVelocity[1] = clamp(linearVelocity[1], -vyMax, vyMax);
            linearVelocity[2] = clamp(linearVelocity[2], -vzMax, vzMax);
          }

          // translate position and AABB according to linear velocity
          if (linearVelocity && position) {
            linVelDelta = vec3.scale(linVelDelta, linearVelocity, dt);
            vec3.add(position, position, linVelDelta);
            // TODO(@darzu): must translate worldAABB
            // TODO(@darzu): this is inefficient esp with the matrix inversion
            let wLinVelDelta = tempVec();
            vec3.copy(wLinVelDelta, linVelDelta);
            // TODO(@darzu): this parent finding is inefficient and repeated
            if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
              const p = em.findEntity(o.physicsParent.id, [WorldFrameDef]);
              if (!p)
                throw `Parent ${o.physicsParent.id} doesnt have WorldFrame`;
              const p3 = mat3.fromMat4(mat3.create(), p.world.transform);
              const worldToParent3 = mat3.invert(mat3.create(), p3);
              vec3.transformMat3(wLinVelDelta, linVelDelta, worldToParent3);
            }
            vec3.add(_phys.worldAABB.min, _phys.worldAABB.min, wLinVelDelta);
            vec3.add(_phys.worldAABB.max, _phys.worldAABB.max, wLinVelDelta);
          }

          // change rotation according to angular velocity
          // TODO(@darzu): rotation needs to be seperated out so we can do collision
          //   detection on rotation.
          // TODO(@darzu): update AABB based on rotation
          if (_phys.wAngVel && world.rotation) {
            normalizedVelocity = vec3.normalize(
              normalizedVelocity,
              _phys.wAngVel
            );
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
    },
    "physicsMove"
  );
}