import {
  CameraComputedDef,
  CameraDef,
  CameraFollowDef,
} from "../camera/camera.js";
import { CanvasDef, HasFirstInteractionDef } from "../render/canvas.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V, mat4 } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ColliderDef, ColliderFromMeshDef } from "../physics/collider.js";
import {
  PhysicsResultsDef,
  PhysicsStateDef,
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
  iterateWoodSegmentQuadIndices,
  resetWoodState,
  SegState,
  WoodStateDef,
} from "./wood-builder.js";
import { WoodHealthDef } from "./wood-health.js";
import { createWoodHealth } from "./wood-health.js";
import { resetWoodHealth } from "./wood-health.js";
import { BallMesh, CubeMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { breakBullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { GhostDef } from "../debug/ghost.js";
import { createLD53Ship } from "./shipyard.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { startPirates } from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { addGizmoChild } from "../utils/utils-game.js";
import { Phase } from "../ecs/sys-phase.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { PId4, assert, mkLazy } from "../utils/util-no-import.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { pointPipe, linePipe } from "../render/pipelines/std-line.js";
import { createObj } from "../ecs/em-objects.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import {
  sketchAABB,
  sketchDot,
  sketchLine,
  sketchLine2,
  sketchRay,
} from "../utils/sketch.js";
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
  createMeshUpdateTracker,
  getOBBFromWoodSeg,
  woodVsAABB,
} from "./wood-damage.js";
import { OBB } from "../physics/obb.js";
import {
  ZERO_AABB,
  cloneAABB,
  createAABB,
  transformAABB,
} from "../physics/aabb.js";

const DBG_PLAYER = false;
const DBG_COLLIDERS = false;
const DBG_TRANSPARENT_BOAT = false;

const DISABLE_PRIATES = true;

async function initDemoPanCamera() {
  const g = EM.mk();
  EM.set(g, CameraFollowDef, 1);
  V3.set(0, -50, 0, g.cameraFollow.positionOffset);
  g.cameraFollow.yawOffset = -1.308;
  g.cameraFollow.pitchOffset = -0.478;

  // TODO(@darzu): wish we didn't need these
  EM.set(g, PositionDef);
  EM.set(g, RotationDef);
  EM.set(g, RenderableConstructDef, CubeMesh, false);

  const turnSpeed = 0.0003;
  const zoomSpeed = 0.1;

  const { htmlCanvas } = await EM.whenResources(CanvasDef);
  htmlCanvas.shouldLockMouseOnClick = false;
  htmlCanvas.unlockMouse();

  EM.addSystem(
    "demoPanCamera",
    Phase.GAME_PLAYERS,
    null,
    [InputsDef, CanvasDef, TimeDef],
    (_, { inputs, htmlCanvas, time }) => {
      if (inputs.ldown) {
        g.cameraFollow.yawOffset += inputs.mouseMov[0] * turnSpeed * time.dt;
        g.cameraFollow.pitchOffset += -inputs.mouseMov[1] * turnSpeed * time.dt;
      }
      g.cameraFollow.positionOffset[1] +=
        -inputs.mouseWheel * zoomSpeed * time.dt;
      g.cameraFollow.positionOffset[1] = clamp(
        g.cameraFollow.positionOffset[1],
        -200,
        -5
      );
    }
  );
}

