import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CyRenderPipelinePtr } from "../gpu-registry.js";
import { litTexturePtr } from "./std-scene.js";
import { unwrapTex } from "./xp-uv-unwrap.js";

export function createComposePipeline(): CyRenderPipelinePtr {
  // TODO(@darzu): ARGS
  const res = createRenderTextureToQuad(
    "composeViews",
    unwrapTex,
    litTexturePtr,
    0.1,
    0.9,
    0.1,
    0.9
  );
  return res.pipeline;
}
