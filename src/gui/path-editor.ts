import { ColorDef } from "../color/color-ecs.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { GameMesh, gameMeshFromMesh } from "../meshes/mesh-loader.js";
import { V2, V3, V4, quat, V } from "../matrix/sprig-matrix.js";
import { createIdxPool } from "../utils/idx-pool.js";
import { rayVsRay } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { MeshReserve } from "../render/mesh-pool.js";
import { LineMesh, Mesh, RawMesh } from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RendererDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { randNormalPosVec3 } from "../utils/utils-3d.js";
import { ButtonsStateDef, ButtonDef } from "./button.js";
import { WidgetDef, WidgetLayerDef } from "./widgets.js";
import { meshPoolPtr } from "../render/pipelines/std-scene.js";
import { Phase } from "../ecs/sys-phase.js";

// TODO(@darzu): consolidate with spline.ts

const UP: V3.InputT = [0, 0, 1];

const HLineDef = EM.defineNonupdatableComponent("hline", (hl: HLine) => ({
  hl,
}));

// TODO(@darzu): terrible name
type HLineEnt = EntityW<
  [
    typeof WidgetDef,
    typeof HLineDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof ColorDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

export const PathEditorDef = EM.defineResource(
  "pathEditor",
  (pe: PathEditor) => pe
);

// TODO(@darzu): this might be over engineered
const MAX_GLYPHS = 100;
const glyphPool: HLineEnt[] = [];
const glyphPoolIdx = createIdxPool(MAX_GLYPHS);

export type PathEditor = ReturnType<typeof createPathEditor> extends Promise<
  infer T
>
  ? T
  : never;

async function createPathEditor() {
  let glyphs = new Map<number, HLineEnt>();

  // TODO(@darzu): lnMesh

  const res = {
    // interaction
    glyphs,

    // truth
    lnMesh: undefined as LineMesh | undefined,
    lns: undefined as HLine[] | undefined,

    // visual
    outMesh: undefined as Mesh | undefined,
    outEnt: undefined as
      | EntityW<[typeof RenderableDef, typeof WorldFrameDef]>
      | undefined,

    // swap truth
    setLineMesh,
    reset,

    // truth mutation
    positionVert,
  };

  const { renderer, allMeshes } = await EM.whenResources(
    RendererDef,
    AllMeshesDef
  );
  const stdPool = renderer.renderer.getCyResource(meshPoolPtr)!;

  return res;

  function reset() {
    for (let g of glyphs.values()) hideGlyph(g);
    glyphs.clear();
    glyphPoolIdx.reset();
    res.lnMesh = undefined;
    res.lns = undefined;
    if (res.outEnt) res.outEnt.renderable.hidden = true;
  }

  function _generateOutMesh(): Mesh {
    // TODO(@darzu):
    throw "todo";
  }

  async function setLineMesh(newLnMesh: LineMesh) {
    reset();

    const lns = linesAsList([], meshToHLines(newLnMesh));

    res.lns = lns;
    res.lnMesh = newLnMesh;

    const newOutMesh = _generateOutMesh();

    assert(!!res.outMesh === !!res.outEnt);
    if (!res.outEnt || !res.outMesh) {
      res.outMesh = newOutMesh;

      const reserve: MeshReserve = {
        maxVertNum: 100,
        maxTriNum: 100,
        maxLineNum: 0,
      };

      const hpEnt_ = EM.new();
      EM.set(
        hpEnt_,
        RenderableConstructDef,
        res.outMesh,
        true,
        undefined,
        undefined,
        meshPoolPtr,
        false,
        reserve
      );
      EM.set(hpEnt_, PositionDef, V(0, 0, 0.1));
      // TODO(@darzu): make scale configurable
      // EM.set(hpEnt_, ScaleDef, [5, 5, 5]);
      const hpEnt = await EM.whenEntityHas(
        hpEnt_,
        RenderableDef,
        WorldFrameDef
      );

      res.outEnt = hpEnt;
    } else {
      res.outEnt.renderable.hidden = false;
      // renderer.renderer.stdPool.updateMeshInstance(
      //   res.outEnt.renderable.meshHandle,
      //   handle
      // );

      // TODO(@darzu): IMPL copyMesh!!
      // copyMesh(res.outMesh, newOutMesh);

      // TODO(@darzu): move elsewhere
      stdPool.updateMeshQuads(res.outEnt.renderable.meshHandle, res.outMesh);
      stdPool.updateMeshTriangles(
        res.outEnt.renderable.meshHandle,
        res.outMesh
      );
      stdPool.updateMeshSize(res.outEnt.renderable.meshHandle, res.outMesh);
      stdPool.updateMeshVertices(res.outEnt.renderable.meshHandle, res.outMesh);
    }

    // vert glyphs
    for (let ln of res.lns) {
      nextGlyph(ln);
    }
  }

  function hideGlyph(g: HLineEnt) {
    g.renderable.hidden = true;
    glyphs.delete(g.hline.hl.vi);
    // g.hvert.hv = undefined; // TODO(@darzu): FIX
    g.button.data = undefined;
  }

  function _createGlyph(gm: GameMesh) {
    // TODO(@darzu): de-duplicate
    const glyph_ = EM.new();
    EM.set(glyph_, RenderableConstructDef, gm.proto, false);
    EM.set(glyph_, ColorDef);
    EM.set(glyph_, PositionDef);
    EM.set(glyph_, RotationDef, quat.mk());
    EM.set(glyph_, WidgetDef);
    EM.set(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: gm.aabb,
    });

    return glyph_;
  }

  async function nextGlyph(hl: HLine): Promise<HLineEnt> {
    // TODO(@darzu): de-dupe
    const idx = glyphPoolIdx.next();
    assert(idx !== undefined, `out of glyphs`);
    if (!glyphPool[idx]) {
      // create if missing
      const glyph_ = _createGlyph(allMeshes.he_octo);
      EM.set(glyph_, HLineDef, hl);
      EM.set(glyph_, ButtonDef, "glyph-vert");
      const glyph = await EM.whenEntityHas(
        glyph_,
        HLineDef,
        WidgetDef,
        ColorDef,
        PositionDef,
        RotationDef,
        RenderableDef,
        ButtonDef
      );
      // vertGlpyhs.set(v.vi, glyph);

      glyphPool[idx] = glyph;
    }
    const g = glyphPool[idx];

    // init once from pool
    g.renderable.enabled = true;
    g.renderable.hidden = false;
    g.hline.hl = hl;
    g.button.data = hl.vi;
    glyphs.set(hl.vi, g);

    // initial position
    // TODO(@darzu): need to think about how we position verts
    // console.dir(res);
    assert(res.lnMesh);
    const pos = V3.copy(g.position, res.lnMesh.pos[hl.vi]);
    // TODO(@darzu): support world transforms
    // vec3.transformMat4(pos, pos, res.outEnt.world.transform);
    pos[2] = 0.2; // TODO(@darzu): this z-layering stuff is wierd

    return g;
  }
  function positionVert(hl: HLine) {
    // TODO(@darzu): fix IMPL!
    const glyph = glyphs.get(hl.vi);
    assert(glyph);
    assert(res.lnMesh);
    const vertPos = res.lnMesh.pos[hl.vi];

    // TODO(@darzu): PERF, expensive inverse
    // TODO(@darzu): doesn't account for parent translation
    // TODO(@darzu): should be done via parenting
    // const invTrans4 = mat4.invert(tempMat4(), res.outEnt.world.transform);
    // const invTrans3 = mat3.fromMat4(tempMat3(), invTrans4);
    // const posE = vec3.transformMat3(tempVec3(), glyph.position, invTrans3);
    const posE = glyph.position;

    vertPos[0] = posE[0];
    vertPos[1] = posE[1];
  }
}

