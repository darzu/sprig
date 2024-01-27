import { EM } from "../ecs/entity-manager.js";
import { vec2, V3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const PartyDef = EM.defineResource("party", () => ({
  pos: V3.mk(),
  dir: V3.mk(),
}));

EM.addLazyInit([], [PartyDef], () => {
  EM.addResource(PartyDef);
});
