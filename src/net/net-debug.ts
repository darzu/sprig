import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
import { InputsDef } from "../inputs.js";
import { RenderableDef } from "../render/renderer-ecs.js";
import { clearTint, setTint, TintsDef } from "../color-ecs.js";
import { AuthorityDef } from "./components.js";

const NetDebugStateDef = EM.defineComponent("netDebugState", () => ({
  dbgAuthority: false,
}));

const AUTHORITY_TINT_NAME = "authority";

const AUTHORITY_TINTS: Record<number, vec3> = {
  0: [0, 0, 0],
  1: [0.1, 0, 0],
  2: [0, 0.1, 0],
  3: [0, 0, 0.1],
};

export function registerNetDebugSystem(em: EntityManager) {
  em.registerSystem(
    [AuthorityDef, RenderableDef],
    [InputsDef],
    (objs, res) => {
      const netDebugState = em.ensureSingletonComponent(NetDebugStateDef);
      if (res.inputs.keyClicks["6"])
        netDebugState.dbgAuthority = !netDebugState.dbgAuthority;
      for (const o of objs) {
        em.ensureComponentOn(o, TintsDef);
        if (netDebugState.dbgAuthority) {
          setTint(
            o.tints,
            AUTHORITY_TINT_NAME,
            AUTHORITY_TINTS[o.authority.pid] || AUTHORITY_TINTS[0]
          );
        } else {
          clearTint(o.tints, AUTHORITY_TINT_NAME);
        }
      }
    },
    "netDebugSystem"
  );
}
