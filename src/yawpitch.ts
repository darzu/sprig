import { defineSerializableComponent } from "./em_helpers.js";
import { EM, Component } from "./entity-manager.js";
import { quat } from "./gl-matrix.js";

export const YawPitchDef = defineSerializableComponent(
  EM,
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
  quat.rotateY(out, out, yp.yaw);
  quat.rotateZ(out, out, yp.pitch);
  return out;
}
