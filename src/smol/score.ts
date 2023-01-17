import { EM } from "../entity-manager.js";
import { TextDef } from "../games/ui.js";
import { TimeDef } from "../time.js";
import { setMap } from "./grass-map.js";
import { MapPaths } from "./map-loader.js";

export const ScoreDef = EM.defineComponent("score", () => ({
  shipHealth: 10000,
  cutPurple: 0,
  totalPurple: 0,
  completedLevels: 0,
  levelNumber: 0,
  gameEnding: false,
  gameEndedAt: 0,
  levelEnding: false,
  levelEndedAt: 0,
  victory: false,
  // TODO: this is very hacky
  onLevelEnd: [] as (() => void)[],
  onGameEnd: [] as (() => void)[],
}));

EM.registerSystem(
  [],
  [ScoreDef, TextDef],
  (_, res) => {
    if (!res.score.gameEnding && !res.score.levelEnding) {
      res.text.upperText = `health: ${(res.score.shipHealth / 100).toFixed(
        0
      )}\nharvested: ${(
        (res.score.cutPurple / res.score.totalPurple) *
        100
      ).toFixed(2)}%`;
    }
  },
  "updateScoreDisplay"
);

EM.registerSystem(
  [],
  [ScoreDef, TextDef, TimeDef],
  (_, res) => {
    if (res.score.gameEnding) {
      if (res.time.step > res.score.gameEndedAt + 300) {
        res.score.gameEnding = false;
        if (res.score.victory) {
          res.score.levelNumber = 0;
          res.score.victory = false;
        }
        setMap(EM, MapPaths[res.score.levelNumber]);
        res.score.shipHealth = 10000;
        for (let f of res.score.onLevelEnd) {
          f();
        }
        for (let f of res.score.onGameEnd) {
          f();
        }
      }
    } else if (res.score.levelEnding) {
      if (res.time.step > res.score.levelEndedAt + 300) {
        res.score.levelEnding = false;
        res.score.completedLevels++;
        res.score.levelNumber++;
        setMap(EM, MapPaths[res.score.levelNumber]);
        res.score.shipHealth = 10000;
        for (let f of res.score.onLevelEnd) {
          f();
        }
      }
    } else if (res.score.shipHealth <= 0) {
      // END GAME
      res.score.gameEnding = true;
      res.score.gameEndedAt = res.time.step;
      res.text.upperText = "LEVEL FAILED";
    } else if (res.score.cutPurple / res.score.totalPurple > 0.95) {
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
    }
  },
  "detectGameEnd"
);
