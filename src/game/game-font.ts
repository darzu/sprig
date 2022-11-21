import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { dbg } from "../debugger.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { vec3, quat, mat4 } from "../gl-matrix.js";
import { ButtonDef, ButtonsStateDef, initButtonGUI } from "../gui/button.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { exportObj, importObj } from "../import_obj.js";
import { InputsDef, MouseDragDef } from "../inputs.js";
import { mathMap } from "../math.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { MeshReserve } from "../render/mesh-pool.js";
import {
  cloneMesh,
  getAABBFromMesh,
  Mesh,
  normalizeMesh,
  scaleMesh,
  transformMesh,
  unshareProvokingVertices,
} from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import { randNormalPosVec3, vec3Mid } from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import {
  AssetsDef,
  GameMesh,
  gameMeshFromMesh,
  makePlaneMesh,
} from "./assets.js";
import { createGhost, gameplaySystems } from "./game.js";

/*
TODO(@darzu):
 [x] new faces get new colors
 [ ] allow edge collapse, towards either vert
  [ ] quad -> tri
  [ ] tri -> [none]
 [ ] edge extrude should be perp
 [ ] show 2D and 3D spinning preview of glyph
 [ ] show font references
 [ ] show font character bounds
 [ ] loop cut
 [ ] export to font
  [x] button render w/ click and action
  [ ] bank of characters: map of character to mesh proto
 [ ] render arbitrary-ish text
*/

const DBG_3D = false; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

