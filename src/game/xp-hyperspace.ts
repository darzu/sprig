import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager, EM } from "../entity-manager.js";
import { InputsDef } from "../inputs.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-pipeline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { shadowPipeline } from "../render/pipelines/std-shadow.js";
import { initStars, renderStars } from "../render/pipelines/xp-stars.js";
import { AssetsDef } from "./assets.js";
import { GlobalCursor3dDef } from "./cursor.js";
import { TextDef } from "./ui.js";
import { MeDef } from "../net/components.js";
import { createPlayer } from "./player.js";
import { createShip } from "./ship.js";
import { GameStateDef } from "./gamestate.js";
import { unwrapPipeline, unwrapTex } from "../render/pipelines/xp-uv-unwrap.js";
import { createComposePipeline } from "../render/pipelines/std-compose.js";
import { createGhost } from "./sandbox.js";
import { quat, vec2, vec3 } from "../gl-matrix.js";

const OceanDef = EM.defineComponent("ocean", () => true);

const UVPos = EM.defineComponent("uv", (pos?: vec2) => ({
  pos: pos,
}));

export function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  createShip([-120, 0, 0]);
  // }

  // em.registerOneShotSystem(null, [MeDef], () => createPlayer(em));

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      const ghost = createGhost(em);
      em.ensureComponentOn(
        ghost,
        RenderableConstructDef,
        res.assets.cube.proto
      );
      ghost.controllable.speed *= 3;
      ghost.controllable.sprintMul *= 3;

      {
        // debug camera
        vec3.copy(ghost.position, [-185.02, 66.25, -69.04]);
        quat.copy(ghost.rotation, [0.0, -0.92, 0.0, 0.39]);
        vec3.copy(ghost.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        ghost.cameraFollow.yawOffset = 0.0;
        ghost.cameraFollow.pitchOffset = -0.465;
      }

      // TODO(@darzu): call one-shot initStars
      const ocean = em.newEntity();
      em.ensureComponentOn(ocean, OceanDef);
      em.ensureComponentOn(
        ocean,
        RenderableConstructDef,
        res.assets.ocean.proto
      );
      em.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
      // em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
      em.ensureComponentOn(ocean, PositionDef);
      // em.ensureComponentOn(ocean, PositionDef, [120, 0, 0]);
      // vec3.scale(ocean.position, ocean.position, scale);
      // const scale = 100.0;
      // const scale = 1.0;
      // em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);

      // TODO(@darzu): DEBUG quad mesh stuff
      const fabric = em.newEntity();
      em.ensureComponentOn(
        fabric,
        RenderableConstructDef,
        res.assets.fabric.proto
      );
      em.ensureComponentOn(fabric, PositionDef, [10, 10, 10]);

      const buoy = em.newEntity();
      em.ensureComponentOn(buoy, PositionDef);
      em.ensureComponentOn(buoy, RenderableConstructDef, res.assets.ball.proto);
      em.ensureComponentOn(buoy, ScaleDef, [5, 5, 5]);
      em.ensureComponentOn(buoy, ColorDef, [0.2, 0.8, 0.2]);
      em.ensureComponentOn(buoy, UVPos, [0.5, 0.5]);
    }
  );

  // let line: ReturnType<typeof drawLine>;

  let once = true;
  let once2 = true; // TODO(@darzu): lol wat.

  let finalCompose = createComposePipeline();

  em.registerSystem(
    [OceanDef],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (once) {
        // one-time compute and render jobs
        res.renderer.pipelines = [initStars, unwrapPipeline];

        once = false;
      } else if (once2) {
        // read from one-time jobs
        // TODO(@darzu): what's the right way to handle these jobs
        res.renderer.renderer.readTexture(unwrapTex).then((a) => {
          console.dir(new Float32Array(a));
        });

        once2 = false;
      } else {
        // steady state rendering
        res.renderer.pipelines = [
          unwrapPipeline, // TODO(@darzu): don't run many times
          shadowPipeline,
          stdRenderPipeline,
          finalCompose, // TODO(@darzu): should be last step
          outlineRender,
          // renderStars,
          // ...blurPipelines,
          // shadowDbgDisplay,
          // normalDbg,
          // positionDbg,
          postProcess,
        ];
      }
    },
    "hyperspaceGame"
  );
}
