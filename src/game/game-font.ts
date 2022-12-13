import { CameraDef, CameraViewDef } from "../camera.js";
import { CanvasDef } from "../canvas.js";
import { AlphaDef, ColorDef } from "../color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { dbg } from "../debugger.js";
import { EM, EntityManager, EntityW } from "../entity-manager.js";
import { vec3, quat, mat4, vec2 } from "../gl-matrix.js";
import { ButtonDef, ButtonsStateDef, initButtonGUI } from "../gui/button.js";
import { initMeshEditor, MeshEditorDef } from "../gui/mesh-editor.js";
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
import { copyAABB, createAABB, Ray, rayVsRay } from "../physics/broadphase.js";
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
  RawMesh,
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
import { TextDef } from "./ui.js";

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

  const quadMesh: Mesh = {
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
  scaleMesh(quadMesh, 0.5);

  const quadGMesh = gameMeshFromMesh(quadMesh, res.renderer.renderer, {
    maxVertNum: 100,
    maxTriNum: 100,
    maxLineNum: 0,
  });

  // TODO(@darzu): HACK
  (dbg as any).exportPoly = () => {
    console.log(exportObj(quadMesh));
  };

  // TODO(@darzu): render buttons?
  const CHARS = `abcdefghijklmnopqrstuvwxyz.`.split("");
  const polyBank = new Map<number, GameMesh>();
  const btnKey = `letter`;

  for (let i = 0; i < CHARS.length; i++) {
    const c = CHARS[i];
    const letterKey = `letter-${c}`;
    const mesh = cloneMesh(quadGMesh.mesh);
    // const mesh = cloneMesh(res.buttonsState.gmesh.mesh);
    mesh.dbgName = letterKey;
    // console.dir(res.buttonsState.gmesh.mesh);
    // console.dir(mesh);
    const reserve: MeshReserve = {
      maxVertNum: 100,
      maxTriNum: 100,
      maxLineNum: mesh.lines?.length ?? 0,
    };
    const gmesh = gameMeshFromMesh(mesh, res.renderer.renderer, reserve);
    // TODO(@darzu): update gmesh after half-edge editor changes: aabb etc

    polyBank.set(i, gmesh);

    const btn = EM.newEntity();
    EM.ensureComponentOn(btn, RenderableConstructDef, gmesh.proto);
    EM.ensureComponentOn(btn, PositionDef, [-24 + i * 2, 0.1, 12]);
    EM.ensureComponentOn(btn, ButtonDef, btnKey, i, {
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

    // TODO(@darzu): NEED TO UPDATE MeshEditor based on letter button press
  }

  EM.registerSystem(
    null,
    [ButtonsStateDef, MeshEditorDef, TextDef],
    (_, res) => {
      const btnIdx = res.buttonsState.clickByKey[btnKey];
      if (btnIdx !== undefined) {
        const poly = polyBank.get(btnIdx);
        assert(poly);
        res.meshEditor.setMesh(poly.proto);
        res.text.upperText = CHARS[btnIdx];
        res.text.upperDiv.style.fontSize = "256px";
        res.text.upperDiv.style.top = "-64px";
        // res.text.upperDiv.style.color = "";
      }
    },
    `letterBtnClick`
  );
  gameplaySystems.push(`letterBtnClick`);

  // TODO(@darzu): HACKY. Cursor or 2d gui or something needs some better
  //    abstracting
  // EM.whenResources(ButtonsStateDef).then((res) => {
  res.buttonsState.cursorId = cursor.id;
  // });

  initMeshEditor(cursor.id);

  lineStuff();
}

// TODO(@darzu): can/should this be merged with half-edge stuff?
interface HLine {
  vi: number;
  next?: HLine;
  prev?: HLine;
}

function meshToHLines(m: RawMesh): HLine {
  assert(m.lines && m.lines.length);
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

// TODO(@darzu): rename
async function lineStuff() {
  const lnMesh: RawMesh = {
    pos: [
      [1, 0, 1],
      [2, 0, 2],
      [4, 0, 3],
      [8, 0, 3],
      [8, 0, 6],
    ],
    tri: [],
    quad: [],
    lines: [
      [0, 1],
      [3, 4],
      [2, 3],
      [1, 2],
    ],
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
    extMesh.quad.push([A1, pA1, pA2, A2]);
    extMesh.surfaceIds.push(i);
    extMesh.colors.push(randNormalPosVec3(vec3.create()));
  }

  const { renderer, assets } = await EM.whenResources(RendererDef, AssetsDef);

  const gmesh = gameMeshFromMesh(extMesh, renderer.renderer);

  const extEnt = EM.newEntity();
  EM.ensureComponentOn(extEnt, RenderableConstructDef, gmesh.proto);
  EM.ensureComponentOn(extEnt, PositionDef, [0, 0.5, 0]);

  for (let ln of lns) {
    const vertGlyph = EM.newEntity();
    EM.ensureComponentOn(vertGlyph, RenderableConstructDef, assets.cube.proto);
    EM.ensureComponentOn(vertGlyph, PositionDef, vec3.clone(lnMesh.pos[ln.vi]));
    EM.ensureComponentOn(vertGlyph, ColorDef, [0.1, 0.2 + ln.vi * 0.1, 0.1]);
    EM.ensureComponentOn(vertGlyph, ScaleDef, [0.2, 0.2, 0.2]);
    vertGlyph.position[1] = 0.5;
  }

  function getControlPoints(ln: HLine, width: number): [vec3, vec3] {
    const A = lnMesh.pos[ln.vi];

    if (!ln.next || !ln.prev) {
      // end cap
      const A1 = vec3.create();
      const A2 = vec3.create();

      const Oln = ln.next ?? ln.prev;
      const O = Oln ? lnMesh.pos[Oln.vi] : vec3.add(tempVec3(), A, [1, 0, 0]);
      const dir = vec3.sub(tempVec3(), O, A);
      if (!ln.next && ln.prev) vec3.negate(dir, dir);
      vec3.normalize(dir, dir);

      const perp = vec3.cross(tempVec3(), dir, [0, 1, 0]);

      // TODO(@darzu): this is right for end caps, not the mids!!
      vec3.sub(A1, A, vec3.scale(tempVec3(), perp, width));
      vec3.add(A2, A, vec3.scale(tempVec3(), perp, width));

      return [A1, A2];
    } else {
      // mid point
      const P = lnMesh.pos[ln.prev.vi];
      const PAdir = vec3.sub(tempVec3(), A, P);
      vec3.normalize(PAdir, PAdir);
      const PAperp = vec3.cross(tempVec3(), PAdir, [0, 1, 0]);
      const P1 = vec3.sub(tempVec3(), A, vec3.scale(tempVec3(), PAperp, width));
      vec3.sub(P1, P1, vec3.scale(tempVec3(), PAdir, width * 3));
      const P2 = vec3.add(tempVec3(), A, vec3.scale(tempVec3(), PAperp, width));
      vec3.sub(P2, P2, vec3.scale(tempVec3(), PAdir, width * 3));

      const N = lnMesh.pos[ln.next.vi];
      const NAdir = vec3.sub(tempVec3(), A, N);
      vec3.normalize(NAdir, NAdir);
      const NAperp = vec3.cross(tempVec3(), NAdir, [0, 1, 0]);
      const N1 = vec3.sub(tempVec3(), A, vec3.scale(tempVec3(), NAperp, width));
      vec3.sub(N1, N1, vec3.scale(tempVec3(), NAdir, width * 3));
      const N2 = vec3.add(tempVec3(), A, vec3.scale(tempVec3(), NAperp, width));
      vec3.sub(N2, N2, vec3.scale(tempVec3(), NAdir, width * 3));

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

  function linesAsList(acc: HLine[], curr?: HLine): HLine[] {
    if (!curr) return acc;
    if (!acc.length && curr.prev) return linesAsList(acc, curr.prev);
    acc.push(curr);
    return linesAsList(acc, curr.next);
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
