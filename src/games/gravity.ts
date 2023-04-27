import { EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { tempVec3 } from "../temp-pool.js";
import { TimeDef } from "../time.js";

export const GravityDef = EM.defineComponent("gravity", (gravity?: vec3) => {
  return gravity ?? vec3.create();
});

onInit((em: EntityManager) => {
  em.registerSystem(
    [GravityDef, LinearVelocityDef],
    [TimeDef],
    (objs, res) => {
      const t = vec3.tmp();
      for (let b of objs) {
        vec3.scale(b.gravity, res.time.dt, t);
        vec3.add(b.linearVelocity, t, b.linearVelocity);
      }
    },
    "applyGravity"
  );
});
