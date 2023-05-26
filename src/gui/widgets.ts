import { CameraComputedDef } from "../camera/camera.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Assets, AssetsDef } from "../meshes/assets.js";
import { gameplaySystems } from "../debug/ghost.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { MouseDragDef } from "../input/inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { cloneMesh } from "../meshes/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { tempVec3 } from "../matrix/temp-pool.js";
import { assert } from "../utils/util.js";
import { screenPosToWorldPos } from "../utils/utils-game.js";
import { UICursorDef } from "./game-font.js";
import { Phase } from "../ecs/sys-phase";

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

// TODO(@darzu): FOR INIT STUFF,
//    have a registration table where an init function can specify which resources and systems it provides
//    then other code can require a certain resource / system, then it calls the right init function

// TODO(@darzu): IMPL
EM.registerInit({
  requireRs: [AssetsDef],
  provideRs: [WidgetLayerDef],
  // provideLs: ["updateWidgets", "colorWidgets", "updateDragbox"],
  // name: "initWidgets",
  fn: initWidgets,
});
// EM.addConstraint([WidgetLayerDef, "requires", "updateWidgets"]);
// // TODO(@darzu): instead of having these explit dependencies, maybe we should use an
// //  existance dependency disjoint set w/ the assumption that all constraints create
// //  an existance dependency
// EM.addConstraint([WidgetLayerDef, "requires", "colorWidgets"]);
// EM.addConstraint([WidgetLayerDef, "requires", "updateDragbox"]);
// EM.addConstraint(["colorWidgets", "after", "updateWidgets"]);
// EM.addConstraint(["updateDragbox", "before", "updateWidgets"]);

async function initDragBox(): Promise<EntityW<[typeof PositionDef]>> {
  const { assets } = await EM.whenResources(AssetsDef);

  // create dragbox
  // TODO(@darzu): dragbox should be part of some 2d gui abstraction thing
  const dragBox = EM.new();
  const dragBoxMesh = cloneMesh(assets.unitCube.mesh);
  EM.ensureComponentOn(dragBox, AlphaDef, 0.2);
  EM.ensureComponentOn(dragBox, RenderableConstructDef, dragBoxMesh);
  EM.ensureComponentOn(dragBox, PositionDef, V(0, 0.2, 0));
  EM.ensureComponentOn(dragBox, ScaleDef, V(1, 1, 1));
  EM.ensureComponentOn(dragBox, ColorDef, V(0.0, 120 / 255, 209 / 255));
  EM.ensureComponentOn(dragBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: assets.unitCube.aabb,
  });

  EM.registerSystem(
    "updateDragbox",
    Phase.GAME_WORLD,
    null,
    [MouseDragDef, CameraComputedDef, WidgetLayerDef],
    (_, { mousedrag, cameraComputed, widgets }) => {
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
          cameraComputed
        );
        min[1] = 0;
        const max = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragMax,
          cameraComputed
        );
        max[1] = 1;

        const size = vec3.sub(max, min);
        vec3.copy(dragBox.position, min);
        vec3.copy(dragBox.scale, size);
      }
    }
  );
  // EM.addSystem("updateDragbox", Phase.GAME_WORLD);

  // TODO(@darzu): store this on a resource?
  return dragBox;
}

async function initWidgets({ assets }: EntityW<[typeof AssetsDef]>) {
  EM.addResource(WidgetLayerDef);

  // TODO(@darzu): move to resource?
  const dragBox = await initDragBox();

  // TODO(@darzu):
  // TODO(@darzu): refactor. Also have undo-stack
  EM.registerSystem(
    "updateWidgets",
    Phase.GAME_WORLD,
    null,
    [
      WidgetLayerDef,
      PhysicsResultsDef,
      MouseDragDef,
      CameraComputedDef,
      UICursorDef,
    ],
    (
      _,
      {
        widgets,
        physicsResults,
        mousedrag,
        cameraComputed,
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
          cameraComputed
        );
        start[1] = 0;
        const end = screenPosToWorldPos(
          tempVec3(),
          mousedrag.dragEnd,
          cameraComputed
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
    }
  );
  // EM.addSystem("updateWidgets", Phase.GAME_WORLD);

  EM.registerSystem(
    "colorWidgets",
    Phase.GAME_WORLD,
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
    }
  );
  // EM.addSystem("colorWidgets", Phase.GAME_WORLD);
}