export async function initShipyardGame() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

  const res = await EM.whenResources(RendererDef, CameraDef, MeDef);

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

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * res.camera.viewDist, 2 * res.camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  // camera
  if (!DBG_PLAYER) initDemoPanCamera();

  const sun = createSun([250, 10, 300]);

  // const ground = EM.mk();
  // EM.set(ground, RenderableConstructDef, HexMesh);
  // EM.set(ground, ScaleDef, [20, 20, 2]);
  // EM.set(ground, ColorDef, ENDESGA16.blue);
  // EM.set(ground, PositionDef, V(0, 0, -4));

  // TIMBER
  const woodEnt = EM.mk();

  if (DBG_TRANSPARENT_BOAT) EM.set(woodEnt, AlphaDef, 0.5);

  const woodObj = createLD53Ship();
  // const woodObj = createWoodenBox();
  // const woodObj = await loadFangShip();

  // console.log(woodObj.state.groups.map((g) => g.name));
  // rainbowColorWood(woodObj);

  const { state: timberState, mesh: timberMesh } = woodObj;

  // console.log("timberMesh");
  // console.dir(timberMesh);

  // timberMesh.colors.forEach((c, i) =>
  //   V3.copy(c, AllEndesga16[i % AllEndesga16.length])
  // );

  const DBG_WOOD_STATE = false;
  if (DBG_WOOD_STATE) {
    let _bIdx = 0;
    let _sIdx = 0;
    for (let g of timberState.groups) {
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

  EM.set(woodEnt, RenderableConstructDef, timberMesh);
  EM.set(woodEnt, WoodStateDef, timberState);
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

  const timberHealth = createWoodHealth(timberState);
  EM.set(woodEnt, WoodHealthDef, timberHealth);

  addGizmoChild(woodEnt, 10);

  if (DBG_PLAYER) {
    EM.addSystem(
      "ld51Ghost",
      Phase.GAME_WORLD,
      [GhostDef, WorldFrameDef, ColliderDef],
      [InputsDef, HasFirstInteractionDef],
      async (ps, { inputs }) => {
        if (!ps.length) return;

        const ghost = ps[0];

        // dbg aiming
        {
          sketchLine2(
            {
              ray: {
                org: ghost.world.position,
                dir: quat.fwd(ghost.world.rotation),
              },
              len: 50,
            },
            {
              key: `ghostAim`,
              color: ENDESGA16.white,
            }
          );
        }

        if (inputs.lclick) {
          // console.log(`fire!`);
          const firePos = ghost.world.position;
          const fireDir = quat.mk();
          quat.copy(fireDir, ghost.world.rotation);
          quat.pitch(fireDir, PId4);
          const ballHealth = 2.0;
          fireBullet(
            1,
            firePos,
            fireDir,
            0.05 * 2,
            0.02,
            3 * 0.00001,
            ballHealth,
            V3.FWD
          );
        }

        if (inputs.keyClicks["r"]) {
          const timber2 = await EM.whenEntityHas(woodEnt, RenderableDef);
          resetWoodHealth(woodEnt.woodHealth);
          resetWoodState(woodEnt.woodState);
          res.renderer.renderer.stdPool.updateMeshQuadInds(
            timber2.renderable.meshHandle,
            woodEnt.woodState.mesh as Mesh,
            0,
            woodEnt.woodState.mesh.quad.length
          );
        }

        assert(ghost.collider.shape === "AABB");
        if (PhysicsStateDef.isOn(ghost)) {
          sketchAABB(ghost._phys.colliders[0].aabb, {
            key: "ghostAABB",
          });
        }
      }
    );

    // TODO(@darzu): breakBullet
    EM.addSystem(
      "breakBullets",
      Phase.GAME_WORLD,
      [
        BulletDef,
        ColorDef,
        WorldFrameDef,
        // LinearVelocityDef
        ParametricDef,
      ],
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
          V3.set(0, -100, 0, e.position);
          e.renderable.hidden = true;

          e.dead.processed = true;
        }
      }
    );

    const g = initGhost(BallMesh);

    V3.copy(g.cameraFollow.positionOffset, [0.0, -15.0, 0.0]);

    EM.set(g, ColorDef, ENDESGA16.darkGreen);
    EM.set(g, ColliderFromMeshDef, false);

    addGizmoChild(g, 3);
  }

  const tempOBB = OBB.mk();

  const { renderable: woodRenderable } = await EM.whenEntityHas(
    woodEnt,
    RenderableDef
  );

  let _maxSketchAABB = 0;

  EM.addSystem(
    "selectWoodParts",
    Phase.GAME_WORLD,
    null,
    [InputsDef, MouseRayDef, PhysicsResultsDef, CameraComputedDef],
    (_, res) => {
      let meshTracker = mkLazy(() =>
        createMeshUpdateTracker(woodRenderable.meshHandle)
      );
      let hasChange = false;

      let _sketchAABBNum = 0;

      function woodColorSegment(seg: SegState, color: V3.InputT) {
        hasChange = true;
        for (let qi of iterateWoodSegmentQuadIndices(seg)) {
          V3.copy(woodObj.mesh.colors[qi], color);
          meshTracker().trackQuadDataChange(qi);
        }
      }

      // const ship: WoodObj;
      if (res.inputs.lclick || true) {
        sketchRay(res.mouseRay, {
          key: "mouseRay",
          length: 20,
          color: ENDESGA16.orange,
        });
        // sketchDot(res.cameraComputed.location);

        const woodFromWorld = mat4.invert(woodEnt.world.transform);
        const woodLocalRay = transformRay(
          cloneRay(res.mouseRay),
          woodFromWorld
        );

        let minDist = +Infinity;
        let minSeg: SegState | undefined = undefined;
        const hitItr = woodVsAABB(woodObj.state, (localAABB) => {
          const dist = rayVsAABBHitDist(localAABB, woodLocalRay);
          const isHit = !!dist && dist < minDist;
          if (isHit) {
            // const worldAABB =transformAABB(cloneAABB(localAABB), woodEnt.world.transform)
            sketchAABB(localAABB, {
              key: `hitAABB_${++_sketchAABBNum}`,
              color: ENDESGA16.yellow,
            });
          }
          return isHit;
        });
        for (let [_, __, ___, seg] of hitItr) {
          woodColorSegment(seg, ENDESGA16.orange);

          const localOBB = getOBBFromWoodSeg(seg, tempOBB);
          const hitDist = rayVsOBBHitDist(localOBB, woodLocalRay);
          if (!Number.isNaN(hitDist) && hitDist > 0) {
            if (hitDist < minDist) {
              minDist = hitDist;
              minSeg = seg;
            }
            woodColorSegment(seg, ENDESGA16.yellow);
            sketchAABB(seg.localAABB, {
              key: `hitAABB_${_sketchAABBNum}`,
              color: ENDESGA16.darkGreen,
            });
          }

          // if (rayVsCapsule(woodLocalRay, hit.seg)) {
          // }
        }
        if (minSeg) woodColorSegment(minSeg, ENDESGA16.lightGreen);
      }

      if (hasChange) {
        meshTracker().submitChangesToGPU();
      }

      _maxSketchAABB = Math.max(_sketchAABBNum, _maxSketchAABB);
      for (let i = _sketchAABBNum; _sketchAABBNum < _maxSketchAABB; i++) {
        // TODO(@darzu): Hide sketch function??
        sketchAABB(ZERO_AABB, {
          key: `hitAABB_${++_sketchAABBNum}`,
        });
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
}
