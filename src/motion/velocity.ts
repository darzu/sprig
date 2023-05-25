import { EM, Component, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { Phase } from "../ecs/sys_phase";

export const LinearVelocityDef = EM.defineComponent(
  "linearVelocity",
  (v?: vec3) => v || V(0, 0, 0)
);
export type LinearVelocity = Component<typeof LinearVelocityDef>;
EM.registerSerializerPair(
  LinearVelocityDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

export const AngularVelocityDef = EM.defineComponent(
  "angularVelocity",
  (v?: vec3) => v || V(0, 0, 0)
);
export type AngularVelocity = Component<typeof AngularVelocityDef>;
EM.registerSerializerPair(
  AngularVelocityDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

let _linVelDelta = vec3.create();
let _normalizedVelocity = vec3.create();
let _deltaRotation = quat.create();

export function registerPhysicsApplyLinearVelocity(em: EntityManager) {
  em.registerSystem2(
    "registerPhysicsApplyLinearVelocity",
    Phase.PRE_PHYSICS,
    [LinearVelocityDef, PositionDef],
    [TimeDef],
    (objs, res) => {
      for (let o of objs) {
        // translate position and AABB according to linear velocity
        _linVelDelta = vec3.scale(o.linearVelocity, res.time.dt, _linVelDelta);
        vec3.add(o.position, _linVelDelta, o.position);
      }
    }
  );
}

export function registerPhysicsApplyAngularVelocity(em: EntityManager) {
  em.registerSystem2(
    "physicsApplyAngularVelocity",
    Phase.PRE_PHYSICS,
    [AngularVelocityDef, RotationDef],
    [TimeDef],
    (objs, res) => {
      for (let o of objs) {
        // change rotation according to angular velocity
        // change rotation according to angular velocity
        vec3.normalize(o.angularVelocity, _normalizedVelocity);
        let angle = vec3.length(o.angularVelocity) * res.time.dt;
        _deltaRotation = quat.setAxisAngle(
          _normalizedVelocity,
          angle,
          _deltaRotation
        );
        quat.normalize(_deltaRotation, _deltaRotation);
        // note--quat multiplication is not commutative, need to multiply on the left
        // note--quat multiplication is not commutative, need to multiply on the left
        quat.mul(_deltaRotation, o.rotation, o.rotation);
      }
    }
  );
}
