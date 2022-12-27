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
import { GlyphDef } from "./mesh-editor.js";

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

type WidgetEnt = EntityW<
  [
    typeof GlyphDef,
    typeof ColorDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

export async function initWidgets(
  dragBox: EntityW<[typeof PositionDef]>,
  cursorId: number
) {
  EM.addSingletonComponent(WidgetLayerDef);

  // TODO(@darzu):
  // TODO(@darzu): refactor. Also have undo-stack
  EM.registerSystem(
    [GlyphDef, ColorDef, PositionDef, RotationDef, RenderableDef, ButtonDef],
    [
      WidgetLayerDef,
      PhysicsResultsDef,
      MouseDragDef,
      CameraViewDef,
      RendererDef,
      InputsDef,
      ButtonsStateDef,
    ],
    (
      es,
      {
        widgets,
        physicsResults,
        mousedrag,
        cameraView,
        renderer,
        inputs,
        buttonsState,
      }
    ) => {
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
