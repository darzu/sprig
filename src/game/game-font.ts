import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { AlphaDef, ColorDef, TintsDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { vec3, quat, mat4, vec2 } from "../gl-matrix.js";
import {
  extrudeQuad,
  HEdge,
  HPoly,
  HVert,
  meshToHalfEdgePoly,
} from "../half-edge.js";
import { onInit } from "../init.js";
import { InputsDef, MouseDragDef } from "../inputs.js";
import { mathMap } from "../math.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import {
  cloneMesh,
  getAABBFromMesh,
  Mesh,
  RawMesh,
  scaleMesh,
  scaleMesh3,
  transformMesh,
} from "../render/mesh.js";
import { ALPHA_MASK } from "../render/pipeline-masks.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import { tempMat4, tempVec2, tempVec3 } from "../temp-pool.js";
import { assert } from "../util.js";
import {
  randNormalPosVec3,
  randNormalVec3,
  vec3Dbg,
  vec3Mid,
} from "../utils-3d.js";
import { screenPosToWorldPos } from "../utils-game.js";
import { AssetsDef, BLACK, makePlaneMesh } from "./assets.js";
import { createGhost, gameplaySystems } from "./game.js";

// TODO(@darzu): 2D editor!

const DBG_3D = false; // TODO(@darzu): add in-game smooth transition!

const PANEL_W = 4 * 12;
const PANEL_H = 3 * 12;

export async function initFontEditor(em: EntityManager) {
  console.log(`panel ${PANEL_W}x${PANEL_H}`);

  initCamera();

  const res = await em.whenResources(AssetsDef, RendererDef);

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
}

async function initCamera() {
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
    quad: [
      [0, 3, 4, 1],
      [3, 5, 6, 4],
    ],
    tri: [
      [2, 3, 0],
      [5, 3, 2],
    ],
    pos: [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 1],
      [0, 0, 1],
      [1, 0, 1],
      [0, 0, 2],
      [1, 0, 2],
    ],
    colors: [
      randNormalPosVec3(),
      randNormalPosVec3(),
      randNormalPosVec3(),
      randNormalPosVec3(),
    ],
    surfaceIds: [1, 2, 3, 4],
    usesProvoking: true,
  };
  scaleMesh(hpMesh, 4);

  const hp = meshToHalfEdgePoly(hpMesh);
  // console.dir(hp);

  // {
  //   const outerHes = hp.edges.filter((h) => !h.face)!;
  //   const newHes = outerHes.map((he) => extrudeQuad(hp, he));
  //   newHes.forEach((he, i) => {
  //     // vec3.set(mesh.colors[he.fi], 0.6, 0.05, 0.05);
  //     randNormalVec3(mesh.colors[he.fi]);
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
    [PhysicsResultsDef, MouseDragDef, CameraViewDef, RendererDef],
    (_, { physicsResults, mousedrag, cameraView, renderer }) => {
      let didUpdateMesh = false;

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
          for (let g of selectedGlyphs) {
            if (g.hglyph.kind === "vert") {
              hpEditor.moveVert(g.hglyph.hv, worldDrag);
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
      } else {
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
          ]);
          if (g) {
            vec3.copy(g.color, ENDESGA16.red);
            cursorGlpyh = g;
            break;
          }
        }
      }

      // update glyph colors based on state
      for (let g of [...hpEditor.vertGlpyhs, ...hpEditor.hedgeGlyphs])
        vec3.copy(g.color, ENDESGA16.lightBlue);
      for (let g of hoverGlyphs) vec3.copy(g.color, ENDESGA16.yellow);
      for (let g of selectedGlyphs) vec3.copy(g.color, ENDESGA16.lightGreen);
      if (cursorGlpyh) vec3.copy(cursorGlpyh.color, ENDESGA16.red);

      // update mesh
      if (didUpdateMesh)
        renderer.renderer.stdPool.updateMeshVertices(
          hpEditor.hpEnt.renderable.meshHandle,
          hpEditor.hpEnt.renderable.meshHandle.readonlyMesh! // TODO(@darzu): hack
        );
    },
    "editHPoly"
  );
  gameplaySystems.push("editHPoly");

  /* TODO(@darzu): 
    [x] render widget for each: vertex, half-edge
    [ ] drag select vertices
    [ ] drag move vertices
    [ ] click extrude half-edge
    [ ] click to collapse hedge
  */
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
type HGlyph = HEdgeGlyph | HVertGlyph;
const HGlyphDef = EM.defineComponent("hglyph", (g: HGlyph) => g);

