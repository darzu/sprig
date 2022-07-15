import { createRenderTextureToQuad } from "../gpu-helper.js";
import { CyRenderPipelinePtr } from "../gpu-registry.js";
import { canvasTexturePtr, litTexturePtr } from "./std-scene.js";
import { nearestPosTexs } from "./xp-jump-flood.js";
import { uvBorderMask, uvPosBorderMask, uvToPosTex } from "./xp-uv-unwrap.js";

export function createComposePipelines(): CyRenderPipelinePtr[] {
  // TODO(@darzu): ARGS
  const p0 = createRenderTextureToQuad(
    "composeViews0",
    uvPosBorderMask,
    litTexturePtr,
    -0.4,
    +0.4,
    0.1,
    0.9,
    false
  );
  const p1 = createRenderTextureToQuad(
    "composeViews1",
    nearestPosTexs[0],
    litTexturePtr,
    -0.9,
    -0.1,
    -0.9,
    -0.1,
    false
  );
  const p2 = createRenderTextureToQuad(
    "composeViews2",
    nearestPosTexs[1],
    litTexturePtr,
    0.1,
    0.9,
    -0.9,
    -0.1,
    false
  );
  const p3 = createRenderTextureToQuad(
    "composeViews3",
    litTexturePtr,
    canvasTexturePtr,
    // {
    //   ptr: canvasTexturePtr,
    //   defaultColor: [0.8, 0.1, 0.1, 1.0],
    //   clear: "always",
    // },
    -1,
    1,
    -1,
    1,
    false
  );
  return [p0.pipeline, p1.pipeline, p2.pipeline, p3.pipeline];
}
