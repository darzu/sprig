import { EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
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
      const t = tempVec3();
      for (let b of objs) {
        vec3.scale(t, b.gravity, 0.00001 * res.time.dt);
        vec3.add(b.linearVelocity, b.linearVelocity, t);
      }
    },
    "applyGravity"
  );
});
