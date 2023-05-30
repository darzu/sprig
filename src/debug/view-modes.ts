import {
  CameraDef,
  CameraFollowDef,
  setCameraFollowPosition,
} from "../camera/camera.js";
import { EM } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { LocalHsPlayerDef } from "../hyperspace/hs-player.js";
import { InputsDef } from "../input/inputs.js";
import { RendererDef } from "../render/renderer-ecs.js";

export function initDbgViewModes() {
  EM.addSystem(
    "renderModeToggles",
    Phase.GAME_PLAYERS,
    [],
    [InputsDef, RendererDef, CameraDef],
    (_, { inputs, renderer, camera }) => {
      // check render mode
      if (inputs.keyClicks["1"]) {
        // both lines and tris
        renderer.renderer.drawLines = true;
        renderer.renderer.drawTris = true;
      } else if (inputs.keyClicks["2"]) {
        // "wireframe", lines only
        renderer.renderer.drawLines = true;
        renderer.renderer.drawTris = false;
      }

      // check perspective mode
      if (inputs.keyClicks["3"]) {
        if (camera.perspectiveMode === "ortho")
          camera.perspectiveMode = "perspective";
        else camera.perspectiveMode = "ortho";
      }

      // check camera mode
      if (inputs.keyClicks["4"]) {
        const localHsPlayer = EM.getResource(LocalHsPlayerDef);
        const p = EM.findEntity(localHsPlayer?.playerId ?? -1, [
          CameraFollowDef,
        ]);
        if (p) {
          const overShoulder = p.cameraFollow.positionOffset[0] !== 0;
          if (overShoulder) setCameraFollowPosition(p, "thirdPerson");
          else setCameraFollowPosition(p, "thirdPersonOverShoulder");
        }
      }
    }
  );
}
