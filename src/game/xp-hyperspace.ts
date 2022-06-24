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
import { unwrapPipeline } from "../render/pipelines/xp-uv-unwrap.js";

const OceanDef = EM.defineComponent("ocean", () => true);

export function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  createShip();
  // }

  em.registerOneShotSystem(null, [MeDef], () => createPlayer(em));

  em.registerOneShotSystem(
    null,
    [AssetsDef, GlobalCursor3dDef, RendererDef],
    (_, res) => {
      // TODO(@darzu): call one-shot initStars
      const ocean = em.newEntity();
      em.ensureComponentOn(ocean, OceanDef);
      em.ensureComponentOn(
        ocean,
        RenderableConstructDef,
        res.assets.ocean.proto
      );
      em.ensureComponentOn(ocean, ColorDef, [0.1, 0.3, 0.8]);
      em.ensureComponentOn(ocean, PositionDef, [12000, 180, 0]);
      // vec3.scale(ocean.position, ocean.position, scale);
      const scale = 100.0;
      em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);
    }
  );

  // let line: ReturnType<typeof drawLine>;

  let once = true;

  em.registerSystem(
    [OceanDef],
    [GlobalCursor3dDef, RendererDef, InputsDef, TextDef],
    (cs, res) => {
      if (once) {
        // one-time compute and render jobs
        res.renderer.pipelines = [initStars, unwrapPipeline];
        once = false;
      } else {
        // steady state rendering
        res.renderer.pipelines = [
          // TODO(@darzu):
          shadowPipeline,
          stdRenderPipeline,
          outlineRender,
          renderStars,
          // TODO(@darzu): doesn't quite work yet
          ...blurPipelines,
          // renderRopePipelineDesc,
          // boidRender,
          // boidCanvasMerge,
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
