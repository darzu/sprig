import {
  CameraComputedDef,
  CameraDef,
  CameraFollowDef,
} from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import {
  AllEndesga16,
  AllEndesga16Names,
  ENDESGA16,
  Endesga16Idx,
  Endesga16Name,
} from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V, mat4 } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ColliderFromMeshDef } from "../physics/collider.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { Mesh } from "../meshes/mesh.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import {
  RendererDef,
  RenderableConstructDef,
  RenderableDef,
} from "../render/renderer-ecs.js";
import {
  _quadsPerSplinter,
  _trisPerSplinter,
  iterateWoodSegmentQuadIndices,
  resetWoodState,
  SegIndex,
  SegState,
  WoodStateDef,
} from "./wood-builder.js";
import { WoodHealthDef } from "./wood-health.js";
import { createWoodHealth } from "./wood-health.js";
import { resetWoodHealth } from "./wood-health.js";
import { CannonLD51Mesh, CubeMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { breakBullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { createLD53Ship } from "./shipyard.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { startPirates } from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { Phase } from "../ecs/sys-phase.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import {
  createSun,
  initDemoPanCamera,
  initStdGrid,
} from "../graybox/graybox-helpers.js";
import { PId4, PId8, assert, mkLazy } from "../utils/util-no-import.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { pointPipe, linePipe } from "../render/pipelines/std-line.js";
import { createObj } from "../ecs/em-objects.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { SketcherDef, sketchAABB, sketchLine } from "../utils/sketch.js";
import { renderDots } from "../render/pipelines/std-dots.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import {
  getLineEnd,
  transformRay,
  cloneRay,
  rayVsAABBHitDist,
  rayVsOBBHitDist,
} from "../physics/broadphase.js";
import { TimeDef } from "../time/time.js";
import { clamp } from "../utils/math.js";
import { MouseRayDef } from "../input/screen-input.js";
import {
  WoodHit,
  createMeshUpdateTracker,
  getOBBFromWoodSeg,
  woodVsAABB,
} from "./wood-damage.js";
import { OBB } from "../physics/obb.js";
import { getFireSolution } from "../stone/projectile.js";
import { IdPair, idPair, packI16s, toMap, unpackI16s } from "../utils/util.js";
import { createHtmlBuilder } from "../web/html-builder.js";
import { transformAABB, cloneAABB, ZERO_AABB } from "../physics/aabb.js";

const DBG_COLLIDERS = false;
const DBG_TRANSPARENT_BOAT = false;

const DISABLE_PRIATES = true;

enum ShipyardClickMode {
  None,
  Cannon,
  Paint,
}

const shipyardGameState = {
  mode: ShipyardClickMode.Cannon,
  paintColor: "blue" as Endesga16Name,
  showColliders: false,
};

export async function initShipyardGame() {
  // grid
  initStdGrid();

  const res = await EM.whenResources(
    RendererDef,
    CameraDef,
    MeDef,
    SketcherDef
  );
  const { sketcher } = res;

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdMeshPipe,
    renderDots,
    alphaRenderPipeline,
    outlineRender,
    deferredPipeline,

    pointPipe,
    linePipe,

    stdGridRender,

    postProcess,
  ];

  // camera
  initDemoPanCamera();

  const sun = createSun([250, 10, 300]);

  // TIMBER
  const woodEnt = EM.mk();

  if (DBG_TRANSPARENT_BOAT) EM.set(woodEnt, AlphaDef, 0.5);

  const woodObj = createLD53Ship();
  // const woodObj = createWoodenBox();
  // const woodObj = await loadFangShip();

  // console.log(woodObj.state.groups.map((g) => g.name));
  // rainbowColorWood(woodObj);

  const { state: woodState, mesh: woodMesh } = woodObj;

  // console.log("timberMesh");
  // console.dir(timberMesh);

  // timberMesh.colors.forEach((c, i) =>
  //   V3.copy(c, AllEndesga16[i % AllEndesga16.length])
  // );

  const DBG_WOOD_STATE = false;
  if (DBG_WOOD_STATE) {
    let _bIdx = 0;
    let _sIdx = 0;
    for (let g of woodState.groups) {
      for (let b of g.boards) {
        _bIdx++;
        sketchAABB(b.localAABB, {
          key: `boardAABB_${_bIdx}`,
          color: ENDESGA16.lightBlue,
        });
        for (let s of b.segments) {
          _sIdx++;
          if (_sIdx % 2 === 0) {
            sketchAABB(s.localAABB, {
              key: `segAABB_${_sIdx}`,
              color: ENDESGA16.lightGreen,
            });
            const end = getLineEnd(V3.tmp(), s.midLine);
            sketchLine(s.midLine.ray.org, end, {
              key: `segLine_${_sIdx}`,
              color: ENDESGA16.orange,
            });
          }
        }
      }
    }
  }

  EM.set(woodEnt, RenderableConstructDef, woodMesh);
  EM.set(woodEnt, WoodStateDef, woodState);
  EM.set(woodEnt, AuthorityDef, res.me.pid);
  EM.set(woodEnt, PositionDef, V(0, 0, 0));
  EM.set(woodEnt, RotationDef);
  EM.set(woodEnt, WorldFrameDef);

  // const mc: MultiCollider = {
  //   shape: "Multi",
  //   solid: true,
  //   // TODO(@darzu): integrate these in the assets pipeline
  //   children: ld53ShipAABBs.map((aabb) => ({
  //     shape: "AABB",
  //     solid: true,
  //     aabb,
  //   })),
  // };
  // EM.set(timber, ColliderDef, mc);
  // if (DBG_COLLIDERS) addColliderDbgVis(timber);

  EM.set(woodEnt, ColliderFromMeshDef);

  const woodHealth = createWoodHealth(woodState);
  EM.set(woodEnt, WoodHealthDef, woodHealth);

  // addGizmoChild(woodEnt, 10);

  // cannon
  const cannon = createObj(
    [PositionDef, RenderableConstructDef, ColorDef, RotationDef] as const,
    {
      position: V(30, -50, 0),
      renderableConstruct: [CannonLD51Mesh],
      color: ENDESGA16.lightGray,
      rotation: quat.fromYawPitchRoll(-PId4, PId8),
      // rotation: quat.fromYawPitchRoll(),
    }
  );

  EM.addSystem(
    "breakBullets",
    Phase.GAME_WORLD,
    [BulletDef, ColorDef, WorldFrameDef, ParametricDef],
    [],
    (es, res) => {
      for (let b of es) {
        if (b.bullet.health <= 0) {
          breakBullet(b);
        }
      }
    }
  );

  // Create player
  // dead bullet maintenance
  // NOTE: this must be called after any system that can create dead bullets but
  //   before the rendering systems.
  EM.addSystem(
    "deadBullets",
    Phase.GAME_WORLD,
    [BulletDef, PositionDef, DeadDef, RenderableDef],
    [],
    (es, _) => {
      for (let e of es) {
        if (e.dead.processed) continue;

        e.bullet.health = 10;
        V3.set(0, 0, -100, e.position);
        e.renderable.hidden = true;

        e.dead.processed = true;
      }
    }
  );

  const tempOBB = OBB.mk();

  const { renderable: woodRenderable } = await EM.whenEntityHas(
    woodEnt,
    RenderableDef
  );

  let _maxSketchAABB = 0;

  // TODO(@darzu): This is all pretty hacky. I guess I want some sort of arena for hover sketches that is cleared.
  let _hoverTmpOBB = OBB.mk();
  let _lastHoverByBoardSegIdx = new Map<number, boolean>();
  function hoverSegments(color: V3.InputT, ...segs: SegIndex[]) {
    for (let [gIdx, bIdx, sIdx] of segs) {
      const pair = packI16s(bIdx, sIdx);
      _lastHoverByBoardSegIdx.set(pair, true);
      const seg = woodObj.state.groups[gIdx].boards[bIdx].segments[sIdx];
      const obb = getOBBFromWoodSeg(seg, _hoverTmpOBB);
      V3.add(obb.halfw, [0.2, 0.2, 0.2], obb.halfw);
      sketcher.sketch({
        shape: "obb",
        obb,
        key: `hoverWoodSeg_${pair}`,
        color,
      });
    }
  }
  function unhoverAllSegments() {
    for (let [pair, wasHovering] of _lastHoverByBoardSegIdx.entries()) {
      if (wasHovering) {
        sketcher.sketch({
          shape: "obb",
          obb: OBB.ZERO,
          key: `hoverWoodSeg_${pair}`,
        });
        _lastHoverByBoardSegIdx.set(pair, false);
      }
    }
  }

  EM.addSystem(
    "selectWoodParts",
    Phase.GAME_WORLD,
    null,
    [InputsDef, MouseRayDef, PhysicsResultsDef, CameraComputedDef, TimeDef],
    (_, res) => {
      let meshTracker = mkLazy(() =>
        createMeshUpdateTracker(woodRenderable.meshHandle)
      );
      let hasChange = false;

      let doFire =
        shipyardGameState.mode === ShipyardClickMode.Cannon &&
        (res.inputs.lclick || (res.inputs.ldown && res.time.step % 30 === 0));
      let doPaint =
        shipyardGameState.mode === ShipyardClickMode.Paint && res.inputs.lclick;

      let _sketchAABBNum = 0;

      function woodColorSegment(
        [gIdx, bIdx, sIdx]: SegIndex,
        color: V3.InputT
      ) {
        const health = woodHealth.groups[gIdx].boards[bIdx][sIdx];
        const seg = woodObj.state.groups[gIdx].boards[bIdx].segments[sIdx];

        hasChange = true;
        for (let qi of iterateWoodSegmentQuadIndices(seg)) {
          V3.copy(woodObj.mesh.colors[qi], color);
          meshTracker().trackQuadDataChange(qi);
        }

        // color the splinters
        for (let spIdx of [health.splinterBotIdx, health.splinterTopIdx]) {
          if (!spIdx) continue;
          assert(woodObj.state.splinterState);
          const quadIdx =
            woodObj.state.splinterState.quadOffset + spIdx * _quadsPerSplinter;
          for (let qi = quadIdx; qi < quadIdx + _quadsPerSplinter; qi++) {
            V3.copy(woodObj.mesh.colors[qi], color);
            meshTracker().trackQuadDataChange(qi);
          }
          const triIdx =
            woodObj.state.splinterState.triOffset + spIdx * _trisPerSplinter;
          for (let ti = triIdx; ti < triIdx + _trisPerSplinter; ti++) {
            V3.copy(woodObj.mesh.colors[woodObj.mesh.quad.length + ti], color);
            meshTracker().trackTriDataChange(ti);
          }
        }
      }

      unhoverAllSegments();

      // if (res.inputs.lclick)
      {
        // sketchRay(res.mouseRay, {
        //   key: "mouseRay",
        //   length: 20,
        //   color: ENDESGA16.orange,
        // });
        // sketchDot(res.cameraComputed.location);

        const woodFromWorld = mat4.invert(woodEnt.world.transform);
        const woodLocalRay = transformRay(
          cloneRay(res.mouseRay),
          woodFromWorld
        );

        let minDist = +Infinity;
        let minHit: WoodHit | undefined = undefined;
        const hitItr = woodVsAABB(woodObj.state, (localAABB) => {
          const dist = rayVsAABBHitDist(localAABB, woodLocalRay);
          const isHit = !!dist && dist < minDist;
          if (isHit && shipyardGameState.showColliders) {
            const worldAABB = transformAABB(
              cloneAABB(localAABB),
              woodEnt.world.transform
            ); // unnecessary since ship is at 0,0,0
            sketchAABB(localAABB, {
              key: `hitAABB_${++_sketchAABBNum}`,
              color: ENDESGA16.yellow,
            });
          }
          return isHit;
        });
        for (let hit of hitItr) {
          const [groupIdx, boardIdx, segIdx, seg] = hit;
          // woodColorSegment(seg, ENDESGA16.orange);

          const health = woodHealth.groups[groupIdx].boards[boardIdx][segIdx];
          if (health.health <= 0) continue;

          const localOBB = getOBBFromWoodSeg(seg, tempOBB);
          const hitDist = rayVsOBBHitDist(localOBB, woodLocalRay);
          if (!Number.isNaN(hitDist) && hitDist > 0) {
            if (hitDist < minDist) {
              minDist = hitDist;
              minHit = hit;
            }
            // woodColorSegment(seg, ENDESGA16.yellow);
            if (shipyardGameState.showColliders) {
              sketchAABB(seg.localAABB, {
                key: `hitAABB_${_sketchAABBNum}`,
                color: ENDESGA16.darkGreen,
              });
            }
          }

          // if (rayVsCapsule(woodLocalRay, hit.seg)) {
          // }
        }

        if (minHit) {
          if (shipyardGameState.mode === ShipyardClickMode.Paint) {
            // paint mode
            const [gIdx, bIdx] = minHit;
            let toPaintSegIdxs: SegIndex[] = [];
            if (res.inputs.keyDowns["shift"]) {
              // TODO(@darzu): document shift key usage
              woodObj.state.groups[gIdx].boards.forEach((board, bIdx) => {
                board.segments.forEach((_, sIdx) => {
                  toPaintSegIdxs.push([gIdx, bIdx, sIdx] as SegIndex);
                });
              });
            } else {
              const board = woodObj.state.groups[gIdx].boards[bIdx];
              board.segments.forEach((_, sIdx) => {
                toPaintSegIdxs.push([gIdx, bIdx, sIdx] as SegIndex);
              });
            }
            const color = ENDESGA16[shipyardGameState.paintColor];
            hoverSegments(color, ...toPaintSegIdxs);

            if (doPaint) {
              for (let segIdx of toPaintSegIdxs)
                woodColorSegment(segIdx, color);
            }
          } else if (shipyardGameState.mode === ShipyardClickMode.Cannon) {
            // cannon mode
            hoverSegments(ENDESGA16.red, [minHit[0], minHit[1], minHit[2]]);

            // if (doFire) {
            //   woodColorSegment(minHit[3], ENDESGA16.darkRed);
            // }

            const aimOBB = getOBBFromWoodSeg(minHit[3], tempOBB);
            V3.zero(aimOBB.halfw);
            const gravity = 20 * 0.00001;
            const projectileSpeed = 0.2;
            const sln = getFireSolution({
              sourcePos: cannon.position,
              sourceDefaultRot: quat.IDENTITY,

              maxYaw: Infinity,
              minPitch: -Infinity,
              maxPitch: Infinity,
              maxRange: Infinity,

              gravity,

              projectileSpeed,

              targetOBB: aimOBB,
              targetVel: [0, 0, 0],

              doMiss: false,
            });
            assert(sln, `no firing solution?`);
            quat.fromYawPitchRoll(sln.yaw, sln.pitch, 0, cannon.rotation);
            const bulletHealth = 4.0;
            if (doFire) {
              fireBullet(
                1,
                cannon.position,
                cannon.rotation,
                projectileSpeed,
                0.02,
                gravity,
                bulletHealth,
                V3.FWD,
                shipyardGameState.showColliders
              );
            }
          }
        }

        _maxSketchAABB = Math.max(_sketchAABBNum, _maxSketchAABB);
        for (let i = _sketchAABBNum; _sketchAABBNum < _maxSketchAABB; i++) {
          // TODO(@darzu): Hide sketch function??
          sketchAABB(ZERO_AABB, {
            key: `hitAABB_${++_sketchAABBNum}`,
          });
        }
      }

      if (hasChange) {
        meshTracker().submitChangesToGPU();
      }

      // const mouseRay = getMouseRay(res.inputs.mousePos);
      // sketchRay(mouseRay);
      // const hit = getFirstRayIntersectWood(ship, ray);
      // if (hit) {
      //   woodHighlight(hit.group, ENDESGA16.darkGreen);
      //   woodHighlight(hit.b00oard, ENDESGA16.lightGreen);
      //   dbgPathWithGizmos(hit.board.path);
      // }
      // }
    }
  );

  if (!DISABLE_PRIATES) startPirates();

  // TODO(@darzu): REFACTOR. We should be generating the HTML and linking it more systematically.
  initShipyardHtml();
}

