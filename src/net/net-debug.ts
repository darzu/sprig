import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { RenderableDef } from "../render/renderer-ecs.js";
import { clearTint, setTint, TintsDef } from "../color/color-ecs.js";
import { AuthorityDef } from "./components.js";
import { Phase } from "../ecs/sys-phase.js";

const NetDebugStateDef = EM.defineResource("netDebugState", () => ({
  dbgAuthority: false,
}));

const AUTHORITY_TINT_NAME = "authority";

const AUTHORITY_TINTS: Record<number, V3> = {
  0: V(0, 0, 0),
  1: V(0.1, 0, 0),
  2: V(0, 0.1, 0),
  3: V(0, 0, 0.1),
};

export function initNetDebugSystem() {
  EM.ensureResource(NetDebugStateDef);
  EM.addSystem(
    "netDebugToggle",
    Phase.NETWORK,
    null,
    [InputsDef, NetDebugStateDef],
    (objs, res) => {
      if (res.inputs.keyClicks["6"])
        res.netDebugState.dbgAuthority = !res.netDebugState.dbgAuthority;
    }
  );
  EM.addSystem(
    "netDebugSystem",
    Phase.NETWORK,
    [AuthorityDef, RenderableDef],
    [InputsDef, NetDebugStateDef],
    (objs, res) => {
      for (const o of objs) {
        if (res.netDebugState.dbgAuthority) {
          EM.set(o, TintsDef);
          setTint(
            o.tints,
            AUTHORITY_TINT_NAME,
            AUTHORITY_TINTS[o.authority.pid] || AUTHORITY_TINTS[0]
          );
        } else {
          if (TintsDef.isOn(o)) clearTint(o.tints, AUTHORITY_TINT_NAME);
        }
      }
    }
  );
}
