import { EM } from "../ecs/entity-manager.js";
import { vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "./velocity.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";

export const GravityDef = EM.defineComponent(
  "gravity",
  () => vec3.create(),
  (p, gravity?: vec3.InputT) => (gravity ? vec3.copy(p, gravity) : p)
);

EM.addSystem(
  "applyGravity",
  Phase.PHYSICS_MOTION,
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
