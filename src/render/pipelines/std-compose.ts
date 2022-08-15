import { createRenderTextureToQuad } from "../gpu-helper.js";
import {
  CyDepthTexturePtr,
  CyRenderPipelinePtr,
  CyTexturePtr,
} from "../gpu-registry.js";
import { canvasTexturePtr } from "./std-scene.js";

const padding = 0.05;

// TODO(@darzu): make grid a parameter
export function createGridComposePipelines(
  grid: (CyTexturePtr | CyDepthTexturePtr)[][]
): CyRenderPipelinePtr[] {
  const width = grid[0].length;
  const height = grid.length;
  const uvWidth = (2.0 - padding * (width + 1)) / width;
  const uvHeight = (2.0 - padding * (height + 1)) / height;
  const uvStartX = -1.0 + padding;
  const uvStartY = 1.0 - padding;

  let pipes: CyRenderPipelinePtr[] = [];

  const rCount = grid.length;
  for (let ri = 0; ri < rCount; ri++) {
    const cCount = grid[ri].length;
    for (let ci = 0; ci < cCount; ci++) {
      const tex = grid[ri][ci];
      let xMin = uvStartX + ci * (uvWidth + padding);
      let xMax = xMin + uvWidth;
      let yMax = uvStartY - ri * (uvHeight + padding);
      let yMin = yMax - uvHeight;
      // HACK: when we're working with 2x2, we shrink the images for easier nav
      // TODO(@darzu): this is the common case; we should support this in a more
      //    principled way
      if (ci === 0 && cCount === 2) xMax -= 0.25;
      if (ci === 1 && cCount === 2) xMin += 0.25;
      if (ri === 0 && rCount === 2) yMin += 0.25;
      if (ri === 1 && rCount === 2) yMax -= 0.25;
      pipes.push(
        createRenderTextureToQuad(
          `composeViews_${ci}x${ri}`,
          tex,
          canvasTexturePtr,
          xMin,
          xMax,
          yMin,
          yMax,
          false
        ).pipeline
      );
    }
  }

  return pipes;
}
