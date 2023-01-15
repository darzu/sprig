import { ColorDef } from "../color-ecs.js";
import { EM, EntityW } from "../entity-manager.js";
import { AssetsDef, GameMesh } from "../game/assets.js";
import { gameplaySystems } from "../game/game.js";
import { vec2, vec3, vec4, quat, mat4, mat3, V } from "../sprig-matrix.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { createIdxPool } from "../idx-pool.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { MeshHandle } from "../render/mesh-pool.js";
import {
  RenderableConstructDef,
  RendererDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { randNormalPosVec3, vec3Mid } from "../utils-3d.js";
import { ButtonsStateDef, ButtonDef } from "./button.js";
import { WidgetDef, WidgetLayerDef } from "./widgets.js";

// TODO(@darzu): do we need this ptr indirection? can't we just add/remove component? how does this interact
//  with pools?
const HEdgeDef = EM.defineComponent("hedge", (he: HEdge) => ({
  he,
}));
const HVertDef = EM.defineComponent("hvert", (hv: HVert) => ({
  hv,
}));

type HEdgeWEnt = EntityW<
  [
    typeof WidgetDef,
    typeof HEdgeDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof ColorDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;
type HVertWEnt = EntityW<
  [
    typeof WidgetDef,
    typeof HVertDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof ColorDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

export const MeshEditorDef = EM.defineComponent(
  "meshEditor",
  (me: MeshEditor) => me
);

// TODO(@darzu): this might be over engineered
const MAX_GLYPHS = 100;
const vertGlyphPool: HVertWEnt[] = [];
const vertGlyphPoolIdx = createIdxPool(MAX_GLYPHS);
const hedgeGlyphPool: HEdgeWEnt[] = [];
const hedgeGlyphPoolIdx = createIdxPool(MAX_GLYPHS);

export type MeshEditor = ReturnType<typeof createMeshEditor> extends Promise<
  infer T
>
  ? T
  : never;

async function createMeshEditor() {
  let hedgeGlyphs = new Map<number, HEdgeWEnt>();
  let vertGlpyhs = new Map<number, HVertWEnt>();

  const res = {
    hedgeGlyphs,
    vertGlpyhs,
    hp: undefined as HPoly | undefined,
    hpEnt: undefined as
      | EntityW<[typeof RenderableDef, typeof WorldFrameDef]>
      | undefined,

    setMesh,
    reset,
    positionVert,
    positionHedge,
    extrudeHEdge,
  };

  const { renderer, assets } = await EM.whenResources(RendererDef, AssetsDef);

  return res;

  function reset() {
    if (res.hp && res.hpEnt) {
      // TODO(@darzu): HACK. this color stuff is.. interesting
      res.hp.mesh.colors.forEach((c) => vec3.zero(c));
      renderer.renderer.stdPool.updateMeshVertices(
        res.hpEnt.renderable.meshHandle,
        res.hpEnt.renderable.meshHandle.mesh!
      );
    }

    // TODO(@darzu): i don't like all this statefulness. probably a better FP
    //    way to do this.
    for (let g of hedgeGlyphs.values()) hideHEdgeGlyph(g);
    hedgeGlyphs.clear();
    hedgeGlyphPoolIdx.reset();
    for (let g of vertGlpyhs.values()) hideHVertGlyph(g);
    vertGlpyhs.clear();
    vertGlyphPoolIdx.reset();
    res.hp = undefined;
    if (res.hpEnt) res.hpEnt.renderable.hidden = true;
  }

  async function setMesh(handle: MeshHandle) {
    assert(handle.mesh, `can only edit handles with a mesh ptr`);
    assert(handle.reserved, `can only edit meshes w/ reserved space`);

    reset();

    const mesh = handle.mesh;
    const hp = meshToHalfEdgePoly(mesh);

    res.hp = hp;

    // TODO(@darzu): HACK. this color stuff is.. interesting
    mesh.colors.forEach((c) => randNormalPosVec3(c));
    renderer.renderer.stdPool.updateMeshVertices(handle, mesh);

    if (res.hpEnt) {
      res.hpEnt.renderable.hidden = false;
      renderer.renderer.stdPool.updateMeshInstance(
        res.hpEnt.renderable.meshHandle,
        handle
      );
    } else {
      const hpEnt_ = EM.new();
      EM.ensureComponentOn(
        hpEnt_,
        RenderableConstructDef,
        handle,
        true,
        undefined,
        undefined,
        "std",
        false
      );
      EM.ensureComponentOn(hpEnt_, PositionDef, V(0, 0.1, 0));
      // TODO(@darzu): make scale configurable
      EM.ensureComponentOn(hpEnt_, ScaleDef, V(5, 5, 5));
      const hpEnt = await EM.whenEntityHas(
        hpEnt_,
        RenderableDef,
        WorldFrameDef
      );
      res.hpEnt = hpEnt;
    }

    // TODO(@darzu): use pools
    // vert glyphs
    for (let v of hp.verts) {
      nextHVertGlyph(v);
    }

    // half-edge glyphs
    for (let he of hp.edges) {
      if (!he.face) nextHEdgeGlyph(he);
    }
  }

  function hideHVertGlyph(g: HVertWEnt) {
    g.renderable.hidden = true;
    vertGlpyhs.delete(g.hvert.hv.vi);
    // g.hvert.hv = undefined; // TODO(@darzu): FIX
    g.button.data = undefined;
  }
  function hideHEdgeGlyph(g: HEdgeWEnt) {
    // TODO(@darzu): we would love to disable the collider. No mechanism for that yet
    g.renderable.hidden = true;
    hedgeGlyphs.delete(g.hedge.he.hi);
    // g.hedge.he = undefined; // TODO(@darzu): FIX
    g.button.data = undefined;
  }

  function _createGlyph(gm: GameMesh) {
    const glyph_ = EM.new();
    EM.ensureComponentOn(glyph_, RenderableConstructDef, gm.proto, false);
    EM.ensureComponentOn(glyph_, ColorDef);
    EM.ensureComponentOn(glyph_, PositionDef);
    EM.ensureComponentOn(glyph_, RotationDef, quat.create());
    EM.ensureComponentOn(glyph_, WidgetDef);
    EM.ensureComponentOn(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: gm.aabb,
    });

    return glyph_;
  }

  async function nextHVertGlyph(hv: HVert): Promise<HVertWEnt> {
    const idx = vertGlyphPoolIdx.next();
    assert(idx !== undefined, `out of glyphs`);
    if (!vertGlyphPool[idx]) {
      // create if missing
      const glyph_ = _createGlyph(assets.he_octo);
      EM.ensureComponentOn(glyph_, HVertDef, hv);
      EM.ensureComponentOn(glyph_, ButtonDef, "glyph-vert");
      const glyph = await EM.whenEntityHas(
        glyph_,
        HVertDef,
        WidgetDef,
        ColorDef,
        PositionDef,
        RotationDef,
        RenderableDef,
        ButtonDef
      );
      // vertGlpyhs.set(v.vi, glyph);

      vertGlyphPool[idx] = glyph;
    }
    const g = vertGlyphPool[idx];

    // init once from pool
    g.renderable.enabled = true;
    g.renderable.hidden = false;
    g.hvert.hv = hv;
    g.button.data = hv.vi;
    vertGlpyhs.set(hv.vi, g);

    // initial position
    // TODO(@darzu): need to think about how we position verts
    // console.dir(res);
    assert(res.hp && res.hpEnt);
    const pos = vec3.copy(g.position, res.hp.mesh.pos[hv.vi]);
    vec3.transformMat4(pos, res.hpEnt.world.transform, pos);
    pos[1] = 0.2; // TODO(@darzu): this z-layering stuff is wierd

    return g;
  }
  // async function assignHEdgeGlyph(he: HEdge): Promise<HEdgeWEnt> {
  async function nextHEdgeGlyph(he: HEdge): Promise<HEdgeWEnt> {
    const idx = hedgeGlyphPoolIdx.next();
    assert(idx !== undefined, `out of glyphs`);
    if (!hedgeGlyphPool[idx]) {
      // create if missing
      const glyph_ = _createGlyph(assets.he_quad);
      EM.ensureComponentOn(glyph_, HEdgeDef, he);
      EM.ensureComponentOn(glyph_, ButtonDef, "glyph-hedge");
      const glyph = await EM.whenEntityHas(
        glyph_,
        WidgetDef,
        HEdgeDef,
        ColorDef,
        PositionDef,
        RotationDef,
        RenderableDef,
        ButtonDef
      );
      // hedgeGlyphs.set(he.hi, glyph);
      // positionHedge(he);

      hedgeGlyphPool[idx] = glyph;
    }
    const g = hedgeGlyphPool[idx];

    // init from pool
    g.renderable.enabled = true;
    g.renderable.hidden = false;
    g.hedge.he = he;
    g.button.data = he.hi;
    hedgeGlyphs.set(he.hi, g);

    // initial position
    positionHedge(he);

    return g;
  }
  function positionVert(v: HVert) {
    const glyph = vertGlpyhs.get(v.vi);
    assert(glyph); // TODO(@darzu): BUG. FAILS SOMETIMES. uh oh
    assert(res.hp && res.hpEnt);
    const vertPos = res.hp.mesh.pos[v.vi];

    // TODO(@darzu): PERF, expensive inverse
    // TODO(@darzu): doesn't account for parent translation
    // TODO(@darzu): should be done via parenting
    const invTrans4 = mat4.invert(res.hpEnt.world.transform);
    const invTrans3 = mat3.fromMat4(invTrans4);
    const posE = vec3.transformMat3(glyph.position, invTrans3);

    vertPos[0] = posE[0];
    vertPos[2] = posE[2];
  }
  function positionHedge(he: HEdge) {
    // TODO(@darzu): take a glyph?
    assert(res.hpEnt);
    const glyph = hedgeGlyphs.get(he.hi);
    if (glyph) {
      assert(res.hp);

      const pos0 = vec3.copy(vec3.tmp(), res.hp.mesh.pos[he.orig.vi]);
      vec3.transformMat4(pos0, res.hpEnt.world.transform, pos0);
      const pos1 = vec3.copy(vec3.tmp(), res.hp.mesh.pos[he.twin.orig.vi]);
      vec3.transformMat4(pos1, res.hpEnt.world.transform, pos1);
      const diff = vec3.sub(pos1, pos0);
      const theta = Math.atan2(diff[0], diff[2]) + Math.PI * 0.5;
      quat.fromEuler(0, theta, 0, glyph.rotation);
      vec3Mid(glyph.position, pos0, pos1);
      glyph.position[1] = 0.2;
    }
  }
  function extrudeHEdge(he: HEdge) {
    assert(res.hp);
    const { face, verts, edges } = extrudeQuad(res.hp, he);

    const oldGlyph = hedgeGlyphs.get(he.hi);
    if (oldGlyph) {
      hideHEdgeGlyph(oldGlyph);
      // TODO(@darzu): FREE IN POOL! Needs back ptr
    }

    for (let v of verts) {
      nextHVertGlyph(v);
    }

    for (let he of edges) {
      if (!he.face) nextHEdgeGlyph(he);
    }

    // TODO(@darzu): color hack
    randNormalPosVec3(res.hp.mesh.colors[face.fi]);
  }
}

export async function initMeshEditor() {
  // initWidgets();

  {
    const me = await createMeshEditor();
    EM.addResource(MeshEditorDef, me);
  }

  // TODO(@darzu): DBG only
  // meshEditor.setMesh(startMesh);

  // TODO(@darzu): undo-stack
  EM.registerSystem(
    null,
    [MeshEditorDef, RendererDef, ButtonsStateDef, WidgetLayerDef],
    (_, { meshEditor: e, renderer, buttonsState, widgets }) => {
      let didUpdateMesh = false;
      let didEnlargeMesh = false;
      const hedgesToMove = new Set<number>();

      if (!e.hpEnt || !e.hp) return;

      // move verts
      for (let wi of widgets.moved) {
        const w = EM.findEntity(wi, [WidgetDef, HVertDef]);
        if (w) {
          e.positionVert(w.hvert.hv);
          let edg = w.hvert.hv.edg;
          while (edg.orig === w.hvert.hv) {
            hedgesToMove.add(edg.hi);
            hedgesToMove.add(edg.twin.hi);
            edg = edg.twin.next;
            if (edg === w.hvert.hv.edg) break;
          }
          didUpdateMesh = true;
        }
      }

      // click to extrude
      // TODO(@darzu): move elsewhere?
      const clickedHi = buttonsState.clickByKey["glyph-hedge"];
      if (clickedHi !== undefined) {
        // console.log("hedge click!");
        const he = e.hedgeGlyphs.get(clickedHi);
        assert(he, `invalid click data: ${clickedHi}`);
        // quad extrude
        e.extrudeHEdge(he.hedge.he);
        didEnlargeMesh = true;
      }

      // update hedges
      for (let hi of hedgesToMove.values()) {
        const he = e.hp.edges[hi];
        assert(he.hi === hi, `hedge idx mismatch`);
        e.positionHedge(he);
      }

      // update mesh
      const handle = e.hpEnt.renderable.meshHandle;
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
  EM.requireGameplaySystem("editHPoly");

  // TODO(@darzu): is this necessary?
  EM.addConstraint(["editHPoly", "after", "updateWidgets"]);
}
