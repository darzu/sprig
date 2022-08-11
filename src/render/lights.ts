import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";

export const PointLightDef = EM.defineComponent("pointLight", () => {
  return {
    ambient: vec3.create(),
    diffuse: vec3.create(),
    specular: vec3.create(),
    constant: 1.0,
    linear: 0.0,
    quadratic: 0.0,
  };
});
