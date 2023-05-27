import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const PartyDef = EM.defineComponent("party", () => ({
  pos: vec3.create(),
  dir: vec3.create(),
}));

EM.registerInit({
  provideRs: [PartyDef],
  requireRs: [],
  fn: async () => {
    EM.addResource(PartyDef);
  },
});
