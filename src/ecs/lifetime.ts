import { DeadDef } from "./delete.js";
import { Component, EM, EntityManager } from "./entity-manager.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "./sys_phase.js";

export const LifetimeDef = EM.defineComponent(
  "lifetime",
  (ms: number = 1000) => {
    return { startMs: ms, ms: ms };
  }
);
export type Lifetime = Component<typeof LifetimeDef>;

export function registerUpdateLifetimes(em: EntityManager) {
  em.registerSystem(
    "updateLifetimes",
    Phase.PRE_GAME_WORLD,
    [LifetimeDef],
    [TimeDef, MeDef],
    (objs, res) => {
      for (let o of objs) {
        if (em.hasComponents(o, [AuthorityDef]))
          if (o.authority.pid !== res.me.pid) continue;
        o.lifetime.ms -= res.time.dt;
        if (o.lifetime.ms < 0) {
          // TODO(@darzu): dead or deleted?
          em.addComponent(o.id, DeadDef);
          // TODO(@darzu): note needed?
          // em.addComponent(o.id, DeletedDef);
        }
      }
    }
  );
}
