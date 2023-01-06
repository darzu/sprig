import { Component, EM, EntityManager } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { InputsDef } from "../inputs.js";
import { RenderableDef } from "../render/renderer-ecs.js";
import { clearTint, setTint, TintsDef } from "../color-ecs.js";
import { AuthorityDef } from "./components.js";

const NetDebugStateDef = EM.defineComponent("netDebugState", () => ({
  dbgAuthority: false,
}));

const AUTHORITY_TINT_NAME = "authority";

const AUTHORITY_TINTS: Record<number, vec3> = {
  0: V(0, 0, 0),
  1: V(0.1, 0, 0),
  2: V(0, 0.1, 0),
  3: V(0, 0, 0.1),
};

export function registerNetDebugSystem(em: EntityManager) {
  em.registerSystem(
    [AuthorityDef, RenderableDef],
    [InputsDef],
    (objs, res) => {
      const netDebugState = em.ensureResource(NetDebugStateDef);
      if (res.inputs.keyClicks["6"])
        netDebugState.dbgAuthority = !netDebugState.dbgAuthority;
      for (const o of objs) {
        if (netDebugState.dbgAuthority) {
          em.set(o, TintsDef);
          setTint(
            o.tints,
            AUTHORITY_TINT_NAME,
            AUTHORITY_TINTS[o.authority.pid] || AUTHORITY_TINTS[0]
          );
        } else {
          if (TintsDef.isOn(o)) clearTint(o.tints, AUTHORITY_TINT_NAME);
        }
      }
    },
    "netDebugSystem"
  );
}
