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
  createParticleSystem,
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
import { remap } from "../utils/math.js";

const DBG_GHOST = false;

const gameParticlesState = {
  emitIntervalFrames: 20,
  numEmit: 200,
};

export const sampleParticlesSys = createParticleSystem({
  name: "sampleParticles",
  maxParticles: 1_000,
  maxLifeMs: 10_000 + 1_000,
  initParticle: `
  let color = mix(param.minColor, param.maxColor, vec4(rand(), rand(), rand(), rand()));
  particle.color = color;
  particle.colorVel = mix(param.minColorVel, param.maxColorVel, vec4(rand(), rand(), rand(), rand())) * 0.001;
  particle.pos = mix(param.minPos, param.maxPos, vec3(rand(), rand(), rand()));
  particle.size = mix(param.minSize, param.maxSize, rand());
  particle.vel = mix(param.minVel, param.maxVel, vec3(rand(), rand(), rand())) * 0.1;
  particle.acl = mix(param.minAcl, param.maxAcl, vec3(rand(), rand(), rand())) * 0.0001;
  particle.sizeVel = mix(param.minSizeVel, param.maxSizeVel,  rand()) * 0.001;
  particle.life = mix(param.minLife, param.maxLife, rand()) * 1000;
  `,
  initParameters: {
    minColor: "vec4<f32>",
    maxColor: "vec4<f32>",
    minColorVel: "vec4<f32>",
    maxColorVel: "vec4<f32>",
    minPos: "vec3<f32>",
    maxPos: "vec3<f32>",
    minVel: "vec3<f32>",
    maxVel: "vec3<f32>",
    minAcl: "vec3<f32>",
    maxAcl: "vec3<f32>",
    minSize: "f32",
    maxSize: "f32",
    minSizeVel: "f32",
    maxSizeVel: "f32",
    minLife: "f32",
    maxLife: "f32",
  },
  initParameterDefaults: {
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
  },
});

