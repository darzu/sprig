import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";

export const PartyDef = EM.defineComponent("party", () => ({
  pos: vec3.create(),
  dir: vec3.create(),
}));

onInit((em) => {
  em.addResource(PartyDef);
});
