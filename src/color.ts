import { Component, EM, EntityManager } from "./entity-manager.js";
import { vec3 } from "./gl-matrix.js";

export const ColorDef = EM.defineComponent(
  "color",
  (c?: vec3) => c ?? vec3.create()
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
  tints.forEach((c) => vec3.add(tint, tint, c));
}

export function setTint(tints: Tints, name: string, tint: vec3) {
  let current = tints.get(name);
  if (!current) {
    current = vec3.create();
    tints.set(name, current);
  }
  vec3.copy(current, tint);
}

export function clearTint(tints: Tints, name: string) {
  let current = tints.get(name);
  if (current) {
    vec3.set(current, 0, 0, 0);
  }
}
