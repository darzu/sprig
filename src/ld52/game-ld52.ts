import { CameraDef } from "../camera.js";
import { EntityManager } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { PositionDef } from "../physics/transform.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";

export async function initLD52(em: EntityManager, hosting: boolean) {
  const res = await em.whenResources(
    AssetsDef,
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );

  res.camera.fov = Math.PI * 0.5;

  res.renderer.pipelines = [
    ...shadowPipelines,
    stdRenderPipeline,
    outlineRender,
    postProcess,
  ];

  const ship = em.newEntity();
  em.set(ship, RenderableConstructDef, res.assets.cube.proto);
  // em.set(ship, PositionDef, [0,0,0])
}
