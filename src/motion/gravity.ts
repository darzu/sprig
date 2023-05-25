import { EM, EntityManager } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { LinearVelocityDef } from "./velocity.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys_phase";

export const GravityDef = EM.defineComponent("gravity", (gravity?: vec3) => {
  return gravity ?? vec3.create();
});

onInit((em: EntityManager) => {
  em.registerSystem(
    "applyGravity",
    Phase.PRE_PHYSICS,
    [GravityDef, LinearVelocityDef],
    [TimeDef],
    (objs, res) => {
      const t = vec3.tmp();
      for (let b of objs) {
        vec3.scale(b.gravity, res.time.dt, t);
        vec3.add(b.linearVelocity, t, b.linearVelocity);
      }
    }
  );
});
