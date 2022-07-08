import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CyRenderPipelinePtr } from "../gpu-registry.js";
import { litTexturePtr } from "./std-scene.js";
import { sdfTex } from "./xp-jump-flood.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

export function createComposePipelines(): CyRenderPipelinePtr[] {
  // TODO(@darzu): ARGS
  const p0 = createRenderTextureToQuad(
    "composeViews0",
    uvPosBorderMask,
    litTexturePtr,
    0.1,
    0.9,
    0.1,
    0.9
  );
  const p1 = createRenderTextureToQuad(
    "composeViews1",
    sdfTex,
    litTexturePtr,
    0.1,
    0.9,
    -0.9,
    -0.1
  );
  return [p0.pipeline, p1.pipeline];
}