type ParticleParams = typeof sampleParticlesSys extends ParticleSystem<infer U>
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
    res.renderer.renderer.submitPipelines([], [sampleParticlesSys.pipeInit]);
    // res.renderer.renderer.submitPipelines([], [fireTrailSys.pipeInit]);

    // renderer
    res.renderer.pipelines = [
      ...shadowPipelines,
      stdMeshPipe,
      outlineRender,
      deferredPipeline,
      pointPipe,
      linePipe,

      sampleParticlesSys.pipeRender,
      sampleParticlesSys.pipeUpdate,

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
  EM.set(pedestal, EmitterDef, {
    system: sampleParticlesSys as ParticleSystem,
  });

  let lastEmit = -Infinity;

  EM.addSystem(
    "repeatSpawn",
    Phase.GAME_WORLD,
    null,
    [TimeDef, RendererDef],
    (_, res) => {
      if (res.time.step >= lastEmit + gameParticlesState.emitIntervalFrames) {
        lastEmit = res.time.step;
        sampleParticlesSys.updateParameters!(
          res.renderer.renderer,
          particleParams
        );
        sampleParticlesSys.updateSpawnParameters(
          res.renderer.renderer,
          gameParticlesState.numEmit
        );
        res.renderer.renderer.submitPipelines(
          [],
          [sampleParticlesSys.pipeInit]
        );
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
        // TODO(@darzu): IMPL!
        // const ball = createObj(
        //   [
        //     PositionDef,
        //     ColorDef,
        //     RenderableConstructDef,
        //     SketchTrailDef,
        //     LinearVelocityDef,
        //     GravityDef,
        //     EmitterDef,
        //     LifetimeDef,
        //   ] as const,
        //   {
        //     position: [0, 0, 20],
        //     color: ENDESGA16.red,
        //     renderableConstruct: [BallMesh],
        //     sketchTrail: undefined,
        //     linearVelocity: vel,
        //     gravity: [0, 0, -0.0001],
        //     lifetime: 2000,
        //     emitter: {
        //       system: fireTrailSys,
        //       continuousPerSecNum: 5,
        //     },
        //   }
        // );

        // // spray
        // // TODO(@darzu): IMPL! This pulse emitter doesn't work yet
        // pedestal.emitter.pulseNum.push(100);
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
  const aboutPanel = htmlBuilder.addInfoPanel("Particles");
  aboutPanel.addText(`
     A particle simulation running on the GPU.
     Particles are camera-facing unsorted quads alpha-clipped into circles.
     GPU uniform buffer parameters control initialization.
    `);
  //  TODO: continuous partial emission, growable buffers, custom init/update shaders.

  // controls
  const controlsPanel = htmlBuilder.addInfoPanel("Controls");
  controlsPanel.addHTML(`
    <ul>
      <li>Drag to pan</li>
      <li>Scroll to zoom</li>
    </ul>
  `);

  // panel order
  const emitPanel = htmlBuilder.addInfoPanel("Emission");
  const colorPanel = htmlBuilder.addInfoPanel("Color");
  const movPanel = htmlBuilder.addInfoPanel("Movement");
  const sizePanel = htmlBuilder.addInfoPanel("Size");
  const colorVelPanel = htmlBuilder.addInfoPanel("Color Δ/t");

  // movement
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

  // color
  colorPanel.addMinMaxColorEditor({
    label: "Range",
    defaultMin: V3.fromV4(particleParams.minColor),
    defaultMax: V3.fromV4(particleParams.maxColor),
    onChange: (min, max) => {
      V4.copyV3(particleParams.minColor, min);
      V4.copyV3(particleParams.maxColor, max);
    },
  });
  colorPanel.addMinMaxEditor({
    label: "Alpha",
    min: 0,
    max: 1,
    step: 0.01,
    defaultMin: particleParams.minColor[3],
    defaultMax: particleParams.maxColor[3],
    onChange: (min, max) => {
      particleParams.minColor[3] = min;
      particleParams.maxColor[3] = max;
    },
  });
  // colorPanel.addMinMaxEditor({
  //   label: "Alpha Δ/t",
  //   min: -2,
  //   max: 2,
  //   step: 0.01,
  //   defaultMin: particleParams.minColorVel[3],
  //   defaultMax: particleParams.maxColorVel[3],
  //   onChange: (min, max) => {
  //     particleParams.minColorVel[3] = min;
  //     particleParams.maxColorVel[3] = max;
  //   },
  // });
  // colorPanel.addMinMaxColorEditor({
  //   label: "Color Δ/t",
  //   defaultMin: V3.fromV4(particleParams.minColorVel),
  //   defaultMax: V3.fromV4(particleParams.maxColorVel),
  //   onChange: (min, max) => {
  //     V4.copyV3(particleParams.minColorVel, min);
  //     V4.copyV3(particleParams.maxColorVel, max);
  //   },
  // });

  // color vel
  for (let i = 0; i < 3; i++) {
    const name = ["Red", "Green", "Blue"][i];
    colorVelPanel.addMinMaxEditor({
      label: `${name} Δ/t`,
      min: -1.5,
      max: 1.5,
      step: 0.01,
      defaultMin: particleParams.minColorVel[i],
      defaultMax: particleParams.maxColorVel[i],
      onChange: (min, max) => {
        particleParams.minColorVel[i] = min;
        particleParams.maxColorVel[i] = max;
      },
    });
  }

  // size
  sizePanel.addMinMaxEditor({
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
  sizePanel.addMinMaxEditor({
    label: "Size Δ/t",
    min: -2,
    max: 2,
    step: 0.1,
    defaultMin: particleParams.minSizeVel,
    defaultMax: particleParams.maxSizeVel,
    onChange: (min, max) => {
      particleParams.minSizeVel = min;
      particleParams.maxSizeVel = max;
    },
  });

  // emission
  emitPanel.addNumberEditor({
    label: "Freq",
    min: 1,
    max: 100,
    step: 1,
    default: 50,
    onChange: (val) => {
      const steps = remap(val, 1, 100, 180, 1);
      gameParticlesState.emitIntervalFrames = steps;
    },
  });
  emitPanel.addNumberEditor({
    label: "Num",
    min: 0,
    max: 1000,
    step: 1,
    default: 100,
    onChange: (val) => {
      gameParticlesState.numEmit = val;
    },
  });
  emitPanel.addMinMaxEditor({
    label: "Life",
    min: 0,
    max: 10,
    step: 0.1,
    defaultMin: particleParams.minLife,
    defaultMax: particleParams.maxLife,
    onChange: (min, max) => {
      particleParams.minLife = min;
      particleParams.maxLife = max;
    },
  });
}
