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

/*
What's my data?
  a bunch of widgets on screen,
  some linkage between widgets and a mesh
  UX elements for manipulating widgets:
    selection, cursor, drag,
  what's truth, mesh vert pos or widget pos?
    widgets become truth while alive
*/

interface WidgetLayer {
  // widgets: EntityW<[typeof WidgetDef]>[]; // this comes from query instead?
  selected: Set<number>;
  hover: Set<number>;
  cursor?: number;
  // moved: Set<number>; ??
}

// NOTE: tag is set and owned by the adornment creator/user
export const WidgetDef = EM.defineComponent("widget", (tag: number) => {
  return {
    // TODO(@darzu): widgets: positioning, kind, visual, back pointer
    tag,
  };
});

// WidgetInteract
//    singleton cursor, drag box,
//    tracks selections, dragging states etc
//    configurable with rules for what modes are allowed etc
interface WidgetInteract {
  cursorWidget?: EntityW<[typeof WidgetDef]>;
  hoverWidgets: number[];
  selectedWidgets: number[];
}

export const WidgetInteractDef = EM.defineComponent("widgetInter", () => {
  // TODO(@darzu): take in a 2D plane as a parameter?
  const res: WidgetInteract = {
    // TODO(@darzu): has a cursor and drag box, as well as modes, rules
    cursorWidget: undefined,
    // TODO(@darzu): what's the right way to capture this state
    hoverWidgets: [],
    selectedWidgets: [],
  };
  return res;
});

async function initWidgetInteract() {
  // TODO(@darzu): maybe this is UI interact system for e.g. buttons
  // TODO(@darzu): create drag box, create cursor

  const { assets } = await EM.whenResources(AssetsDef);

  // create drag box
  // TODO(@darzu): dragbox should be part of some 2d gui abstraction thing
  const dragBox = EM.newEntity();
  EM.ensureComponentOn(dragBox, AlphaDef, 0.2);
  EM.ensureComponentOn(dragBox, RenderableConstructDef, assets.unitCube.proto);
  EM.ensureComponentOn(dragBox, PositionDef, [0, 0.2, 0]);
  EM.ensureComponentOn(dragBox, ScaleDef, [1, 1, 1]);
  EM.ensureComponentOn(dragBox, ColorDef, [0.0, 120 / 255, 209 / 255]);
  EM.ensureComponentOn(dragBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: assets.unitCube.aabb,
  });

  // create WidgetInteract resource
  EM.addSingletonComponent(WidgetInteractDef);

  // update WidgetInteract
  EM.registerSystem(
    [WidgetAdornDef],
    [WidgetInteractDef, PhysicsResultsDef, MouseDragDef, CameraViewDef],
    (adorns, { widgetInter, physicsResults, mousedrag, cameraView }) => {
      // update dragbox
      if (widgetInter.cursorWidget || mousedrag.isDragEnd) {
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

      // update glyph states
      if (mousedrag.isDragging) {
        // de-hover
        widgetInter.hoverWidgets.length = 0;

        if (widgetInter.cursorWidget) {
          // drag selected
          // TODO(@darzu): check that cursorGlyph is vert and selected
          // TODO(@darzu): IMPL hedges
          const isCursorSelected = widgetInter.selectedWidgets.some(
            (g) => g === widgetInter.cursorWidget
          );
          if (!isCursorSelected) {
            widgetInter.selectedWidgets.length = 0;
            widgetInter.selectedWidgets.push(e.cursorWidget);
          }
          for (let g of widgetInter.selectedWidgets) {
            if (g.hglyph.kind === "vert" && g.hglyph.hv) {
              // assert(g.hglyph.hv, `glyph missing vert ptr`);
              translateVert(g.hglyph.hv, worldDrag);
              let edg = g.hglyph.hv.edg;
              while (edg.orig === g.hglyph.hv) {
                hedgesToMove.add(edg.hi);
                hedgesToMove.add(edg.twin.hi);
                edg = edg.twin.next;
                if (edg === g.hglyph.hv.edg) break;
              }
              didUpdateMesh = true;
            }
          }
        } else {
          // deselect
          widgetInter.selectedWidgets.length = 0;

          // find hover
          const hits = physicsResults.collidesWith.get(dragBox.id) ?? [];
          for (let hid of hits) {
            const g = EM.findEntity(hid, [
              GlyphDef,
              PositionDef,
              RotationDef,
              ColorDef,
              RenderableDef,
              ButtonDef,
            ]);
            if (!g) continue;
            widgetInter.hoverWidgets.push(g);
          }
        }
      } else if (mousedrag.isDragEnd) {
        if (!e.cursorWidget) {
          // select box done
          widgetInter.selectedWidgets.length = 0;
          widgetInter.hoverWidgets.forEach((g) =>
            widgetInter.selectedWidgets.push(g)
          );
          widgetInter.hoverWidgets.length = 0;
        } else {
          // drag selected done
          // TODO(@darzu): IMPL
        }
      }

      // click to extrude
      // TODO(@darzu): move elsewhere?
      const clickedHi = buttonsState.clickByKey["glyph-hedge"];
      if (clickedHi !== undefined) {
        // console.log("hedge click!");
        const he = hedgeGlyphs.get(clickedHi);
        assert(
          he && he.hglyph.kind === "hedge" && he.hglyph.he,
          `invalid click data: ${clickedHi}`
        );
        // quad extrude
        extrudeHEdge(he.hglyph.he);
        didEnlargeMesh = true;
      }

      // non dragging
      if (!mousedrag.isDragging && !mousedrag.isDragEnd) {
        // unselect cursor glpyh
        e.cursorWidget = undefined;

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
            e.cursorWidget = g;
            break;
          }
        }
      }
    },
    "widgetInteract"
  );
  gameplaySystems.push("widgetInteract");
}

