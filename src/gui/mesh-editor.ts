import { CameraViewDef } from "../camera.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityW } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { gameplaySystems } from "../game/game.js";
import { mat4, quat, vec3 } from "../gl-matrix.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { MouseDragDef, InputsDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import {
  cloneMesh,
  transformMesh,
  getAABBFromMesh,
  Mesh,
} from "../render/mesh.js";
import {
  RenderableConstructDef,
  RendererDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { vec3Mid } from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import { ButtonsStateDef, ButtonDef } from "./button.js";

interface HedgeGlyph {
  kind: "hedge";
  he: HEdge | undefined;
  // state: "none" | "hover" | "selected";
}
interface VertGlyph {
  kind: "vert";
  hv: HVert | undefined;
  // state: "none" | "hover" | "selected";
}
// TODO(@darzu): "H" in HGlyph vs Glyph is confusing
type Glyph = HedgeGlyph | VertGlyph;
const GlyphDef = EM.defineComponent("hglyph", (g: Glyph) => g);

type GlyphEnt = EntityW<
  [
    typeof GlyphDef,
    typeof ColorDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

// type HEditor = ReturnType<typeof createHalfEdgeEditor>;

// interface MeshEditor {
//   _vertGlyphPool: GlyphEnt[];
//   _hedgeGlyphPool: GlyphEnt[];

//   mesh: Mesh;
//   hpoly: HPoly;
//   // hpolyEnt:

//   vertGlpyhs: Map<number, GlyphEnt>;
//   hedgeGlyphs: Map<number, GlyphEnt>;

//   setMesh(m: Mesh): void;

// }

// async function createHalfEdgeEditor(hp: HPoly) {
//   // TODO(@darzu):
//   // editor operations: verts in area
//   // editor operations: hedges in area
//   // mapping between vert and vert glpyhs

// }

export async function initMeshEditor(hpMesh: Mesh, cursorId: number) {
  const { assets } = await EM.whenResources(AssetsDef);

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
  // EM.ensureComponentOn(dragBox, ColorDef, [0.2, 0.2, 0.2]);

  const hp = meshToHalfEdgePoly(hpMesh);

  // const hpEditor = await createHalfEdgeEditor(hp);

  // vert glyphs
  let vertGlpyhs: Map<number, GlyphEnt> = new Map();
  for (let v of hp.verts) {
    // TODO(@darzu): seperate positioning
    createHVertGlyph().then((g) => assignHVertGlyph(g, v));
  }

  // half-edge glyphs
  // console.dir(assets.he_quad.mesh);
  // console.dir(assets.he_quad.aabb);
  // console.dir(assets.he_octo.mesh);
  // console.dir(assets.he_octo.aabb);
  let hedgeGlyphs: Map<number, GlyphEnt> = new Map();
  for (let he of hp.edges) {
    const visible = !he.face;
    if (visible) {
      // TODO(@darzu): move to pool
      createHEdgeGlyph().then((g) => assignHEdgeGlyph(g, he));
    }
  }

  const ent0 = EM.newEntity();
  EM.ensureComponentOn(
    ent0,
    RenderableConstructDef,
    hp.mesh as Mesh, // TODO(@darzu): hacky cast
    true,
    undefined,
    undefined,
    "std",
    false,
    {
      maxVertNum: 100,
      maxTriNum: 100,
      maxLineNum: 0,
    }
  );
  EM.ensureComponentOn(ent0, PositionDef, [0, 0.1, 0]);
  const hpEnt = await EM.whenEntityHas(ent0, RenderableDef);

  // TODO(@darzu): refactor. Also have undo-stack
  let hoverGlyphs: GlyphEnt[] = [];
  let selectedGlyphs: GlyphEnt[] = [];
  let cursorGlpyh: GlyphEnt | undefined = undefined;
  let worldDrag = vec3.create();
  EM.registerSystem(
    null,
    [
      PhysicsResultsDef,
      MouseDragDef,
      CameraViewDef,
      RendererDef,
      InputsDef,
      ButtonsStateDef,
    ],
    (
      _,
      { physicsResults, mousedrag, cameraView, renderer, inputs, buttonsState }
    ) => {
      let didUpdateMesh = false;
      let didEnlargeMesh = false;
      const hedgesToMove = new Set<number>();

      // update dragbox
      if (cursorGlpyh || mousedrag.isDragEnd) {
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
        hoverGlyphs.length = 0;

        if (cursorGlpyh) {
          // drag selected
          // TODO(@darzu): check that cursorGlyph is vert and selected
          // TODO(@darzu): IMPL hedges
          const isCursorSelected = selectedGlyphs.some(
            (g) => g === cursorGlpyh
          );
          if (!isCursorSelected) selectedGlyphs = [cursorGlpyh];
          for (let g of selectedGlyphs) {
            if (g.hglyph.kind === "vert") {
              assert(g.hglyph.hv);
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
          selectedGlyphs.length = 0;

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
            hoverGlyphs.push(g);
          }
        }
      } else if (mousedrag.isDragEnd) {
        if (!cursorGlpyh) {
          // select box done
          selectedGlyphs = hoverGlyphs;
          hoverGlyphs = [];
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
        cursorGlpyh = undefined;

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
            cursorGlpyh = g;
            break;
          }
        }
      }

      // update hedges
      for (let hi of hedgesToMove.values()) {
        const he = hp.edges[hi];
        assert(he.hi === hi, `hedge idx mismatch`);
        positionHedge(he);
      }

      // update glyph colors based on state
      for (let g of [...vertGlpyhs.values(), ...hedgeGlyphs.values()])
        vec3.copy(g.color, ENDESGA16.lightBlue);
      for (let g of hoverGlyphs) vec3.copy(g.color, ENDESGA16.yellow);
      for (let g of selectedGlyphs) vec3.copy(g.color, ENDESGA16.lightGreen);
      if (cursorGlpyh) vec3.copy(cursorGlpyh.color, ENDESGA16.red);

      // update mesh
      const handle = hpEnt.renderable.meshHandle;
      if (didEnlargeMesh) {
        renderer.renderer.stdPool.updateMeshSize(handle, handle.mesh!);
        if (handle.mesh!.quad.length)
          renderer.renderer.stdPool.updateMeshQuads(handle, handle.mesh!);
        if (handle.mesh!.tri.length)
          renderer.renderer.stdPool.updateMeshTriangles(handle, handle.mesh!);
      }
      if (didUpdateMesh || didEnlargeMesh) {
        renderer.renderer.stdPool.updateMeshVertices(handle, handle.mesh!);
      }
    },
    "editHPoly"
  );
  gameplaySystems.push("editHPoly");

  function translateVert(v: HVert, delta: vec3) {
    const glyph = vertGlpyhs.get(v.vi);
    assert(glyph && glyph.hglyph.kind === "vert" && glyph.hglyph.hv === v);

    const pos = hp.mesh.pos[v.vi];
    vec3.add(pos, pos, delta);
    glyph.position[0] = pos[0];
    glyph.position[2] = pos[2];
  }
  function positionHedge(he: HEdge) {
    // TODO(@darzu): take a glyph?
    const glyph = hedgeGlyphs.get(he.hi);
    if (glyph) {
      assert(
        glyph.hglyph.kind === "hedge" && glyph.hglyph.he === he,
        `hedge glyph lookup mismatch: ${he.hi}`
      );

      const pos0 = hp.mesh.pos[he.orig.vi];
      const pos1 = hp.mesh.pos[he.twin.orig.vi];
      const diff = vec3.sub(tempVec3(), pos1, pos0);
      const theta = Math.atan2(diff[0], diff[2]) + Math.PI * 0.5;
      quat.fromEuler(glyph.rotation, 0, theta, 0);
      vec3Mid(glyph.position, pos0, pos1);
      glyph.position[1] = 0.2;
    }
  }
  function extrudeHEdge(he: HEdge) {
    const { face, verts, edges } = extrudeQuad(hp, he);

    const oldGlyph = hedgeGlyphs.get(he.hi);
    if (oldGlyph) {
      oldGlyph.renderable.hidden = true;
    }

    for (let v of verts) {
      // TODO(@darzu): move to pool
      createHVertGlyph().then((g) => assignHVertGlyph(g, v));
    }

    for (let he of edges) {
      const visible = !he.face;
      if (visible) {
        createHEdgeGlyph().then((g) => assignHEdgeGlyph(g, he));
      }
    }
  }

  async function createHVertGlyph(): Promise<GlyphEnt> {
    // const pos = vec3.clone(hp.mesh.pos[v.vi]);
    // pos[1] = 0.2;
    const glyph_ = EM.newEntity();
    EM.ensureComponentOn(
      glyph_,
      RenderableConstructDef,
      assets.he_octo.proto,
      false
    );
    EM.ensureComponentOn(glyph_, ColorDef);
    // EM.ensureComponentOn(glyph, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph_, PositionDef);
    // EM.ensureComponentOn(glyph_, PositionDef, pos);
    EM.ensureComponentOn(glyph_, RotationDef, quat.create());
    EM.ensureComponentOn(glyph_, GlyphDef, {
      kind: "vert",
      hv: undefined,
      // state: "none",
    });
    EM.ensureComponentOn(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_octo.aabb,
    });
    EM.ensureComponentOn(glyph_, ButtonDef, "glyph-vert");
    const glyph = await EM.whenEntityHas(
      glyph_,
      GlyphDef,
      ColorDef,
      PositionDef,
      RotationDef,
      RenderableDef,
      ButtonDef
    );
    // vertGlpyhs.set(v.vi, glyph);
    return glyph;
  }
  function assignHVertGlyph(g: GlyphEnt, v: HVert) {
    g.renderable.enabled = true;
    g.renderable.hidden = false;
    assert(g.hglyph.kind === "vert");
    g.hglyph.hv = v;
    g.button.data = v.vi;
    vertGlpyhs.set(v.vi, g);
    const pos = vec3.copy(g.position, hp.mesh.pos[v.vi]);
    pos[1] = 0.2;
  }
  function assignHEdgeGlyph(g: GlyphEnt, he: HEdge) {
    g.renderable.enabled = true;
    g.renderable.hidden = false;
    assert(g.hglyph.kind === "hedge");
    g.hglyph.he = he;
    g.button.data = he.hi;
    hedgeGlyphs.set(he.hi, g);
    positionHedge(he);
  }
  async function createHEdgeGlyph(): Promise<GlyphEnt> {
    // he: HEdge,
    // visible: boolean
    // TODO(@darzu):
    const glyph_ = EM.newEntity();
    EM.ensureComponentOn(
      glyph_,
      RenderableConstructDef,
      assets.he_quad.proto,
      false
    );
    EM.ensureComponentOn(glyph_, ColorDef);
    // EM.ensureComponentOn(vert, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph_, PositionDef);
    EM.ensureComponentOn(glyph_, RotationDef);
    EM.ensureComponentOn(glyph_, GlyphDef, {
      kind: "hedge",
      he: undefined,
      // state: "none",
    });
    EM.ensureComponentOn(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_quad.aabb,
    });
    EM.ensureComponentOn(glyph_, ButtonDef, "glyph-hedge");
    const glyph = await EM.whenEntityHas(
      glyph_,
      GlyphDef,
      ColorDef,
      PositionDef,
      RotationDef,
      RenderableDef,
      ButtonDef
    );
    // hedgeGlyphs.set(he.hi, glyph);
    // positionHedge(he);
    return glyph;
  }
}
