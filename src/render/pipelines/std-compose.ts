import { createRenderTextureToQuad } from "../gpu-helper.js";
import {
  CyDepthAttachment,
  CyDepthTexturePtr,
  CyRenderPipelinePtr,
  CyTexturePtr,
  isResourcePtr,
} from "../gpu-registry.js";
import { canvasTexturePtr } from "./std-scene.js";

const padding = 0.05;

let __nextGridId = 1;
// TODO(@darzu): make grid a parameter
export function createGridComposePipelines(
  grid: (CyTexturePtr | CyDepthAttachment)[][]
): CyRenderPipelinePtr[] {
  const width = grid[0].length;
  const height = grid.length;
  const uvWidth = (2.0 - padding * (width + 1)) / width;
  const uvHeight = (2.0 - padding * (height + 1)) / height;
  const uvStartX = -1.0 + padding;
  const uvStartY = 1.0 - padding;

  let pipes: CyRenderPipelinePtr[] = [];

  const idStr = `${__nextGridId++}`;

  for (let ri = 0; ri < grid.length; ri++) {
    for (let ci = 0; ci < grid[ri].length; ci++) {
      const att = grid[ri][ci];
      const tex = isResourcePtr(att) ? att : att.ptr;
      // const idx = isResourcePtr(att) ? 0 : att.idx;
      const xMin = uvStartX + ci * (uvWidth + padding);
      const xMax = xMin + uvWidth;
      const yMax = uvStartY - ri * (uvHeight + padding);
      const yMin = yMax - uvHeight;
      pipes.push(
        createRenderTextureToQuad(
          `composeViews_${tex.name}_${idStr}_${ci}x${ri}`,
          att,
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
