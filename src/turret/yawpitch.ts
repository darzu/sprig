import { defineSerializableComponent } from "../ecs/em-helpers.js";
import { EM, Component } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const YawPitchDef = defineSerializableComponent(
  "yawpitch",
  (yaw?: number, pitch?: number) => {
    return {
      yaw: yaw ?? 0,
      pitch: pitch ?? 0,
    };
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

export function yawpitchToQuat(
  out: quat,
  yp: { yaw: number; pitch: number }
): quat {
  quat.copy(out, quat.IDENTITY);
  quat.rotateY(out, yp.yaw, out);
  quat.rotateX(out, yp.pitch, out);
  return out;
}
