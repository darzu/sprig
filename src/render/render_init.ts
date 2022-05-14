import { CanvasDef } from "../canvas.js";
import { EM, EntityManager } from "../entity-manager.js";
import { FORCE_WEBGL } from "../main.js";
import { MAX_MESHES, MAX_VERTICES } from "./pipelines.js";
import { RenderableConstructDef, Renderer } from "./renderer.js";
import { attachToCanvasWebgl } from "./render_webgl.js";
import { createWebGPURenderer } from "./render_webgpu.js";

// TODO(@darzu): ECS this
// export let _renderer: Renderer;

export const RendererDef = EM.defineComponent(
  "renderer",
  (renderer: Renderer, usingWebGPU: boolean) => {
    return {
      renderer,
      usingWebGPU,
    };
  }
);

let _rendererPromise: Promise<void> | null = null;

export function registerRenderInitSystem(em: EntityManager) {
  em.registerSystem(
    [],
    [CanvasDef],
    (_, res) => {
      if (!!em.getResource(RendererDef)) return; // already init
      if (!!_rendererPromise) return;
      _rendererPromise = init(em, res.htmlCanvas.canvas);
    },
    "renderInit"
  );
}

async function init(
  em: EntityManager,
  canvas: HTMLCanvasElement
): Promise<void> {
  let rendererInit: Renderer | undefined = undefined;
  let usingWebGPU = false;
  if (!FORCE_WEBGL) {
    // try webgpu first
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      const device = await adapter.requestDevice();
      // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
      const context = canvas.getContext("webgpu");
      if (context) {
        rendererInit = createWebGPURenderer(canvas, device, context, adapter);
        if (rendererInit) usingWebGPU = true;
      }
    }
  }
  if (!rendererInit)
    rendererInit = attachToCanvasWebgl(canvas, MAX_MESHES, MAX_VERTICES);
  if (!rendererInit) throw "Unable to create webgl or webgpu renderer";
  console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);

  // add to ECS
  // TODO(@darzu): this is a little wierd to do this in an async callback
  em.addSingletonComponent(RendererDef, rendererInit, usingWebGPU);
}
