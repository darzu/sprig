import { EM } from "../entity-manager.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { onInit } from "../init.js";

export const PartyDef = EM.defineComponent("party", () => ({
  pos: vec3.create(),
}));

onInit((em) => {
  em.addSingletonComponent(PartyDef);
});
