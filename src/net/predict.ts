import { EntityManager } from "../entity-manager.js";
import { PredictDef } from "./components.js";
import { vec3, quat } from "../gl-matrix.js";
import { tempVec3, tempQuat } from "../temp-pool.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { AngularVelocityDef, LinearVelocityDef } from "../physics/motion.js";

export function registerPredictSystem(em: EntityManager) {
  em.registerSystem(
    [PredictDef, PositionDef, LinearVelocityDef],
    [],
    (entities) => {
      for (let entity of entities) {
        if (entity.predict.dt > 0) {
          // TODO: non-ballistic prediction?
          let deltaV = vec3.scale(
            tempVec3(),
            entity.linearVelocity,
            entity.predict.dt
          );
          vec3.add(entity.position, entity.position, deltaV);

          if (AngularVelocityDef.isOn(entity) && RotationDef.isOn(entity)) {
            let normalizedVelocity = vec3.normalize(
              tempVec3(),
              entity.angularVelocity
            );
            let angle = vec3.length(entity.angularVelocity) * entity.predict.dt;
            let deltaRotation = quat.setAxisAngle(
              tempQuat(),
              normalizedVelocity,
              angle
            );
            quat.normalize(deltaRotation, deltaRotation);
            // note--quat multiplication is not commutative, need to multiply on the left
            quat.multiply(entity.rotation, deltaRotation, entity.rotation);
          }
        }
        entity.predict.dt = 0;
      }
    },
    "predict"
  );
}