export async function initFontEditor(em: EntityManager) {
  initButtonGUI();

  console.log(`panel ${PANEL_W}x${PANEL_H}`);

  // initCamera();

  const res = await em.whenResources(AssetsDef, RendererDef, ButtonsStateDef);

  res.renderer.pipelines = [
    // ...shadowPipelines,
    stdRenderPipeline,
    alphaRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const sunlight = em.newEntity();
  em.ensureComponentOn(sunlight, PointLightDef);
  sunlight.pointLight.constant = 1.0;
  vec3.copy(sunlight.pointLight.ambient, [0.8, 0.8, 0.8]);
  em.ensureComponentOn(sunlight, PositionDef, [10, 100, 10]);
  // TODO(@darzu): weird, why does renderable need to be on here?
  em.ensureComponentOn(
    sunlight,
    RenderableConstructDef,
    res.assets.ball.proto,
    false
  );

  const panel = em.newEntity();
  const panelMesh = makePlaneMesh(
    -PANEL_W * 0.5,
    PANEL_W * 0.5,
    -PANEL_H * 0.5,
    PANEL_H * 0.5
  );
  // panelMesh.colors[0] = [0.1, 0.3, 0.1];
  // panelMesh.colors[1] = [0.1, 0.1, 0.3];
  panelMesh.colors[0] = [0.4, 0.4, 0.4];
  em.ensureComponentOn(panel, RenderableConstructDef, panelMesh);
  // em.ensureComponentOn(panel, ColorDef, [0.2, 0.3, 0.2]);
  em.ensureComponentOn(panel, PositionDef, [0, 0, 0]);

  // for (let x of [-1, 0, 1])
  //   for (let z of [-1, 0, 1]) {
  //     const b1 = em.newEntity();
  //     em.ensureComponentOn(b1, RenderableConstructDef, res.assets.cube.proto);
  //     em.ensureComponentOn(b1, ColorDef, [
  //       mathMap(x, -1, 1, 0.05, 0.8),
  //       0,
  //       mathMap(z, -1, 1, 0.05, 0.8),
  //     ]);
  //     em.ensureComponentOn(b1, PositionDef, [
  //       PANEL_W * 0.5 * x,
  //       0,
  //       PANEL_H * 0.5 * z,
  //     ]);
  //   }

  if (DBG_3D) {
    const g = createGhost();
    em.ensureComponentOn(g, RenderableConstructDef, res.assets.ball.proto);

    // vec3.copy(g.position, [4.36,30.83,-1.53]);
    // quat.copy(g.rotation, [0.00,0.71,0.00,0.70]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.00,0.00,0.00]);
    // g.cameraFollow.yawOffset = 0.000;
    // g.cameraFollow.pitchOffset = -1.496;
    vec3.copy(g.position, [-1.45, 27.5, 6.93]);
    quat.copy(g.rotation, [0.0, 0.0, 0.0, 1.0]);
    vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -1.496;
  }

  {
    const camera = EM.addSingletonComponent(CameraDef);
    camera.fov = Math.PI * 0.5;
    camera.targetId = 0;
  }

  // TODO(@darzu): mouse lock?
  if (!DBG_3D)
    EM.whenResources(CanvasDef).then((canvas) =>
      canvas.htmlCanvas.unlockMouse()
    );

  const cursor = EM.newEntity();
  EM.ensureComponentOn(cursor, ColorDef, [0.1, 0.1, 0.1]);
  EM.ensureComponentOn(cursor, PositionDef, [0, 1.0, 0]);
  const { assets } = await EM.whenResources(AssetsDef);
  // EM.ensureComponentOn(cursor, RenderableConstructDef, assets.cube.proto);
  // const cursorLocalAABB = copyAABB(createAABB(), assets.cube.aabb);
  EM.ensureComponentOn(cursor, RenderableConstructDef, assets.he_octo.proto);
  const cursorLocalAABB = copyAABB(createAABB(), assets.he_octo.aabb);
  cursorLocalAABB.min[1] = -1;
  cursorLocalAABB.max[1] = 1;
  EM.ensureComponentOn(cursor, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: cursorLocalAABB,
  });

  EM.registerSystem(
    null,
    [CameraViewDef, CanvasDef, CameraDef, InputsDef],
    async (_, res) => {
      // TODO(@darzu):IMPL
      const { cameraView, htmlCanvas, inputs } = res;

      if (res.camera.targetId) return;

      // update aspect ratio and size
      cameraView.aspectRatio = Math.abs(
        htmlCanvas.canvas.width / htmlCanvas.canvas.height
      );
      cameraView.width = htmlCanvas.canvas.clientWidth;
      cameraView.height = htmlCanvas.canvas.clientHeight;

      // dbgLogOnce(
      //   `ar${cameraView.aspectRatio.toFixed(2)}`,
      //   `ar ${cameraView.aspectRatio.toFixed(2)}`
      // );

      let viewMatrix = mat4.create();

      mat4.rotateX(viewMatrix, viewMatrix, Math.PI * 0.5);
      // mat4.translate(viewMatrix, viewMatrix, [0, 10, 0]);

      // mat4.invert(viewMatrix, viewMatrix);

      const projectionMatrix = mat4.create();

      // TODO(@darzu): PRESERVE ASPECT RATIO!
      const VIEW_PAD = PANEL_W / 12;

      const padPanelW = PANEL_W + VIEW_PAD * 2;
      const padPanelH = PANEL_H + VIEW_PAD * 2;

      const padPanelAR = padPanelW / padPanelH;
      const cameraAR = cameraView.width / cameraView.height;

      // const maxPanelW = boxInBox(cameraView.width, cameraView.height, panelAR);

      let adjPanelW: number;
      let adjPanelH: number;
      if (cameraAR < padPanelAR) {
        // camera is "more portrait" than panel, thus we're width-constrained
        adjPanelW = padPanelW;
        adjPanelH = adjPanelW * (1 / cameraAR);
      } else {
        // conversely, we're height-constrained
        adjPanelH = padPanelH;
        adjPanelW = adjPanelH * cameraAR;
      }

      // TODO(@darzu): i don't understand the near/far clipping; why can't they be like -4, 4 ?
      mat4.ortho(
        projectionMatrix,
        -adjPanelW * 0.5,
        adjPanelW * 0.5,
        -adjPanelH * 0.5,
        adjPanelH * 0.5,
        -24,
        12
      );

      const viewProj = mat4.multiply(
        mat4.create(),
        projectionMatrix,
        viewMatrix
      ) as Float32Array;

      cameraView.viewProjMat = viewProj;
      cameraView.invViewProjMat = mat4.invert(
        cameraView.invViewProjMat,
        cameraView.viewProjMat
      );

      let cursorFracX = inputs.mousePos[0] / htmlCanvas.canvas.clientWidth;
      let cursorFracY = inputs.mousePos[1] / htmlCanvas.canvas.clientHeight;
      const cursorWorldPos = vec3.transformMat4(
        tempVec3(),
        [
          mathMap(cursorFracX, 0, 1, -1, 1),
          mathMap(cursorFracY, 0, 1, 1, -1),
          0,
        ],
        cameraView.invViewProjMat
      );
      cursor.position[0] = cursorWorldPos[0];
      cursor.position[2] = cursorWorldPos[2];
    },
    "uiCameraView"
  );

  gameplaySystems.push("uiCameraView");

  // testHalfEdge
  const hpMesh: Mesh = {
    quad: [[0, 1, 2, 3]],
    tri: [],
    pos: [
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, 1],
    ],
    colors: [randNormalPosVec3()],
    surfaceIds: [1],
    usesProvoking: true,
  };
  scaleMesh(hpMesh, 4);
  // const hpMesh: Mesh = {
  //   quad: [
  //     [0, 3, 4, 1],
  //     [3, 5, 6, 4],
  //   ],
  //   tri: [
  //     [2, 3, 0],
  //     [5, 3, 2],
  //   ],
  //   pos: [
  //     [0, 0, 0],
  //     [1, 0, 0],
  //     [-1, 0, 1],
  //     [0, 0, 1],
  //     [1, 0, 1],
  //     [0, 0, 2],
  //     [1, 0, 2],
  //   ],
  //   colors: [
  //     randNormalPosVec3(),
  //     randNormalPosVec3(),
  //     randNormalPosVec3(),
  //     randNormalPosVec3(),
  //   ],
  //   surfaceIds: [1, 2, 3, 4],
  //   usesProvoking: true,
  // };
  // scaleMesh(hpMesh, 4);

  const hp = meshToHalfEdgePoly(hpMesh);
  // console.dir(hp);

  // {
  //   const outerHes = hp.edges.filter((h) => !h.face)!;
  //   const newHes = outerHes.map((he) => extrudeQuad(hp, he));
  //   newHes.forEach((he, i) => {
  //     // vec3.set(mesh.colors[he.fi], 0.6, 0.05, 0.05);
  //     randNormalVec3(hpMesh.colors[he.fi]);
  //   });
  // }
  // console.dir(hp);
  // {
  //   const outerHes = hp.edges.filter((h) => !h.face)!;
  //   const newHes = outerHes.map((he) => extrudeQuad(hp, he));
  //   newHes.forEach((he, i) => {
  //     // vec3.set(mesh.colors[he.fi], 0.05, 0.05, 0.6);
  //     randNormalVec3(mesh.colors[he.fi]);
  //   });
  // }

  const hpEditor = await createHalfEdgeEditor(hp);

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

  // TODO(@darzu): refactor. Also have undo-stack
  let hoverGlyphs: Glyph[] = [];
  let selectedGlyphs: Glyph[] = [];
  let cursorGlpyh: Glyph | undefined = undefined;
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
              hpEditor.translateVert(g.hglyph.hv, worldDrag);
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
              HGlyphDef,
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
        const he = hpEditor.hedgeGlyphs.get(clickedHi);
        assert(
          he && he.hglyph.kind === "hedge",
          `invalid click data: ${clickedHi}`
        );
        // quad extrude
        hpEditor.extrudeHEdge(he.hglyph.he);
        didEnlargeMesh = true;
      }

      // non dragging
      if (!mousedrag.isDragging && !mousedrag.isDragEnd) {
        // unselect cursor glpyh
        cursorGlpyh = undefined;

        // find under-cursor glyph
        const hits = physicsResults.collidesWith.get(cursor.id) ?? [];
        // console.dir(hits);
        for (let hid of hits) {
          const g = EM.findEntity(hid, [
            HGlyphDef,
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
        hpEditor.positionHEdge(he);
      }

      // update glyph colors based on state
      for (let g of [
        ...hpEditor.vertGlpyhs.values(),
        ...hpEditor.hedgeGlyphs.values(),
      ])
        vec3.copy(g.color, ENDESGA16.lightBlue);
      for (let g of hoverGlyphs) vec3.copy(g.color, ENDESGA16.yellow);
      for (let g of selectedGlyphs) vec3.copy(g.color, ENDESGA16.lightGreen);
      if (cursorGlpyh) vec3.copy(cursorGlpyh.color, ENDESGA16.red);

      // update mesh
      const handle = hpEditor.hpEnt.renderable.meshHandle;
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

  // TODO(@darzu): HACK
  (dbg as any).exportPoly = () => {
    console.log(exportObj(hpMesh));
  };

  // TODO(@darzu): render buttons?
  {
    const polyBank = new Map<string, GameMesh>();

    for (let i = 0; i < 26; i++) {
      const key = `letter-a`;
      const mesh = cloneMesh(res.buttonsState.gmesh.mesh);
      mesh.dbgName = key;
      // console.dir(res.buttonsState.gmesh.mesh);
      // console.dir(mesh);
      const reserve: MeshReserve = {
        maxVertNum: 100,
        maxTriNum: 100,
        maxLineNum: 0,
      };
      const gmesh = gameMeshFromMesh(mesh, res.renderer.renderer, reserve);
      // TODO(@darzu): update gmesh after half-edge editor changes

      // TODO(@darzu): if they all have the same key, they don't work.
      const btn = EM.newEntity();
      EM.ensureComponentOn(btn, RenderableConstructDef, gmesh.proto);
      EM.ensureComponentOn(btn, PositionDef, [-24 + i * 2, 0.1, 12]);
      EM.ensureComponentOn(btn, ButtonDef, key, i, {
        default: ENDESGA16.lightGray,
        hover: ENDESGA16.darkGray,
        down: ENDESGA16.orange,
      });
      EM.ensureComponentOn(btn, ColorDef);
      EM.ensureComponentOn(btn, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: gmesh.aabb,
      });
    }
  }

  // TODO(@darzu): HACKY
  // EM.whenResources(ButtonsStateDef).then((res) => {
  res.buttonsState.cursorId = cursor.id;
  // });
}

interface HEdgeGlyph {
  kind: "hedge";
  he: HEdge;
  // state: "none" | "hover" | "selected";
}
interface HVertGlyph {
  kind: "vert";
  hv: HVert;
  // state: "none" | "hover" | "selected";
}
// TODO(@darzu): "H" in HGlyph vs Glyph is confusing
type HGlyph = HEdgeGlyph | HVertGlyph;
const HGlyphDef = EM.defineComponent("hglyph", (g: HGlyph) => g);

type Glyph = EntityW<
  [
    typeof HGlyphDef,
    typeof ColorDef,
    typeof PositionDef,
    typeof RotationDef,
    typeof RenderableDef,
    typeof ButtonDef
  ]
>;

type HEditor = ReturnType<typeof createHalfEdgeEditor>;
async function createHalfEdgeEditor(hp: HPoly) {
  // TODO(@darzu):
  // editor operations: verts in area
  // editor operations: hedges in area
  // mapping between vert and vert glpyhs

  const { assets } = await EM.whenResources(AssetsDef);
  // vert glyphs
  let vertGlpyhs: Map<number, Glyph> = new Map();
  for (let v of hp.verts) {
    // TODO(@darzu): seperate positioning
    createHVertGlyph(v);
  }

  async function createHVertGlyph(v: HVert) {
    const pos = vec3.clone(hp.mesh.pos[v.vi]);
    pos[1] = 0.2;
    const glyph_ = EM.newEntity();
    EM.ensureComponentOn(glyph_, RenderableConstructDef, assets.he_octo.proto);
    EM.ensureComponentOn(glyph_, ColorDef);
    // EM.ensureComponentOn(glyph, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph_, PositionDef, pos);
    EM.ensureComponentOn(glyph_, RotationDef, quat.create());
    EM.ensureComponentOn(glyph_, HGlyphDef, {
      kind: "vert",
      hv: v,
      // state: "none",
    });
    EM.ensureComponentOn(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_octo.aabb,
    });
    EM.ensureComponentOn(glyph_, ButtonDef, "glyph-vert", v.vi);
    const glyph = await EM.whenEntityHas(
      glyph_,
      HGlyphDef,
      ColorDef,
      PositionDef,
      RotationDef,
      RenderableDef,
      ButtonDef
    );
    vertGlpyhs.set(v.vi, glyph);
  }

  // half-edge glyphs
  // console.dir(assets.he_quad.mesh);
  // console.dir(assets.he_quad.aabb);
  // console.dir(assets.he_octo.mesh);
  // console.dir(assets.he_octo.aabb);
  let hedgeGlyphs: Map<number, Glyph> = new Map();
  for (let he of hp.edges) {
    const visible = !he.face;
    if (visible) createHEdgeGlyph(he, visible);
  }

  async function createHEdgeGlyph(he: HEdge, visible: boolean): Promise<Glyph> {
    // TODO(@darzu):
    const glyph_ = EM.newEntity();
    EM.ensureComponentOn(
      glyph_,
      RenderableConstructDef,
      assets.he_quad.proto,
      visible
    );
    EM.ensureComponentOn(glyph_, ColorDef);
    // EM.ensureComponentOn(vert, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph_, PositionDef);
    EM.ensureComponentOn(glyph_, RotationDef);
    EM.ensureComponentOn(glyph_, HGlyphDef, {
      kind: "hedge",
      he: he,
      // state: "none",
    });
    EM.ensureComponentOn(glyph_, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_quad.aabb,
    });
    EM.ensureComponentOn(glyph_, ButtonDef, "glyph-hedge", he.hi);
    const glyph = await EM.whenEntityHas(
      glyph_,
      HGlyphDef,
      ColorDef,
      PositionDef,
      RotationDef,
      RenderableDef,
      ButtonDef
    );
    hedgeGlyphs.set(he.hi, glyph);
    positionHEdgeGlyph(he);
    return glyph;
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
  const ent1 = await EM.whenEntityHas(ent0, RenderableDef);

  return {
    hp,
    hpEnt: ent1,
    vertGlpyhs,
    hedgeGlyphs,
    translateVert,
    positionHEdge: positionHEdgeGlyph,
    extrudeHEdge,
  };

  function translateVert(v: HVert, delta: vec3) {
    const glyph = vertGlpyhs.get(v.vi);
    assert(glyph && glyph.hglyph.kind === "vert" && glyph.hglyph.hv === v);

    const pos = hp.mesh.pos[v.vi];
    vec3.add(pos, pos, delta);
    glyph.position[0] = pos[0];
    glyph.position[2] = pos[2];
  }

  function positionHEdgeGlyph(he: HEdge) {
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
      createHVertGlyph(v);
    }

    for (let he of edges) {
      const visible = !he.face;
      if (visible) createHEdgeGlyph(he, visible);
    }
  }
}
