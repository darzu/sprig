import { CameraDef } from "../camera/camera.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import {
  AllEndesga16,
  ENDESGA16,
  RainbowEndesga16,
} from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import {
  ColliderDef,
  ColliderFromMeshDef,
  MultiCollider,
} from "../physics/collider.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
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
import { resetWoodState, WoodStateDef } from "./wood-builder.js";
import { WoodHealthDef } from "./wood-health.js";
import { createWoodHealth } from "./wood-health.js";
import { resetWoodHealth } from "./wood-health.js";
import { BallMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { breakBullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { GhostDef } from "../debug/ghost.js";
import {
  createLD53Ship,
  createWoodenBox,
  ld53ShipAABBs,
  loadFangShip,
  rainbowColorWood,
} from "./shipyard.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { startPirates } from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { addColliderDbgVis, addGizmoChild } from "../utils/utils-game.js";
import { Phase } from "../ecs/sys-phase.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { PId4, assert } from "../utils/util-no-import.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { pointPipe, linePipe } from "../render/pipelines/std-line.js";
import { createObj } from "../ecs/em-objects.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import {
  sketch,
  sketchAABB,
  sketchLine,
  sketchLine2,
} from "../utils/sketch.js";
import { renderDots } from "../render/pipelines/std-dots.js";
import { alphaRenderPipeline } from "../render/pipelines/xp-alpha.js";
import { getLineEnd } from "../physics/broadphase.js";

const DBG_PLAYER = true;
const DBG_COLLIDERS = false;
const DBG_TRANSPARENT_BOAT = false;

const DISABLE_PRIATES = true;

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

  const sun = createSun([250, 10, 300]);

  const ground = EM.mk();
  EM.set(ground, RenderableConstructDef, HexMesh);
  EM.set(ground, ScaleDef, [20, 20, 2]);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -4));

  // TIMBER
  const timber = EM.mk();

  if (DBG_TRANSPARENT_BOAT) EM.set(timber, AlphaDef, 0.5);

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

  EM.set(timber, RenderableConstructDef, timberMesh);
  EM.set(timber, WoodStateDef, timberState);
  EM.set(timber, AuthorityDef, res.me.pid);
  EM.set(timber, PositionDef, V(0, 0, 0));
  EM.set(timber, RotationDef);
  EM.set(timber, WorldFrameDef);

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

  EM.set(timber, ColliderFromMeshDef);

  const timberHealth = createWoodHealth(timberState);
  EM.set(timber, WoodHealthDef, timberHealth);

  addGizmoChild(timber, 10);

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
        const timber2 = await EM.whenEntityHas(timber, RenderableDef);
        resetWoodHealth(timber.woodHealth);
        resetWoodState(timber.woodState);
        res.renderer.renderer.stdPool.updateMeshQuadInds(
          timber2.renderable.meshHandle,
          timber.woodState.mesh as Mesh,
          0,
          timber.woodState.mesh.quad.length
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
  if (DBG_PLAYER)
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
  {
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

    if (DBG_PLAYER) {
      const g = initGhost(BallMesh);

      V3.copy(g.cameraFollow.positionOffset, [0.0, -15.0, 0.0]);

      EM.set(g, ColorDef, ENDESGA16.darkGreen);
      EM.set(g, ColliderFromMeshDef, false);

      addGizmoChild(g, 3);
    }
  }

  if (!DISABLE_PRIATES) startPirates();
}
