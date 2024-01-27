import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const PartyDef = EM.defineResource("party", () => ({
  pos: vec3.mk(),
  dir: vec3.mk(),
}));

EM.addLazyInit([], [PartyDef], () => {
  EM.addResource(PartyDef);
});
