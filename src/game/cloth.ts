import { ColliderDef } from "../physics/collider.js";
import { Component, EM, EntityManager } from "../entity-manager.js";
import { quat, vec2, vec3 } from "../gl-matrix.js";
import { RenderableDef } from "../renderer.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ColorDef } from "./game.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { Serializer, Deserializer } from "../serialize.js";
import { FinishedDef } from "../build.js";
import { Assets, AssetsDef } from "./assets.js";
import { Mesh, unshareProvokingVertices } from "../mesh-pool.js";
import { SpringGridDef } from "./spring.js";

export const ClothConstructDef = EM.defineComponent(
  "clothConstruct",
  (
    location?: vec3,
    color?: vec3,
    rows?: number,
    columns?: number,
    distance?: number
  ) => ({
    location: location ?? vec3.fromValues(0, 0, 0),
    color: color ?? vec3.fromValues(0, 0, 0),
    rows: rows ?? 2,
    columns: columns ?? 2,
    distance: distance ?? 1,
  })
);

export type ClothConstruct = Component<typeof ClothConstructDef>;

EM.registerSerializerPair(
  ClothConstructDef,
  (clothConstruct, buf) => {
    buf.writeVec3(clothConstruct.location);
    buf.writeVec3(clothConstruct.color);
    buf.writeUint16(clothConstruct.rows);
    buf.writeUint16(clothConstruct.columns);
    buf.writeFloat32(clothConstruct.distance);
  },
  (clothConstruct, buf) => {
    buf.readVec3(clothConstruct.location);
    buf.readVec3(clothConstruct.color);
    clothConstruct.rows = buf.readUint16();
    clothConstruct.columns = buf.readUint16();
    clothConstruct.distance = buf.readFloat32();
  }
);

function clothMesh(cloth: ClothConstruct): Mesh {
  let x = 0;
  let y = 0;
  let i = 0;
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  const colors: vec3[] = [];
  const lines: vec2[] = [];
  while (y < cloth.rows) {
    if (x == cloth.columns) {
      x = 0;
      y = y + 1;
      continue;
    }
    pos.push(vec3.fromValues(x * cloth.distance, y * cloth.distance, 0));
    // add triangles
    if (y > 0) {
      if (x > 0) {
        // front
        tri.push(vec3.fromValues(i, i - 1, i - cloth.columns));
        colors.push(vec3.fromValues(0, 0, 0));
        // back
        tri.push(vec3.fromValues(i - cloth.columns, i - 1, i));
        colors.push(vec3.fromValues(0, 0, 0));
      }
      if (x < cloth.columns - 1) {
        // front
        tri.push(vec3.fromValues(i, i - cloth.columns, i - cloth.columns + 1));
        colors.push(vec3.fromValues(0, 0, 0));
        // back
        tri.push(vec3.fromValues(i - cloth.columns + 1, i - cloth.columns, i));
        colors.push(vec3.fromValues(0, 0, 0));
      }
    }
    // add lines
    if (x > 0) {
      lines.push([i - 1, i]);
    }
    if (y > 0) {
      lines.push([i - cloth.columns, i]);
    }
    x = x + 1;
    i = i + 1;
  }
  return unshareProvokingVertices({ pos, tri, colors, lines });
}

export function registerBuildClothsSystem(em: EntityManager) {
  function buildCloths(
    cloths: { id: number; clothConstruct: ClothConstruct }[],
    { me: { pid }, assets }: { me: Me; assets: Assets }
  ) {
    for (let cloth of cloths) {
      if (FinishedDef.isOn(cloth)) continue;
      em.ensureComponent(cloth.id, PositionDef, cloth.clothConstruct.location);
      em.ensureComponent(cloth.id, ColorDef, cloth.clothConstruct.color);
      em.ensureComponent(
        cloth.id,
        RenderableDef,
        clothMesh(cloth.clothConstruct)
      );
      em.ensureComponent(
        cloth.id,
        SpringGridDef,
        cloth.clothConstruct.rows,
        cloth.clothConstruct.columns,
        [0, cloth.clothConstruct.columns - 1],
        cloth.clothConstruct.distance
      );
      em.ensureComponent(cloth.id, AuthorityDef, pid);
      em.ensureComponent(
        cloth.id,
        SyncDef,
        [ClothConstructDef.id],
        [PositionDef.id]
      );
      em.ensureComponent(cloth.id, FinishedDef);
    }
  }

  em.registerSystem([ClothConstructDef], [MeDef, AssetsDef], buildCloths);
}
