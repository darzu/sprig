import { CameraComputedDef } from "../camera/camera.js";
import { EM } from "../ecs/ecs.js";
import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { Phase } from "../ecs/sys-phase.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { mkRay } from "../physics/broadphase.js";
import { CanvasDef } from "../render/canvas.js";
import { remap } from "../utils/math.js";
import { InputsDef } from "./inputs.js";

export const MouseRayDef = defineResourceWithInit(
  "mouseRay",
  [InputsDef, CameraComputedDef, CanvasDef],
  (res) => {
    const mouseRay = mkRay();

    EM.addSystem("updateMouseRay", Phase.POST_READ_INPUTS, null, [], () => {
      const html = res.htmlCanvas.getCanvasHtml();
      let cursorFracX = res.inputs.mousePos[0] / html.clientWidth;
      let cursorFracY = res.inputs.mousePos[1] / html.clientHeight;
      const ndcX = remap(cursorFracX, 0, 1, -1, 1); // TODO(@darzu): is this really ndc?
      const ndcY = remap(cursorFracY, 0, 1, 1, -1); // screen is Y down, world is Y up
      // const cursorWorldPos0 = V3.tMat4(
      //   [ndcX, ndcY, 0],
      //   res.cameraComputed.invViewProj
      // );
      const cursorWorldPos0 = res.cameraComputed.location;
      const cursorWorldPos1 = V3.tMat4(
        [ndcX, ndcY, 0.5],
        res.cameraComputed.invViewProj
      );
      V3.copy(mouseRay.org, cursorWorldPos0);
      V3.dir(cursorWorldPos1, cursorWorldPos0, mouseRay.dir);
    });

    return mouseRay;
  }
);
