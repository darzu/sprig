import { defineSerializableComponent } from "../ecs/em-helpers.js";
import { EM, Component } from "../ecs/entity-manager.js";
import { V2, V3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

// TODO(@darzu): do we really need this component? Ideally we'd just have helpers around
//    Rotation?

export const YawPitchDef = defineSerializableComponent(
  "yawpitch",
  () => {
    return {
      yaw: 0,
      pitch: 0,
    };
  },
  (p, yaw?: number, pitch?: number) => {
    if (yaw !== undefined) p.yaw = yaw;
    if (pitch !== undefined) p.pitch = pitch;
    return p;
  },
  (o, buf) => {
    buf.writeFloat32(o.yaw);
    buf.writeFloat32(o.pitch);
  },
  (o, buf) => {
    o.yaw = buf.readFloat32();
    o.pitch = buf.readFloat32();
  }
);
export type YawPitch = Component<typeof YawPitchDef>;

// TODO(@darzu): IMPL quat.toYawPitchRoll
