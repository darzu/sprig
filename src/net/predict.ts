import { EntityManager } from "../entity-manager.js";
import { PredictDef } from "./components.js";
import { MotionDef } from "../phys_motion.js";
import { vec3, quat } from "../gl-matrix.js";
import { tempVec, tempQuat } from "../temp-pool.js";

export function registerPredictSystem(em: EntityManager) {
  em.registerSystem([PredictDef, MotionDef], [], (entities) => {
    for (let entity of entities) {
      if (entity.predict.dt > 0) {
        // TODO: non-ballistic prediction?
        let deltaV = vec3.scale(
          tempVec(),
          entity.motion.linearVelocity,
          entity.predict.dt
        );
        vec3.add(entity.motion.location, entity.motion.location, deltaV);

        let normalizedVelocity = vec3.normalize(
          tempVec(),
          entity.motion.angularVelocity
        );
        let angle =
          vec3.length(entity.motion.angularVelocity) * entity.predict.dt;
        let deltaRotation = quat.setAxisAngle(
          tempQuat(),
          normalizedVelocity,
          angle
        );
        quat.normalize(deltaRotation, deltaRotation);
        // note--quat multiplication is not commutative, need to multiply on the left
        quat.multiply(
          entity.motion.rotation,
          deltaRotation,
          entity.motion.rotation
        );
      }
      entity.predict.dt = 0;
    }
  });
}
