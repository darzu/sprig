import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CyRenderPipelinePtr } from "../gpu-registry.js";
import { litTexturePtr } from "./std-scene.js";
import { uvToPosTex } from "./xp-uv-unwrap.js";

export function createComposePipeline(): CyRenderPipelinePtr {
  // TODO(@darzu): ARGS
  const res = createRenderTextureToQuad(
    "composeViews",
    uvToPosTex,
    litTexturePtr,
    0.1,
    0.9,
    0.1,
    0.9
  );
  return res.pipeline;
}