export async function initPathEditor() {
  // TODO(@darzu):  only call if mesh editor hasn't initted widgets!
  // initWidgets();

  {
    const me = await createPathEditor();
    EM.addResource(PathEditorDef, me);
  }

  // TODO(@darzu): DBG only
  // pathEditor.setMesh(startMesh);

  // TODO(@darzu): undo-stack
  EM.addSystem(
    "editHPoly",
    Phase.GAME_WORLD,
    null,
    [PathEditorDef, RendererDef, ButtonsStateDef, WidgetLayerDef],
    (_, { pathEditor: e, renderer, buttonsState, widgets }) => {
      let didUpdateMesh = false;
      let didEnlargeMesh = false;
      // const hedgesToMove = new Set<number>();

      if (!e.outEnt || !e.outMesh) return;

      // move verts
      for (let wi of widgets.moved) {
        const w = EM.findEntity(wi, [WidgetDef, HLineDef]);
        if (w) {
          e.positionVert(w.hline.hl);
          didUpdateMesh = true;
        }
      }

      // TODO(@darzu): impl for path ends
      // // click to extrude
      // // TODO(@darzu): move elsewhere?
      // const clickedHi = buttonsState.clickByKey["glyph-hedge"];
      // if (clickedHi !== undefined) {
      //   // console.log("hedge click!");
      //   const he = e.hedgeGlyphs.get(clickedHi);
      //   assert(he, `invalid click data: ${clickedHi}`);
      //   // quad extrude
      //   e.extrudeHEdge(he.hedge.he);
      //   didEnlargeMesh = true;
      // }

      // update mesh
      const stdPool = renderer.renderer.getCyResource(meshPoolPtr)!;
      const handle = e.outEnt.renderable.meshHandle;
      if (didEnlargeMesh) {
        stdPool.updateMeshSize(handle, handle.mesh!);
        if (handle.mesh!.quad.length)
          stdPool.updateMeshQuads(handle, handle.mesh!);
        if (handle.mesh!.tri.length)
          stdPool.updateMeshTriangles(handle, handle.mesh!);
      }
      if (didUpdateMesh || didEnlargeMesh) {
        stdPool.updateMeshVertices(handle, handle.mesh!);
      }
    }
  );
}

