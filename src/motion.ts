import { EM, Component } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";

export const LinearVelocityDef = EM.defineComponent(
  "linearVelocity",
  (v?: vec3) => v || vec3.fromValues(0, 0, 0)
);
export type LinearVelocity = Component<typeof LinearVelocityDef>;
EM.registerSerializerPair(
  LinearVelocityDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);

export const AngularVelocityDef = EM.defineComponent(
  "angularVelocity",
  (v?: vec3) => v || vec3.fromValues(0, 0, 0)
);
export type AngularVelocity = Component<typeof AngularVelocityDef>;
EM.registerSerializerPair(
  AngularVelocityDef,
  (o, buf) => buf.writeVec3(o),
  (o, buf) => buf.readVec3(o)
);