type Glyph = EntityW<
  [typeof HGlyphDef, typeof ColorDef, typeof PositionDef, typeof RotationDef]
>;

type HEditor = ReturnType<typeof createHalfEdgeEditor>;
async function createHalfEdgeEditor(hp: HPoly) {
  // TODO(@darzu):
  // editor operations: verts in area
  // editor operations: hedges in area
  // mapping between vert and vert glpyhs

  const { assets } = await EM.whenResources(AssetsDef);
  // vert glyphs
  let vertGlpyhs: Glyph[] = [];
  for (let v of hp.verts) {
    const pos = vec3.clone(hp.mesh.pos[v.vi]);
    pos[1] = 0.2;
    const glyph = EM.newEntity();
    EM.ensureComponentOn(glyph, RenderableConstructDef, assets.he_octo.proto);
    EM.ensureComponentOn(glyph, ColorDef);
    // EM.ensureComponentOn(glyph, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph, PositionDef, pos);
    EM.ensureComponentOn(glyph, RotationDef, quat.create());
    EM.ensureComponentOn(glyph, HGlyphDef, {
      kind: "vert",
      hv: v,
      // state: "none",
    });
    EM.ensureComponentOn(glyph, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_octo.aabb,
    });
    vertGlpyhs.push(glyph);
  }

  // half-edge glyphs
  // console.dir(assets.he_quad.mesh);
  // console.dir(assets.he_quad.aabb);
  // console.dir(assets.he_octo.mesh);
  // console.dir(assets.he_octo.aabb);
  let hedgeGlyphs: Glyph[] = [];
  for (let he of hp.edges) {
    // TODO(@darzu): pos and rot
    const visible = !he.face;
    if (!visible) continue;
    const pos0 = hp.mesh.pos[he.orig.vi];
    const pos1 = hp.mesh.pos[he.twin.orig.vi];
    const diff = vec3.sub(tempVec3(), pos1, pos0);
    const theta = Math.atan2(diff[0], diff[2]) + Math.PI * 0.5;
    const rot = quat.fromEuler(quat.create(), 0, theta, 0);
    // const rot = quat.create();
    const pos = vec3Mid(vec3.create(), pos0, pos1);
    pos[1] = 0.2;
    const glyph = EM.newEntity();
    EM.ensureComponentOn(
      glyph,
      RenderableConstructDef,
      assets.he_quad.proto,
      visible
    );
    EM.ensureComponentOn(glyph, ColorDef);
    // EM.ensureComponentOn(vert, AlphaDef, 0.9);
    EM.ensureComponentOn(glyph, PositionDef, pos);
    EM.ensureComponentOn(glyph, RotationDef, rot);
    EM.ensureComponentOn(glyph, HGlyphDef, {
      kind: "hedge",
      he: he,
      // state: "none",
    });
    EM.ensureComponentOn(glyph, ColliderDef, {
      shape: "AABB",
      solid: false,
      aabb: assets.he_quad.aabb,
    });
    hedgeGlyphs.push(glyph);
  }

  const ent0 = EM.newEntity();
  EM.ensureComponentOn(ent0, RenderableConstructDef, hp.mesh as Mesh); // TODO(@darzu): hacky cast
  EM.ensureComponentOn(ent0, PositionDef, [0, 0.1, 0]);
  const ent1 = await EM.whenEntityHas(ent0, RenderableDef);

  return {
    hp,
    hpEnt: ent1,
    vertGlpyhs,
    hedgeGlyphs,
    moveVert,
  };

  function moveVert(v: HVert, delta: vec3) {
    const pos = hp.mesh.pos[v.vi];
    vec3.add(pos, pos, delta);
    const glyph = vertGlpyhs[v.vi];
    assert(glyph && glyph.hglyph.kind === "vert" && glyph.hglyph.hv === v);
    glyph.position[0] = pos[0];
    glyph.position[2] = pos[2];
  }
}
