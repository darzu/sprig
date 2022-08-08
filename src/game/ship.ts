import { DevConsoleDef } from "../console.js";
import { EM } from "../entity-manager.js";
import { vec2 } from "../gl-matrix.js";
import { onInit } from "../init.js";
import { InputsDef } from "../inputs.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { GameStateDef, GameState } from "./gamestate.js";
import { UVPosDef, UVDirDef } from "./ocean.js";

export const ShipDef = EM.defineComponent("ship", () => {
  return {
    speed: 0,
  };
});

onInit((em) => {
  em.registerSystem(
    [ShipDef, AuthorityDef, UVPosDef, UVDirDef],
    [GameStateDef, MeDef, InputsDef, DevConsoleDef],
    (ships, res) => {
      if (res.gameState.state !== GameState.PLAYING) return;
      for (let s of ships) {
        if (s.authority.pid !== res.me.pid) return;

        if (s.ship.speed > 0.00001) {
          // NOTE: we scale uvDir by speed so that the look-ahead used for
          //    UVDir->Rotation works.
          // TODO(@darzu): This doesn't seem great. We need a better way to
          //    do  UVDir->Rotation
          vec2.normalize(s.uvDir, s.uvDir);
          vec2.scale(s.uvDir, s.uvDir, s.ship.speed);
          vec2.add(s.uvPos, s.uvPos, s.uvDir);
        }
      }
    },
    "shipMove"
  );
});
