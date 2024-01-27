import { Component, EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const ColorDef = EM.defineComponent(
  "color",
  () => V(0, 0, 0),
  (p, c?: vec3.InputT) => (c ? vec3.copy(p, c) : p)
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
  () => new Map() as Map<string, vec3>
);

export type Tints = Component<typeof TintsDef>;

export function applyTints(tints: Tints, tint: vec3) {
  tints.forEach((c) => vec3.add(tint, c, tint));
}

export function setTint(tints: Tints, name: string, tint: vec3) {
  let current = tints.get(name);
  if (!current) {
    current = vec3.mk();
    tints.set(name, current);
  }
  vec3.copy(current, tint);
}

export function clearTint(tints: Tints, name: string) {
  let current = tints.get(name);
  if (current) {
    vec3.set(0, 0, 0, current);
  }
}

export const AlphaDef = EM.defineComponent(
  "alpha",
  () => 1.0,
  (p, c?: number) => c ?? p
);
export type Alpha = Component<typeof AlphaDef>;
