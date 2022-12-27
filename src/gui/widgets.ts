// adornments are: entities that are parented to an entity's mesh parts
//    [ ] track changes via version number on the mesh data

import { CameraViewDef } from "../camera.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { gameplaySystems } from "../game/game.js";
import { mat3, mat4, quat, vec3 } from "../gl-matrix.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { createIdxPool, createIdxRing } from "../idx-pool.js";
import { MouseDragDef, InputsDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { MeshHandle, MeshReserve } from "../render/mesh-pool.js";
import {
  cloneMesh,
  transformMesh,
  getAABBFromMesh,
  Mesh,
  RawMesh,
} from "../render/mesh.js";
import {
  RenderableConstructDef,
  RendererDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat3, tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { randNormalPosVec3, vec3Mid } from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import { ButtonsStateDef, ButtonDef } from "./button.js";

export interface HedgeGlyph {
  kind: "hedge";
  he: HEdge | undefined;
  // state: "none" | "hover" | "selected";
}
export interface VertGlyph {
  kind: "vert";
  hv: HVert | undefined;
  // state: "none" | "hover" | "selected";
}
// TODO(@darzu): "H" in HGlyph vs Glyph is confusing
type Glyph = HedgeGlyph | VertGlyph;
export const GlyphDef = EM.defineComponent("hglyph", (g: Glyph) => g);

export type GlyphEnt = EntityW<
  [
    typeof GlyphDef,
    typeof ColorDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

/*
What's my data?
  a bunch of widgets on screen,
  some linkage between widgets and a mesh
  UX elements for manipulating widgets:
    selection, cursor, drag,
  what's truth, mesh vert pos or widget pos?
    widgets become truth while alive
*/

export interface WidgetLayer {
  // widgets: EntityW<[typeof WidgetDef]>[]; // this comes from query instead?
  selected: Set<number>;
  hover: Set<number>;
  cursor?: number;
  moved: Set<number>;
}

export const WidgetLayerDef = EM.defineComponent("widgets", createWidgetLayer);

function createWidgetLayer(): WidgetLayer {
  return {
    selected: new Set(),
    hover: new Set(),
    cursor: undefined,
    moved: new Set(),
  };
}

// type WidgetEnt = EntityW<
//   [
//     typeof GlyphDef,
//     typeof ColorDef,
//     typeof PositionDef,
//     typeof RotationDef,
//     typeof RenderableDef,
//     typeof ButtonDef
//   ]
// >;

async function initDragBox(): Promise<EntityW<[typeof PositionDef]>> {
  const { assets } = await EM.whenResources(AssetsDef);

  // create dragbox
  // TODO(@darzu): dragbox should be part of some 2d gui abstraction thing
  const dragBox = EM.newEntity();
  const dragBoxMesh = cloneMesh(assets.cube.mesh);
  EM.ensureComponentOn(dragBox, AlphaDef, 0.2);
  // normalize this cube to have min at 0,0,0 and max at 1,1,1

  transformMesh(
    dragBoxMesh,
    mat4.fromRotationTranslationScaleOrigin(
      tempMat4(),
      quat.IDENTITY,
      vec3.negate(tempVec3(), assets.cube.aabb.min),
      vec3.set(
        tempVec3(),
        1 / (assets.cube.halfsize[0] * 2),
        1 / (assets.cube.halfsize[1] * 2),
        1 / (assets.cube.halfsize[2] * 2)
      ),
      assets.cube.aabb.min
    )
  );
  EM.ensureComponentOn(dragBox, RenderableConstructDef, dragBoxMesh);
  EM.ensureComponentOn(dragBox, PositionDef, [0, 0.2, 0]);
  EM.ensureComponentOn(dragBox, ScaleDef, [1, 1, 1]);
  EM.ensureComponentOn(dragBox, ColorDef, [0.0, 120 / 255, 209 / 255]);
  EM.ensureComponentOn(dragBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: getAABBFromMesh(dragBoxMesh),
  });

  EM.registerSystem(
    null,
    [MouseDragDef, CameraViewDef, WidgetLayerDef],
    (_, { mousedrag, cameraView, widgets }) => {
      // update dragbox
      if (widgets.cursor || mousedrag.isDragEnd) {
        // hide dragbox
        vec3.copy(dragBox.position, [0, -1, 0]);
        vec3.copy(dragBox.scale, [0, 0, 0]);
      } else if (mousedrag.isDragging) {
        // place dragbox
        const min = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragMin,
          cameraView
        );
        min[1] = 0;
        const max = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragMax,
          cameraView
        );
        max[1] = 1;

        const size = vec3.sub(tempVec3(), max, min);
        vec3.copy(dragBox.position, min);
        vec3.copy(dragBox.scale, size);
      }
    },
    "updateDragbox"
  );
  gameplaySystems.push("updateDragbox");

  // TODO(@darzu): store this on a resource?
  return dragBox;
}

