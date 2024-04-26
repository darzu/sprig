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
import { createSun, initGhost } from "./graybox-helpers.js";
import { createObj } from "../ecs/em-objects.js";

const DBG_GHOST = true;

export async function initGameParticles() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

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

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

  // sun
  createSun();

  // grid
  const grid = createObj(
    [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  // pedestal
  const pedestal = EM.mk();
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.darkGray);
  EM.set(pedestal, PositionDef, V(0, 0, -10));
  EM.set(pedestal, ScaleDef, V(10, 10, 10));
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
}
