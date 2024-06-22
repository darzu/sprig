import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/ecs.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { V, quat, V3, V4 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, HexMesh, PlaneMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, mkCubeMesh } from "../meshes/primatives.js";
import { GravityDef } from "../motion/gravity.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { MeDef } from "../net/components.js";
import {
  EmitterDef,
  ParticleDef,
  ParticleSystem,
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
import { addWorldGizmo, randColor } from "../utils/utils-game.js";
import {
  createSun,
  initDemoPanCamera,
  initGhost,
  initStdGrid,
} from "./graybox-helpers.js";
import { createObj } from "../ecs/em-objects.js";
import { CyToTS } from "../render/gpu-struct.js";
import { createHtmlBuilder } from "../web/html-builder.js";

const DBG_GHOST = false;

type ParticleParams = typeof cloudBurstSys extends ParticleSystem<infer U>
  ? CyToTS<U>
  : never;

const particleParams: ParticleParams = {
  minColor: V(0, 0, 0, 0),
  maxColor: V(1, 1, 1, 1),
  minColorVel: V(0, 0, 0, 0),
  maxColorVel: V(-0.1, -0.1, +0.1, 0),
  minPos: V(-10, -10, -10),
  maxPos: V(+10, +10, +10),
  minVel: V(-0.5, -0.5, -0.5),
  maxVel: V(+0.5, +0.5, +0.5),
  minAcl: V(-0.5, -0.5, -0.5),
  maxAcl: V(+0.5, +0.5, +0.5),
  minSize: 0.1,
  maxSize: 1.0,
  minSizeVel: -0.5,
  maxSizeVel: +0.5,
  minLife: 1,
  maxLife: 10,
};

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
  EM.set(pedestal, EmitterDef, { system: cloudBurstSys as ParticleSystem });

  EM.addSystem(
    "repeatSpawn",
    Phase.GAME_WORLD,
    null,
    [TimeDef, RendererDef],
    (_, res) => {
      if (res.time.step % (60 * 3) === 0) {
        const color = randColor();
        cloudBurstSys.submitParametersUpdate!(
          res.renderer.renderer,
          particleParams
        );
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
        // TODO(@darzu): IMPL! This pulse emitter doesn't work yet
        pedestal.emitter.pulseNum.push(100);
      }
    }
  );

  initParticlesHtml();
}

async function initParticlesHtml() {
  if (!document.getElementById("infoPanelsHolder")) {
    console.warn("no infoPanelsHolder");
    return;
  }

  const htmlBuilder = createHtmlBuilder();

  // about
  const aboutPanel = htmlBuilder.addInfoPanel("Shipyard");
  aboutPanel.addText(`
     TODO
  `);

  // controls
  const controlsPanel = htmlBuilder.addInfoPanel("Controls");
  controlsPanel.addHTML(`
    <ul>
      <li>Drag to pan</li>
      <li>Scroll to zoom</li>
    </ul>
  `);

  // movement
  const movPanel = htmlBuilder.addInfoPanel("Movement");

  movPanel.addMinMaxV3Editor({
    label: "Pos",
    min: [-100, -100, -100],
    max: [+100, +100, +100],
    defaultMin: [-10, -10, -10],
    defaultMax: [+10, +10, +10],
    step: 1,
    onChange: (min, max) => {
      V3.copy(particleParams.minPos, min);
      V3.copy(particleParams.maxPos, max);
    },
  });

  movPanel.addMinMaxV3Editor({
    label: "Vel",
    min: [-2, -2, -2],
    max: [+2, +2, +2],
    defaultMin: [-0.5, -0.5, -0.5],
    defaultMax: [+0.5, +0.5, +0.5],
    step: 0.1,
    onChange: (min, max) => {
      V3.copy(particleParams.minVel, min);
      V3.copy(particleParams.maxVel, max);
    },
  });

  movPanel.addMinMaxV3Editor({
    label: "Acl",
    min: [-2, -2, -2],
    max: [+2, +2, +2],
    defaultMin: [-0.5, -0.5, -0.5],
    defaultMax: [+0.5, +0.5, +0.5],
    step: 0.1,
    onChange: (min, max) => {
      V3.copy(particleParams.minAcl, min);
      V3.copy(particleParams.maxAcl, max);
    },
  });

  // appearance
  const appPanel = htmlBuilder.addInfoPanel("Appearance");

  appPanel.addMinMaxEditor({
    label: "Size",
    min: 0,
    max: 5,
    step: 0.1,
    defaultMin: particleParams.minSize,
    defaultMax: particleParams.maxSize,
    onChange: (min, max) => {
      particleParams.minSize = min;
      particleParams.maxSize = max;
    },
  });

  appPanel.addMinMaxColorEditor({
    label: "Color",
    defaultMin: V3.fromV4(particleParams.minColor),
    defaultMax: V3.fromV4(particleParams.maxColor),
    onChange: (min, max) => {
      V4.copyV3(particleParams.minColor, min);
      V4.copyV3(particleParams.maxColor, max);
    },
  });
}
