import { EM } from "../ecs/entity-manager.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "./velocity.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";

export const GravityDef = EM.defineComponent(
  "gravity",
  () => V3.mk(),
  (p, gravity?: V3.InputT) => (gravity ? V3.copy(p, gravity) : p)
);

EM.addSystem(
  "applyGravity",
  Phase.PHYSICS_MOTION,
  [GravityDef, LinearVelocityDef],
  [TimeDef],
  (objs, res) => {
    const t = V3.tmp();
    for (let b of objs) {
      V3.scale(b.gravity, res.time.dt, t);
      V3.add(b.linearVelocity, t, b.linearVelocity);
    }
  }
);
