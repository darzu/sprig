import { EM } from "../entity-manager.js";
import { vec3 } from "../gl-matrix.js";
export const LinearVelocityDef = EM.defineComponent("linearVelocity", (v) => v || vec3.fromValues(0, 0, 0));
EM.registerSerializerPair(LinearVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
export const AngularVelocityDef = EM.defineComponent("angularVelocity", (v) => v || vec3.fromValues(0, 0, 0));
EM.registerSerializerPair(AngularVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
//# sourceMappingURL=motion.js.map