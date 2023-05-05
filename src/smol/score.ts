import { CanvasDef } from "../render/canvas.js";
import { createRef } from "../ecs/em_helpers.js";
import { EM } from "../ecs/entity-manager.js";
import { VERBOSE_LOG } from "../flags.js";
import { PartyDef } from "../games/party.js";
import { TextDef } from "../games/ui.js";
import { ShipHealthDef } from "../ld53/ship-health.js";
import { createAABB, pointInAABB } from "../physics/aabb.js";
import { PhysicsStateDef } from "../physics/nonintersection.js";
import { PhysicsParentDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { WoodHealthDef } from "../wood/wood.js";
import { setMap } from "./level-map.js";
import { MapPaths } from "./map-loader.js";
import { ShipDef } from "./ship.js";

export const ScoreDef = EM.defineComponent("score", () => ({
  cutPurple: 0,
  totalPurple: 0,
  completedLevels: 0,
  levelNumber: 0,
  gameEnding: false,
  gameEndedAt: 0,
  levelEnding: false,
  levelEndedAt: 0,
  victory: false,
  endZone: createRef<[typeof PhysicsStateDef]>(0, [PhysicsStateDef]),
  // TODO: this is very hacky
  onLevelEnd: [] as (() => Promise<void>)[],
  onGameEnd: [] as (() => Promise<void>)[],
  skipFrame: false,
}));

EM.registerSystem(
  [ShipHealthDef],
  [ScoreDef, TextDef, CanvasDef],
  (es, res) => {
    const ship = es[0];
    if (!ship) return;
    if (!res.score.gameEnding && !res.score.levelEnding) {
      if (!res.htmlCanvas.hasMouseLock()) {
        res.text.upperText = `CLICK TO START`;
      } else {
        res.text.upperText = `health: ${(ship.shipHealth.health * 100).toFixed(
          0
        )}`;
      }
    }
  },
  "updateScoreDisplay"
);

EM.registerSystem(
  [ShipHealthDef],
  [ScoreDef, TextDef, TimeDef, PartyDef],
  async (es, res) => {
    const ship = es[0];
    if (!ship) return;
    if (!res.score.endZone()) return;
    if (res.score.skipFrame) {
      res.score.skipFrame = false;
      return;
    }
    if (res.score.gameEnding) {
      if (res.time.step > res.score.gameEndedAt + 300) {
        if (VERBOSE_LOG) console.log("resetting after game end");
        if (res.score.victory) {
          res.score.levelNumber = 0;
          res.score.victory = false;
        }
        await setMap(EM, MapPaths[res.score.levelNumber]);
        //res.score.shipHealth = 10000;
        for (let f of res.score.onLevelEnd) {
          await f();
        }
        for (let f of res.score.onGameEnd) {
          await f();
        }
        res.score.gameEnding = false;
        res.score.skipFrame = true;
      }
    } else if (res.score.levelEnding) {
      if (res.time.step > res.score.levelEndedAt + 300) {
        res.score.completedLevels++;
        res.score.levelNumber++;
        await setMap(EM, MapPaths[res.score.levelNumber]);
        //res.score.shipHealth = 10000;
        for (let f of res.score.onLevelEnd) {
          await f();
        }
        res.score.levelEnding = false;
        res.score.skipFrame = true;
      }
    } else if (ship.shipHealth.health <= 0) {
      // END GAME
      console.log("ending game");
      res.score.gameEnding = true;
      res.score.gameEndedAt = res.time.step;
      res.text.upperText = "LEVEL FAILED";
    } else if (
      pointInAABB(res.score.endZone()!._phys.colliders[0].aabb, res.party.pos)
    ) {
      console.log("res.score.levelNumber: " + res.score.levelNumber);
      console.log("MapPaths.length: " + MapPaths.length);
      if (res.score.levelNumber + 1 >= MapPaths.length) {
        res.score.gameEnding = true;
        res.score.gameEndedAt = res.time.step;
        res.score.victory = true;
        res.text.upperText = "YOU WIN";
      } else {
        res.score.levelEnding = true;
        res.score.levelEndedAt = res.time.step;
        res.text.upperText = "LEVEL COMPLETE";
      }

      // splinter the dock
      const dock = res.score.endZone()!;
      if (WoodHealthDef.isOn(dock)) {
        for (let b of dock.woodHealth.boards) {
          for (let s of b) {
            s.health = 0;
          }
        }
      }
    }
  },
  "detectGameEnd"
);
