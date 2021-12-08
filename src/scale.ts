import { Component, EM, EntityManager } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";

export const ScaleDef = EM.defineComponent("scale", (by?: vec3) => ({
  by: by || vec3.fromValues(1, 1, 1),
}));

export type Scale = Component<typeof ScaleDef>;
