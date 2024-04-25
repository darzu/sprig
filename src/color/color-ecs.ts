import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const ColorDef = EM.defineComponent(
  "color",
  () => V(0, 0, 0),
  (p, c?: V3.InputT) => (c ? V3.copy(p, c) : p)
);
export type Color = Component<typeof ColorDef>;

EM.registerSerializerPair(
  ColorDef,
  (o, writer) => {
    writer.writeVec3(o);
  },
  (o, reader) => {
    reader.readVec3(o);
  }
);

export const TintsDef = EM.defineComponent(
  "tints",
  () => new Map() as Map<string, V3>
);

export type Tints = Component<typeof TintsDef>;

export function applyTints(tints: Tints, tint: V3) {
  tints.forEach((c) => V3.add(tint, c, tint));
}

export function setTint(tints: Tints, name: string, tint: V3) {
  let current = tints.get(name);
  if (!current) {
    current = V3.mk();
    tints.set(name, current);
  }
  V3.copy(current, tint);
}

export function clearTint(tints: Tints, name: string) {
  let current = tints.get(name);
  if (current) {
    V3.set(0, 0, 0, current);
  }
}

export const AlphaDef = EM.defineComponent(
  "alpha",
  () => 1.0,
  (p, c?: number) => c ?? p
);
export type Alpha = Component<typeof AlphaDef>;
