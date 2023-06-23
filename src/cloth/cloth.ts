import { ColliderDef } from "../physics/collider.js";
import { Component, EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { SyncDef, AuthorityDef, Me, MeDef } from "../net/components.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import { FinishedDef } from "../ecs/em-helpers.js";
import { AllMeshes, AllMeshesDef } from "../meshes/mesh-list.js";
import { SpringType, SpringGridDef, ForceDef } from "./spring.js";
import {
  Mesh,
  normalizeMesh,
  unshareProvokingVerticesWithMap,
} from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { ColorDef } from "../color/color-ecs.js";
import { Phase } from "../ecs/sys-phase.js";

export interface ClothConstruct {
  location: vec3;
  color: vec3;
  rows: number;
  columns: number;
  distance: number;
}
export const ClothConstructDef = EM.defineComponent(
  "clothConstruct",
  () => ({
    location: V(0, 0, 0),
    color: V(0, 0, 0),
    rows: 2,
    columns: 2,
    distance: 1,
  }),
  (p, c: Partial<ClothConstruct>) => {
    return Object.assign(p, c);
  }
);

export const ClothLocalDef = EM.defineNonupdatableComponent(
  "clothLocal",
  (posMap: Map<number, number>) => ({
    posMap: posMap,
  })
);

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

function clothMesh(cloth: ClothConstruct): {
  mesh: Mesh;
  posMap: Map<number, number>;
} {
  let x = 0;
  let y = 0;
  let i = 0;
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  const colors: vec3[] = [];
  const lines: vec2[] = [];
  const uvs: vec2[] = [];
  while (y < cloth.rows) {
    if (x == cloth.columns) {
      x = 0;
      y = y + 1;
      continue;
    }
    pos.push(V(x * cloth.distance, y * cloth.distance, 0));
    uvs.push(vec2.clone([x / (cloth.columns - 1), y / (cloth.rows - 1)]));
    // add triangles
    if (y > 0) {
      if (x > 0) {
        // front
        tri.push(V(i, i - 1, i - cloth.columns));
        colors.push(V(0, 0, 0));
        // back
        tri.push(V(i - cloth.columns, i - 1, i));
        colors.push(V(0, 0, 0));
      }
      if (x < cloth.columns - 1) {
        // front
        tri.push(V(i, i - cloth.columns, i - cloth.columns + 1));
        colors.push(V(0, 0, 0));
        // back
        tri.push(V(i - cloth.columns + 1, i - cloth.columns, i));
        colors.push(V(0, 0, 0));
      }
    }
    // add lines
    if (x > 0) {
      lines.push(vec2.clone([i - 1, i]));
    }
    if (y > 0) {
      lines.push(vec2.clone([i - cloth.columns, i]));
    }
    x = x + 1;
    i = i + 1;
  }
  const { mesh, posMap } = unshareProvokingVerticesWithMap({
    pos,
    tri,
    quad: [],
    colors,
    lines,
    uvs,
  });
  return { mesh: normalizeMesh(mesh), posMap };
}

EM.addEagerInit([ClothConstructDef], [], [], () => {
  EM.addSystem(
    "buildCloths",
    Phase.PRE_GAME_WORLD,
    [ClothConstructDef],
    [MeDef, AllMeshesDef],
    (cloths, res) => {
      for (let cloth of cloths) {
        if (FinishedDef.isOn(cloth)) continue;
        EM.ensureComponentOn(cloth, PositionDef, cloth.clothConstruct.location);
        EM.ensureComponentOn(cloth, ColorDef, cloth.clothConstruct.color);
        const { mesh, posMap } = clothMesh(cloth.clothConstruct);
        EM.ensureComponentOn(cloth, ClothLocalDef, posMap);
        EM.ensureComponentOn(cloth, RenderableConstructDef, mesh);
        EM.ensureComponentOn(
          cloth,
          SpringGridDef,
          SpringType.SimpleDistance,
          cloth.clothConstruct.rows,
          cloth.clothConstruct.columns,
          [
            0,
            cloth.clothConstruct.columns - 1,
            cloth.clothConstruct.rows * (cloth.clothConstruct.columns - 1),
            cloth.clothConstruct.rows * cloth.clothConstruct.columns - 1,
          ],
          cloth.clothConstruct.distance
        );
        EM.ensureComponentOn(cloth, ForceDef);
        EM.ensureComponentOn(cloth, AuthorityDef, res.me.pid);
        EM.ensureComponentOn(cloth, SyncDef);
        cloth.sync.dynamicComponents = [ClothConstructDef.id];
        cloth.sync.fullComponents = [PositionDef.id, ForceDef.id];
        EM.ensureComponentOn(cloth, FinishedDef);
      }
    }
  );

  EM.addSystem(
    "updateClothMesh",
    Phase.RENDER_PRE_DRAW,
    [ClothConstructDef, ClothLocalDef, SpringGridDef, RenderableDef],
    [RendererDef],
    (cloths, { renderer }) => {
      for (let cloth of cloths) {
        // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
        const m = cloth.renderable.meshHandle.mesh! as Mesh;
        m.pos.forEach((p, i) => {
          const originalIndex = cloth.clothLocal.posMap.get(i)!;
          return vec3.copy(p, cloth.springGrid.positions[originalIndex]);
        });
        renderer.renderer.stdPool.updateMeshVertices(
          cloth.renderable.meshHandle,
          m
        );
      }
    }
  );
});
