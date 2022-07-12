import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CyRenderPipelinePtr } from "../gpu-registry.js";
import { litTexturePtr } from "./std-scene.js";
import { jfaTexs } from "./xp-jump-flood.js";
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
    0.9,
    false
  );
  const p1 = createRenderTextureToQuad(
    "composeViews1",
    jfaTexs[0],
    litTexturePtr,
    0.1,
    0.9,
    -0.9,
    -0.1,
    false
  );
  const p2 = createRenderTextureToQuad(
    "composeViews2",
    jfaTexs[1],
    litTexturePtr,
    -0.9,
    -0.1,
    -0.9,
    -0.1,
    false
  );
  return [p0.pipeline, p1.pipeline, p2.pipeline];
}
