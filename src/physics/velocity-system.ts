import { Collider, ColliderDef } from "./collider.js";
import { EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { clamp } from "../utils/math.js";
import {
  AngularVelocityDef,
  LinearVelocity,
  LinearVelocityDef,
} from "./motion.js";
import { ContactData } from "./phys.js";
import {
  PhysicsBroadCollidersDef,
  PhysicsResultsDef,
  PhysicsState,
  PhysicsStateDef,
  WorldFrameDef,
} from "./nonintersection.js";
import { tempVec3 } from "../temp-pool.js";
import { TimeDef } from "../time/time.js";
import {
  Frame,
  PhysicsParent,
  PhysicsParentDef,
  Position,
  PositionDef,
  RotationDef,
  updateFrameFromPosRotScale,
} from "./transform.js";

let linVelDelta = vec3.create();
let normalizedVelocity = vec3.create();
let deltaRotation = quat.create();

// TODO(@darzu): implement checkAtRest (deleted in this commit)

export function registerPhysicsClampVelocityByContact(em: EntityManager) {
  em.registerSystem(
    null,
    [PhysicsResultsDef, PhysicsBroadCollidersDef],
    (objs, res) => {
      const lastContactData = res.physicsResults.contactData;

      // check for collision constraints
      // TODO(@darzu): this is a velocity constraint and ideally should be nicely extracted
      for (let [_, data] of lastContactData) {
        const ac = res._physBColliders.colliders[data.aCId];
        const bc = res._physBColliders.colliders[data.bCId];
        const a = em.findEntity(ac.oId, [ColliderDef]);
        const b = em.findEntity(bc.oId, [ColliderDef]);
        // both objects must still exist and have colliders
        if (!a || !b) continue;
        // both objects must be solid
        if (!a.collider.solid || !b.collider.solid) continue;

        const aParentId = PhysicsParentDef.isOn(a) ? a.physicsParent.id : 0;
        const bParentId = PhysicsParentDef.isOn(b) ? b.physicsParent.id : 0;

        // maybe clamp "b"
        if (LinearVelocityDef.isOn(b) && bParentId === data.parentOId) {
          let bToAInBParent = data.bToANorm;
          const bInDirOfA = vec3.dot(b.linearVelocity, bToAInBParent);
          if (bInDirOfA > 0) {
            vec3.sub(
              b.linearVelocity,
              vec3.scale(bToAInBParent, bInDirOfA),
              b.linearVelocity
            );
          }
        }

        // maybe clamp "a"
        if (LinearVelocityDef.isOn(a) && aParentId === data.parentOId) {
          let bToAInAParent = data.bToANorm;
          const aInDirOfB = -vec3.dot(a.linearVelocity, bToAInAParent);
          if (aInDirOfB > 0) {
            vec3.sub(
              a.linearVelocity,
              vec3.scale(bToAInAParent, -aInDirOfB),
              a.linearVelocity
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
    [TimeDef],
    (objs, res) => {
      for (let o of objs) {
        if (o.collider.shape === "AABB") {
          const aabb = o.collider.aabb;
          const vxMax = (aabb.max[0] - aabb.min[0]) / res.time.dt;
          const vyMax = (aabb.max[1] - aabb.min[1]) / res.time.dt;
          const vzMax = (aabb.max[2] - aabb.min[2]) / res.time.dt;
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
    [TimeDef],
    (objs, res) => {
      for (let o of objs) {
        // translate position and AABB according to linear velocity
        linVelDelta = vec3.scale(o.linearVelocity, res.time.dt, linVelDelta);
        vec3.add(o.position, linVelDelta, o.position);
      }
    },
    "registerPhysicsApplyLinearVelocity"
  );
}

export function registerPhysicsApplyAngularVelocity(em: EntityManager) {
  em.registerSystem(
    [AngularVelocityDef, RotationDef],
    [TimeDef],
    (objs, res) => {
      for (let o of objs) {
        // change rotation according to angular velocity
        // change rotation according to angular velocity
        vec3.normalize(o.angularVelocity, normalizedVelocity);
        let angle = vec3.length(o.angularVelocity) * res.time.dt;
        deltaRotation = quat.setAxisAngle(
          normalizedVelocity,
          angle,
          deltaRotation
        );
        quat.normalize(deltaRotation, deltaRotation);
        // note--quat multiplication is not commutative, need to multiply on the left
        // note--quat multiplication is not commutative, need to multiply on the left
        quat.mul(deltaRotation, o.rotation, o.rotation);
      }
    },
    "physicsApplyAngularVelocity"
  );
}
