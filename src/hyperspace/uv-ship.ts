import { DevConsoleDef } from "../debug/console.js";
import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { onInit } from "../init.js";
import { InputsDef } from "../input/inputs.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { tempVec2 } from "../matrix/temp-pool.js";
import { vec2Dbg, vec3Dbg } from "../utils/utils-3d.js";
import { GameStateDef, HyperspaceGameState } from "./hyperspace-gamestate.js";
import { UVPosDef, UVDirDef } from "../ocean/ocean.js";
import { Phase } from "../ecs/sys_phase";

export const UVShipDef = EM.defineComponent("uvship", () => {
  return {
    speed: 0,
  };
});

onInit((em) => {
  em.registerSystem(
    "shipMove",
    Phase.GAME_WORLD,
    [UVShipDef, UVPosDef, UVDirDef, AuthorityDef],
    [
      // GameStateDef,
      MeDef,
      InputsDef,
      DevConsoleDef,
    ],
    (ships, res) => {
      // if (res.hsGameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        // if (s.authority.pid !== res.me.pid) continue;

        // console.log(
        //   `ship speed: ${s.ship.speed}, dir: ${s.uvDir[0]}, ${s.uvDir[1]}`
        // );

        // if (s.id > 10001) {
        //   console.log(
        //     `${s.id}: ship speed: ${s.ship.speed}, old pos: ${vec2Dbg(
        //       s.uvPos
        //     )} dir: ${s.uvDir[0]}, ${s.uvDir[1]}`
        //   );
        // }

        if (Math.abs(s.uvship.speed) > 0.00001) {
          // NOTE: we scale uvDir by speed so that the look-ahead used for
          //    UVDir->Rotation works.
          // TODO(@darzu): This doesn't seem great. We need a better way to
          //    do  UVDir->Rotation
          //vec2.normalize(s.uvDir, s.uvDir);
          const scaled = vec2.scale(s.uvDir, s.uvship.speed);
          vec2.add(s.uvPos, scaled, s.uvPos);
        }
      }
    }
  );
});
