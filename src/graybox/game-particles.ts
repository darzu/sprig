import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/ecs.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, quat, V3 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { GravityDef } from "../motion/gravity.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MeDef } from "../net/components.js";
import {
  EmitterDef,
  ParticleDef,
  cloudBurstSys,
  fireTrailSys,
} from "../particle/particle.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { CanvasDef } from "../render/canvas.js";
import { PointLightDef } from "../render/lights.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import {
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import {
  pipeDbgInitParticles,
  pipeParticleUpdate,
  pipeParticleRender,
} from "../render/pipelines/std-particle.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { SketchTrailDef, sketch } from "../utils/sketch.js";
import { assert } from "../utils/util-no-import.js";
import { randDir3 } from "../utils/utils-3d.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import {
  createSun,
  initDemoPanCamera,
  initGhost,
  initStdGrid,
} from "./graybox-helpers.js";
import { createObj } from "../ecs/em-objects.js";

const DBG_GHOST = false;

export async function initGameParticles() {
  EM.addEagerInit([], [RendererDef], [], (res) => {
    res.renderer.renderer.submitPipelines([], [cloudBurstSys.pipeInit]);
    // res.renderer.renderer.submitPipelines([], [fireTrailSys.pipeInit]);

    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdMeshPipe,
      outlineRender,
      deferredPipeline,
      pointPipe,
      linePipe,

      cloudBurstSys.pipeRender,
      cloudBurstSys.pipeUpdate,
      fireTrailSys.pipeRender,
      fireTrailSys.pipeUpdate,

      stdGridRender,

      postProcess,
    ];
  });

  // grid
  initStdGrid();

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera settings
  // TODO(@darzu): is this all necessary?
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // pan camera
  initDemoPanCamera();

  // sun
  createSun();

  // pedestal
  const pedestal = EM.mk();
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
  EM.set(pedestal, PositionDef, V(0, 0, -3));
  EM.set(pedestal, ScaleDef, V(10, 10, 2));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });

  // gizmo
  addWorldGizmo(V(0, 0, 0), 5);

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  // particle test
  EM.set(pedestal, EmitterDef, { system: cloudBurstSys });

  EM.addSystem(
    "repeatSpawn",
    Phase.GAME_WORLD,
    null,
    [TimeDef, RendererDef],
    (_, res) => {
      if (res.time.step % (60 * 3) === 0) {
        res.renderer.renderer.submitPipelines([], [cloudBurstSys.pipeInit]);
      }
    }
  );

  EM.addSystem(
    "makeParticles",
    Phase.GAME_WORLD,
    null,
    [ParticleDef, InputsDef],
    (es, res) => {
      if (res.inputs.keyClicks["enter"]) {
        // fire ball
        const vel = V3.scale(randDir3(), 0.1);
        vel[2] = Math.abs(vel[2]);
        const ball = createObj(
          [
            PositionDef,
            ColorDef,
            RenderableConstructDef,
            SketchTrailDef,
            LinearVelocityDef,
            GravityDef,
            EmitterDef,
            LifetimeDef,
          ] as const,
          {
            position: [0, 0, 20],
            color: ENDESGA16.red,
            renderableConstruct: [BallMesh],
            sketchTrail: undefined,
            linearVelocity: vel,
            gravity: [0, 0, -0.0001],
            lifetime: 2000,
            emitter: {
              system: fireTrailSys,
              continuousPerSecNum: 5,
            },
          }
        );

        // spray
        pedestal.emitter.pulseNum.push(100);
      }
    }
  );

  initParticlesHtml();
}

async function initParticlesHtml() {
  const infoPanelsHolderEl = document.getElementById(
    "infoPanelsHolder"
  ) as HTMLInputElement | null;

  if (!infoPanelsHolderEl) {
    console.warn("no infoPanelsHolder detected");
    return;
  }

  infoPanelsHolderEl.innerHTML = GameParticles_InfoPanelsHtml;

  // paintColorPicker
  const paintModeEl = document.getElementById(
    "paintMode"
  ) as HTMLInputElement | null;
  assert(paintModeEl);

  paintModeEl.onchange = (e) => {
    const mode = paintModeEl!.checked;
    console.log(`toggle: ${mode}`); // TODO(@darzu): impl
  };
}

export const GameParticles_InfoPanelsHtml = `
<div class="infoPanel">
  <h2>Particles</h2>
  TODO
</div>
<div class="infoPanel">
  <h2>Controls</h2>
  <ul>
    <li>Drag to pan</li>
    <li>Scroll to zoom</li>
    <li>Refresh to reset</li>
    <li>Click to: <span id="clickModeString"></span></li>
  </ul>
</div>
<div class="infoPanel paintingPanel">
  <h2>Painting</h2>
  <label class="switch">
    <input type="checkbox" name="paintMode" id="paintMode">
    Painting Mode
  </label>
`;