// TODO(@darzu): can/should this be merged with half-edge stuff?
export interface HLine {
  vi: number;
  next?: HLine;
  prev?: HLine;
}

function meshToHLines(m: LineMesh): HLine {
  assert(m.lines.length);
  const linesByVi = new Map<number, HLine>();
  m.lines.forEach(([v0, v1]) => {
    if (!linesByVi.has(v0)) linesByVi.set(v0, { vi: v0 } as HLine);
    if (!linesByVi.has(v1)) linesByVi.set(v1, { vi: v1 } as HLine);
  });
  m.lines.forEach(([v0, v1]) => {
    const ln0 = linesByVi.get(v0);
    const ln1 = linesByVi.get(v1);
    if (ln0) ln0.next = ln1;
    if (ln1) ln1.prev = ln0;
  });

  let first = linesByVi.get(m.lines[0][0])!;
  while (first.prev) first = first.prev;

  return first;
}

export function createMeshFromHLine(ln: HLine) {
  // TODO(@darzu): IMPL!
}

// TODO(@darzu): rename
export async function lineStuff() {
  const lnMesh: RawMesh & LineMesh = {
    pos: [V(1, 1, 0), V(2, 2, 0), V(4, 3, 0), V(8, 3, 0), V(8, 6, 0)],
    tri: [],
    quad: [],
    lines: [V(0, 1), V(3, 4), V(2, 3), V(1, 2)],
    colors: [],
  };

  const hline = meshToHLines(lnMesh);

  const lns = linesAsList([], hline);

  // console.log(lns);

  const width = 2.0;

  const pts = lns.map((ln) => getControlPoints(ln, width));

  // console.dir(pts);

  const extMesh: Mesh = {
    pos: [],
    tri: [],
    quad: [],
    lines: [],
    colors: [],
    surfaceIds: [],
    usesProvoking: true,
  };

  pts.forEach(([a1, a2]) => {
    extMesh.pos.push(a1);
    extMesh.pos.push(a2);
  });

  for (let i = 1; i < pts.length; i++) {
    const pi = i * 2;
    const pA1 = pi - 2;
    const pA2 = pi - 1;
    const A1 = pi + 0;
    const A2 = pi + 1;
    extMesh.quad.push(V4.clone([A1, pA1, pA2, A2]));
    extMesh.surfaceIds.push(i);
    extMesh.colors.push(randNormalPosVec3(V3.mk()));
  }

  const { renderer, allMeshes } = await EM.whenResources(
    RendererDef,
    AllMeshesDef
  );

  const gmesh = gameMeshFromMesh(extMesh, renderer.renderer);

  const extEnt = EM.new();
  EM.set(extEnt, RenderableConstructDef, gmesh.proto);
  EM.set(extEnt, PositionDef, V(0, 0, 0.5));

  for (let ln of lns) {
    const vertGlyph = EM.new();
    EM.set(vertGlyph, RenderableConstructDef, allMeshes.cube.proto);
    EM.set(vertGlyph, PositionDef, V3.clone(lnMesh.pos[ln.vi]));
    EM.set(vertGlyph, ColorDef, V(0.1, 0.2 + ln.vi * 0.1, 0.1));
    EM.set(vertGlyph, ScaleDef, V(0.2, 0.2, 0.2));
    vertGlyph.position[2] = 0.5;
  }

  function getControlPoints(ln: HLine, width: number): [V3, V3] {
    const A = lnMesh.pos[ln.vi];

    if (!ln.next || !ln.prev) {
      // end cap
      const A1 = V3.mk();
      const A2 = V3.mk();

      const Oln = ln.next ?? ln.prev; // other line
      const O = Oln ? lnMesh.pos[Oln.vi] : V3.add(A, [1, 0, 0]);
      const dir = V3.sub(O, A);
      if (!ln.next && ln.prev) V3.neg(dir, dir);
      V3.norm(dir, dir);

      const perp = V3.cross(dir, UP);

      // TODO(@darzu): this is right for end caps, not the mids!!
      V3.sub(A, V3.scale(perp, width), A1);
      V3.add(A, V3.scale(perp, width), A2);

      return [A1, A2];
    } else {
      // mid point
      const P = lnMesh.pos[ln.prev.vi];
      const PAdir = V3.sub(A, P);
      V3.norm(PAdir, PAdir);
      const PAperp = V3.cross(PAdir, UP);
      const P1 = V3.sub(A, V3.scale(PAperp, width));
      V3.sub(P1, V3.scale(PAdir, width * 3), P1);
      const P2 = V3.add(A, V3.scale(PAperp, width));
      V3.sub(P2, V3.scale(PAdir, width * 3), P2);

      const N = lnMesh.pos[ln.next.vi];
      const NAdir = V3.sub(A, N);
      V3.norm(NAdir, NAdir);
      const NAperp = V3.cross(NAdir, UP);
      const N1 = V3.sub(A, V3.scale(NAperp, width));
      V3.sub(N1, V3.scale(NAdir, width * 3), N1);
      const N2 = V3.add(A, V3.scale(NAperp, width));
      V3.sub(N2, V3.scale(NAdir, width * 3), N2);

      const A1 = rayVsRay(
        {
          org: P1,
          dir: PAdir,
        },
        {
          org: N2,
          dir: NAdir,
        }
      );
      assert(A1, `P1 vs N2 failed`);

      const A2 = rayVsRay(
        {
          org: P2,
          dir: PAdir,
        },
        {
          org: N1,
          dir: NAdir,
        }
      );
      assert(A2, `P2 vs N1 failed`);

      return [A1, A2];
    }
  }

  // const points: vec2[] = [];

  // let prevA1: vec2;
  // let prevA2: vec2;
  // for (let i = -1; i < points.length; i++) {
  //   const A = points[i];
  //   const B = points[i + 1];

  //   if (!A && B) {
  //     // start cap
  //     // const A1 =
  //   } else if (A && B) {
  //     // mid section
  //   } else if (A && !B) {
  //     // end cap
  //   } else {
  //     assert(false, "should be unreachable");
  //   }
  // }
}

function linesAsList(acc: HLine[], curr?: HLine): HLine[] {
  if (!curr) return acc;
  if (!acc.length && curr.prev) return linesAsList(acc, curr.prev);
  acc.push(curr);
  return linesAsList(acc, curr.next);
}
