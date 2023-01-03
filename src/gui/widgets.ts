import { CameraViewDef } from "../camera.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { gameplaySystems } from "../game/game.js";
import { vec2, vec3, vec4, quat, mat4 } from "../sprig-matrix.js";
import { MouseDragDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { cloneMesh } from "../render/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { screenPosToWorldPos } from "../utils-game.js";
import { UICursorDef } from "../game/game-font.js";

// adornments are: entities that are parented to an entity's mesh parts
//    [ ] track changes via version number on the mesh data

export const WidgetDef = EM.defineComponent("widget", () => true);

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

async function initDragBox(): Promise<EntityW<[typeof PositionDef]>> {
  const { assets } = await EM.whenResources(AssetsDef);

  // create dragbox
  // TODO(@darzu): dragbox should be part of some 2d gui abstraction thing
  const dragBox = EM.newEntity();
  const dragBoxMesh = cloneMesh(assets.unitCube.mesh);
  EM.ensureComponentOn(dragBox, AlphaDef, 0.2);
  EM.ensureComponentOn(dragBox, RenderableConstructDef, dragBoxMesh);
  EM.ensureComponentOn(dragBox, PositionDef, vec3.clone([0, 0.2, 0]));
  EM.ensureComponentOn(dragBox, ScaleDef, vec3.clone([1, 1, 1]));
  EM.ensureComponentOn(
    dragBox,
    ColorDef,
    vec3.clone([0.0, 120 / 255, 209 / 255])
  );
  EM.ensureComponentOn(dragBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: assets.unitCube.aabb,
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

        const size = vec3.sub(max, min);
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

// TODO(@darzu): FOR INIT STUFF,
//    have a registration table where an init function can specify which resources and systems it provides
//    then other code can require a certain resource / system, then it calls the right init function

// TODO(@darzu): IMPL
EM.registerInit({
  requireRs: [AssetsDef],
  provideRs: [WidgetLayerDef],
  provideLs: ["updateWidgets", "colorWidgets"],
  fn: async function (rs) {
    throw new Error("Function not implemented.");
  },
  name: "",
});

export async function initWidgets() {
  EM.addSingletonComponent(WidgetLayerDef);

  const dragBox = await initDragBox();

  // TODO(@darzu):
  // TODO(@darzu): refactor. Also have undo-stack
  EM.registerSystem(
    null,
    [
      WidgetLayerDef,
      PhysicsResultsDef,
      MouseDragDef,
      CameraViewDef,
      UICursorDef,
    ],
    (
      _,
      {
        widgets,
        physicsResults,
        mousedrag,
        cameraView,
        uiCursor: {
          cursor: { id: cursorId },
        },
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
        vec3.sub(end, start, worldDrag);
      }

      // update widget states
      if (mousedrag.isDragging) {
        // de-hover
        hover.clear();

        if (widgets.cursor) {
          // drag selected
          // TODO(@darzu): check that cursorGlyph is vert and selected
          const isCursorSelected = selected.has(widgets.cursor);
          if (!isCursorSelected) {
            selected.clear();
            selected.add(widgets.cursor);
          }
          for (let wi of selected.values()) {
            const w = EM.findEntity(wi, [PositionDef]);
            assert(w);
            // TODO(@darzu): think about world positions and parenting..
            // TODO(@darzu): think about world positions and parenting..
            vec3.add(w.position, worldDrag, w.position);
            moved.add(wi);
          }
        } else {
          // deselect
          selected.clear();

          // find hover
          const hits = physicsResults.collidesWith.get(dragBox.id) ?? [];
          for (let hid of hits) {
            const w = EM.findEntity(hid, [WidgetDef]);
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
          const g = EM.findEntity(hid, [WidgetDef, ColorDef]);
          if (g) {
            // TODO(@darzu): better glyph color handling
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

  EM.registerSystem(
    [WidgetDef, ColorDef],
    [WidgetLayerDef],
    (ws, { widgets }) => {
      // update glyph colors based on state
      // TODO(@darzu): move to widgets.ts
      for (let g of ws) {
        vec3.copy(g.color, ENDESGA16.lightBlue);
      }
      for (let wi of widgets.hover) {
        const g = EM.findEntity(wi, [ColorDef])!;
        vec3.copy(g.color, ENDESGA16.yellow);
      }
      for (let wi of widgets.selected) {
        const g = EM.findEntity(wi, [ColorDef])!;
        vec3.copy(g.color, ENDESGA16.lightGreen);
      }
      if (widgets.cursor) {
        const g = EM.findEntity(widgets.cursor, [ColorDef])!;
        vec3.copy(g.color, ENDESGA16.red);
      }
    },
    "colorWidgets"
  );
  gameplaySystems.push("colorWidgets");
}