export async function initWidgets(cursorId: number) {
  EM.addSingletonComponent(WidgetLayerDef);

  const dragBox = await initDragBox();

  // TODO(@darzu):
  // TODO(@darzu): refactor. Also have undo-stack
  EM.registerSystem(
    null,
    [WidgetLayerDef, PhysicsResultsDef, MouseDragDef, CameraViewDef],
    (_, { widgets, physicsResults, mousedrag, cameraView }) => {
      const { selected, hover, moved } = widgets;

      moved.clear();

      // update world drag
      let worldDrag = vec3.create();
      if (mousedrag.isDragging) {
        const start = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragLastEnd,
          cameraView
        );
        start[1] = 0;
        const end = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragEnd,
          cameraView
        );
        end[1] = 0;
        vec3.sub(worldDrag, end, start);
      }

      // update widget states
      if (mousedrag.isDragging) {
        // de-hover
        hover.clear();

        if (widgets.cursor) {
          // drag selected
          // TODO(@darzu): check that cursorGlyph is vert and selected
          // TODO(@darzu): IMPL hedges
          const isCursorSelected = selected.has(widgets.cursor);
          if (!isCursorSelected) {
            selected.clear();
            selected.add(widgets.cursor);
          }
          for (let wi of selected.values()) {
            const w = EM.findEntity(wi, [PositionDef]);
            assert(w);
            // TODO(@darzu): think about world positions and parenting..
            vec3.add(w.position, w.position, worldDrag);
            moved.add(wi);
          }
        } else {
          // deselect
          selected.clear();

          // find hover
          const hits = physicsResults.collidesWith.get(dragBox.id) ?? [];
          for (let hid of hits) {
            const w = EM.findEntity(hid, [
              GlyphDef,
              PositionDef,
              RotationDef,
              ColorDef,
              RenderableDef,
              ButtonDef,
            ]);
            if (!w) continue;
            hover.add(w.id);
          }
        }
      } else if (mousedrag.isDragEnd) {
        if (!widgets.cursor) {
          // select box done
          selected.clear();
          hover.forEach((wi) => selected.add(wi));
          hover.clear();
        } else {
          // drag selected done
          // TODO(@darzu): IMPL
        }
      }

      // non dragging
      if (!mousedrag.isDragging && !mousedrag.isDragEnd) {
        // unselect cursor glpyh
        widgets.cursor = undefined;

        // find under-cursor glyph
        const hits = physicsResults.collidesWith.get(cursorId) ?? [];
        // console.dir(hits);
        for (let hid of hits) {
          const g = EM.findEntity(hid, [
            GlyphDef,
            PositionDef,
            RotationDef,
            ColorDef,
            RenderableDef,
            ButtonDef,
          ]);
          if (g) {
            vec3.copy(g.color, ENDESGA16.red);
            widgets.cursor = g.id;
            break;
          }
        }
      }
    },
    "updateWidgets"
  );
  gameplaySystems.push("updateWidgets");
}