export const MeshEditorDef = EM.defineComponent("meshEditor", createMeshEditor);

interface MeshEditor {
  editMesh?: MeshHandle;
}

function createMeshEditor(): MeshEditor {
  return {
    editMesh: undefined,
  };
}

export async function initMeshEditor() {
  const { assets } = await EM.whenResources(AssetsDef);

  // reserve space for any mesh we might edit
  const reserve: MeshReserve = {
    maxVertNum: 100,
    maxTriNum: 100,
    maxLineNum: 0,
  };

  const hpEnt_ = EM.newEntity();
  EM.ensureComponentOn(
    hpEnt_,
    RenderableConstructDef,
    assets.cube.proto, // placeholder
    true,
    undefined,
    undefined,
    "std",
    false,
    reserve
  );

  EM.ensureComponentOn(hpEnt_, PositionDef, [0, 0.1, 0]);
  // TODO(@darzu): make scale configurable
  EM.ensureComponentOn(hpEnt_, ScaleDef, [5, 5, 5]);
  const hpEnt = await EM.whenEntityHas(hpEnt_, RenderableDef);

  EM.addSingletonComponent(MeshEditorDef);

  let currMesh: MeshHandle | undefined = undefined;

  EM.registerSystem(
    null,
    [MeshEditorDef, RendererDef],
    (_, { meshEditor, renderer }) => {
      // preconditions
      assert(
        !meshEditor.editMesh || meshEditor.editMesh.mesh,
        "can only edit mesh handles w/ mesh ptr"
      );

      // Reset editor
      if (currMesh && currMesh !== meshEditor.editMesh) {
        // HACK! reset colors
        currMesh.mesh!.colors.forEach((c) => vec3.zero(c));
        renderer.renderer.stdPool.updateMeshVertices(currMesh, currMesh.mesh!);

        // hide
        hpEnt.renderable.hidden = true;
      }

      // Set new mesh
      if (meshEditor.editMesh && meshEditor.editMesh !== currMesh) {
        currMesh = meshEditor.editMesh;
        const mesh = currMesh.mesh!;

        // HACK! set random colors
        mesh.colors.forEach((c) => randNormalPosVec3(c));
        renderer.renderer.stdPool.updateMeshVertices(currMesh, mesh);

        // set new mesh data on entity
        renderer.renderer.stdPool.updateMeshInstance(
          hpEnt.renderable.meshHandle,
          currMesh
        );
        hpEnt.renderable.hidden = false;

        // build half-edge poly
        const hp = meshToHalfEdgePoly(mesh);
      }
    },
    "meshEditor"
  );
  gameplaySystems.push("meshEditor");
}
