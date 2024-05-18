import { CameraDef } from "../camera/camera.js";
import { HasFirstInteractionDef } from "../render/canvas.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { DeadDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import {
  ColliderDef,
  ColliderFromMeshDef,
  MultiCollider,
} from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
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
  createWoodHealth,
  resetWoodHealth,
  resetWoodState,
  WoodHealthDef,
  WoodStateDef,
} from "./wood.js";
import { BallMesh, HexMesh } from "../meshes/mesh-list.js";
import { breakBullet, BulletDef, fireBullet } from "../cannons/bullet.js";
import { GhostDef } from "../debug/ghost.js";
import { createLD53Ship, createWoodenBox, ld53ShipAABBs } from "./shipyard.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { startPirates } from "./pirate.js";
import { ParametricDef } from "../motion/parametric-motion.js";
import { addColliderDbgVis, addGizmoChild } from "../utils/utils-game.js";
import { Phase } from "../ecs/sys-phase.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { PId4 } from "../utils/util-no-import.js";

const DBG_PLAYER = true;
const DBG_COLLIDERS = false;

const DISABLE_PRIATES = true;

export async function initShipyardGame() {
  const res = await EM.whenResources(RendererDef, CameraDef, MeDef);

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdMeshPipe,
    outlineRender,
    deferredPipeline,
    postProcess,
  ];

  const sun = createSun([250, 10, 300]);

  const ground = EM.mk();
  EM.set(ground, RenderableConstructDef, HexMesh);
  EM.set(ground, ScaleDef, [20, 20, 2]);
  EM.set(ground, ColorDef, ENDESGA16.blue);
  EM.set(ground, PositionDef, V(0, 0, -4));

  // TIMBER
  const timber = EM.mk();

  // const { state: timberState, mesh: timberMesh } = createLD53Ship();
  const { state: timberState, mesh: timberMesh } = createWoodenBox();

  EM.set(timber, RenderableConstructDef, timberMesh);
  EM.set(timber, WoodStateDef, timberState);
  EM.set(timber, AuthorityDef, res.me.pid);
  EM.set(timber, PositionDef, V(0, 0, 20));
  EM.set(timber, RotationDef);
  EM.set(timber, WorldFrameDef);

  const mc: MultiCollider = {
    shape: "Multi",
    solid: true,
    // TODO(@darzu): integrate these in the assets pipeline
    children: ld53ShipAABBs.map((aabb) => ({
      shape: "AABB",
      solid: true,
      aabb,
    })),
  };
  EM.set(timber, ColliderDef, mc);
  const timberHealth = createWoodHealth(timberState);
  EM.set(timber, WoodHealthDef, timberHealth);

  if (DBG_COLLIDERS) addColliderDbgVis(timber);

  addGizmoChild(timber, 10);

  EM.addSystem(
    "ld51Ghost",
    Phase.GAME_WORLD,
    [GhostDef, WorldFrameDef, ColliderDef],
    [InputsDef, HasFirstInteractionDef],
    async (ps, { inputs }) => {
      if (!ps.length) return;

      const ghost = ps[0];

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
