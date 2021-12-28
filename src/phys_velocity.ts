import { Collider, ColliderDef } from "./collider.js";
import { EntityManager } from "./entity-manager.js";
import { __lastPlayerId } from "./game/player.js";
import { mat3, mat4, quat, vec3 } from "./gl-matrix.js";
import { clamp } from "./math.js";
import {
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "./motion.js";
import { IdPair, ContactData } from "./phys.js";
import {
  PhysicsResultsDef,
  PhysicsState,
  PhysicsStateDef,
  WorldFrameDef,
} from "./phys_nonintersection.js";
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

export function registerPhysicsClampVelocityByContact(em: EntityManager) {
  em.registerSystem(
    null,
    [PhysicsTimerDef, PhysicsResultsDef],
    (objs, res) => {
      if (!res.physicsTimer.steps) return;

      const lastContactData = res.physicsResults.contactData;

      // check for collision constraints
      // TODO(@darzu): this is a velocity constraint and ideally should be nicely extracted
      for (let [abId, data] of lastContactData) {
        const a = em.findEntity(data.aId, [ColliderDef]);
        const b = em.findEntity(data.bId, [ColliderDef]);
        // both objects must still exist and have colliders
        if (!a || !b) continue;
        // both objects must be solid
        if (!a.collider.solid || !b.collider.solid) continue;

        // maybe clamp "b"
        if (LinearVelocityDef.isOn(b)) {
          let bToAInBParent = data.bToANorm;
          // if we're parented, transform our normal of collision into our local frame
          // TODO(@darzu): this is inefficient, at least cache the inverse
          if (PhysicsParentDef.isOn(b) && b.physicsParent.id) {
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

        // maybe clamp "a"
        if (LinearVelocityDef.isOn(a)) {
          let bToAInAParent = data.bToANorm;
          if (PhysicsParentDef.isOn(a) && a.physicsParent.id) {
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
    },
    "clampVelocityByContact"
  );
}

export function registerPhysicsClampVelocityBySize(em: EntityManager) {
  em.registerSystem(
    [LinearVelocityDef, ColliderDef],
    [PhysicsTimerDef],
    (objs, res) => {
      // TODO(@darzu): we really need this physics timer loop to be moved out of individual systems
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.period;
      for (let o of objs) {
        if (o.collider.shape === "AABB") {
          const aabb = o.collider.aabb;
          const vxMax = (aabb.max[0] - aabb.min[0]) / dt;
          const vyMax = (aabb.max[1] - aabb.min[1]) / dt;
          const vzMax = (aabb.max[2] - aabb.min[2]) / dt;
          o.linearVelocity[0] = clamp(o.linearVelocity[0], -vxMax, vxMax);
          o.linearVelocity[1] = clamp(o.linearVelocity[1], -vyMax, vyMax);
          o.linearVelocity[2] = clamp(o.linearVelocity[2], -vzMax, vzMax);
        }
      }
    },
    "registerPhysicsClampVelocityBySize"
  );
}

export function registerPhysicsApplyLinearVelocity(em: EntityManager) {
  em.registerSystem(
    [LinearVelocityDef, PositionDef],
    [PhysicsTimerDef],
    (objs, res) => {
      // TODO(@darzu): we really need this physics timer loop to be moved out of individual systems
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.period * res.physicsTimer.steps;

      for (let o of objs) {
        // translate position and AABB according to linear velocity
        linVelDelta = vec3.scale(linVelDelta, o.linearVelocity, dt);
        vec3.add(o.position, o.position, linVelDelta);
      }
    },
    "registerPhysicsApplyLinearVelocity"
  );
}

export function registerPhysicsApplyAngularVelocity(em: EntityManager) {
  em.registerSystem(
    [AngularVelocityDef, WorldFrameDef, PhysicsStateDef],
    [PhysicsTimerDef],
    (objs, res) => {
      // TODO(@darzu): we really need this physics timer loop to be moved out of individual systems
      if (!res.physicsTimer.steps) return;
      const dt = res.physicsTimer.period * res.physicsTimer.steps;

      for (let si = 0; si < res.physicsTimer.steps; si++) {
        for (let o of objs) {
          const { _phys, world } = o;

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
    "physicsApplyAngularVelocity"
  );
}