async function initShipyardHtml() {
  if (!document.getElementById("infoPanelsHolder")) {
    console.warn("no infoPanelsHolder");
    return;
  }

  const htmlBuilder = createHtmlBuilder();

  // about
  const aboutPanel = htmlBuilder.addInfoPanel("Shipyard");
  aboutPanel.addText(`
    The ship is defined with paths and constraints.
    These then procedurally generate a mesh and metadata (e.g. colliders), which support runtime modification.
  `);

  // controls
  const controlsPanel = htmlBuilder.addInfoPanel("Controls");
  controlsPanel.addHTML(`
    <ul>
      <li>Drag to pan</li>
      <li>Scroll to zoom</li>
      <li>Click to: <span id="clickModeString"></span></li>
    </ul>
  `);
  const clickModeStringEl = document.getElementById("clickModeString")!;

  // painting
  const paintPanel = htmlBuilder.addInfoPanel("Painting");

  const paintModeToggle = paintPanel.addToggleEditor({
    label: "Painting Mode",
    default: false,
    onChange: (v) => {
      const mode = v ? ShipyardClickMode.Paint : ShipyardClickMode.None;
      setClickMode(mode);
    },
  });

  const paletteEditor = paintPanel.addPaletteColorEditor({
    defaultIdx: Endesga16Idx.blue,
    onClick: (idx) => {
      if (!paletteEditor.isEnabled()) {
        setClickMode(ShipyardClickMode.Paint);
        shipyardGameState.paintColor = AllEndesga16Names[idx];
      }
    },
    onChange: (idx) => {
      shipyardGameState.paintColor = AllEndesga16Names[idx];
    },
  });
  paletteEditor.doEnable(false);

  // destruction
  const destPanel = htmlBuilder.addInfoPanel("Destruction");

  const cannonModeToggle = destPanel.addToggleEditor({
    label: "Cannon Mode",
    default: true,
    onChange: (v) => {
      const mode = v ? ShipyardClickMode.Cannon : ShipyardClickMode.None;
      setClickMode(mode);
    },
  });

  // view
  const viewPanel = htmlBuilder.addInfoPanel("View");

  const collidersToggle = viewPanel.addToggleEditor({
    label: "Show Colliders",
    default: shipyardGameState.showColliders,
    onChange: (v) => {
      shipyardGameState.showColliders = v;
    },
  });

  // click mode
  const clickToStringByMode: { [k in ShipyardClickMode]: string } = {
    [ShipyardClickMode.None]: "",
    [ShipyardClickMode.Cannon]: "fire a cannon at the cursor",
    [ShipyardClickMode.Paint]: "paint a board",
  };

  function setClickMode(mode: ShipyardClickMode) {
    shipyardGameState.mode = mode;
    cannonModeToggle.doEnable(mode === ShipyardClickMode.Cannon);
    paintModeToggle.doEnable(mode === ShipyardClickMode.Paint);
    paletteEditor.doEnable(mode === ShipyardClickMode.Paint);

    clickModeStringEl!.textContent = clickToStringByMode[mode];
  }

  setClickMode(ShipyardClickMode.Cannon);
}
