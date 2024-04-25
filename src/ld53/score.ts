import { CanvasDef } from "../render/canvas.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { VERBOSE_LOG } from "../flags.js";
import { PartyDef } from "../camera/party.js";
import { TextDef } from "../gui/ui.js";
import { ShipHealthDef } from "./ship-health.js";
import { createAABB, pointInAABB } from "../physics/aabb.js";
import { PhysicsStateDef } from "../physics/nonintersection.js";
import { PhysicsParentDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { WoodHealthDef } from "../wood/wood.js";
import { MapPaths } from "../levels/map-loader.js";
import { LD52ShipDef } from "./ship.js";
import { Phase } from "../ecs/sys-phase.js";
import { HostDef } from "../net/components.js";

export const ScoreDef = EM.defineResource("score", () => ({
  completedLevels: new Set<number>(),
  levelNumber: 0,
  pendingTransition: false,
  timestampForGameOver: 0,
  timestampForNextLevel: 0,
  victory: false,
  endZone: createRef<[typeof PhysicsStateDef]>(0, [PhysicsStateDef]),
  // TODO: this is very hacky
  onLevelEnd: [] as (() => Promise<void>)[],
  onGameEnd: [] as (() => Promise<void>)[],
}));

// TODO(@darzu): MULTIPLAYER: make this client/server agnostic
EM.addSystem(
  "updateScoreDisplay",
  Phase.POST_GAME_WORLD,
  [ShipHealthDef],
  [ScoreDef, TextDef, CanvasDef],
  (es, res) => {
    const ship = es[0];
    if (!ship) return;
    if (!res.score.timestampForGameOver && !res.score.timestampForNextLevel) {
      if (!res.htmlCanvas.hasMouseLock()) {
        res.text.upperText = `CLICK TO START`;
      } else {
        res.text.upperText = `health: ${(ship.shipHealth.health * 100).toFixed(
          0
        )}`;
      }
    }
  }
);

EM.addSystem(
  "detectGameEnd",
  Phase.POST_GAME_WORLD,
  [ShipHealthDef],
  [ScoreDef, TextDef, TimeDef, PartyDef, HostDef],
  // TODO(@darzu): does this need to be async? Note we're currently async b/c of
  //    whenSingleEntity and whenResources calls within hostResetLevel
  async (es, res) => {
    const ship = es[0];
    if (!ship) return;
    if (!res.score.endZone()) return;

    if (res.score.timestampForGameOver) {
      // waiting for game over
      if (res.score.timestampForGameOver < res.time.time) {
        res.score.timestampForGameOver = 0;
        // game over
        if (VERBOSE_LOG) console.log("resetting after game end");
        if (res.score.victory) {
          // game won
          res.score.levelNumber = 0;
          res.score.completedLevels.clear();
          res.score.victory = false;
        }
        for (let f of res.score.onLevelEnd) {
          await f();
        }
        for (let f of res.score.onGameEnd) {
          await f();
        }
        res.score.pendingTransition = false; // wait until all event handlers are done
      }
      return;
    }

    if (res.score.timestampForNextLevel) {
      // waiting for next level
      if (res.score.timestampForNextLevel < res.time.time) {
        res.score.timestampForNextLevel = 0;
        // next level
        res.score.levelNumber += 1;
        for (let f of res.score.onLevelEnd) {
          await f();
        }
        res.score.pendingTransition = false; // wait until all event handlers are done
      }
      return;
    }

    // wait for any transition to finish
    if (res.score.pendingTransition) return;

    // relevant facts
    const shipDead = ship.shipHealth.health <= 0;
    const shipInEndZone = pointInAABB(
      res.score.endZone()!._phys.colliders[0].aabb,
      res.party.pos
    );
    const alreadyCompletedLevel = res.score.completedLevels.has(
      res.score.levelNumber
    );

    // game lost
    if (shipDead) {
      res.score.pendingTransition = true;
      res.score.timestampForGameOver = res.time.time + 3000;
      res.text.upperText = "LEVEL FAILED"; // TODO(@darzu): MULTIPLAYER. send to clients
      return;
    }

    // next level
    if (shipInEndZone && !alreadyCompletedLevel) {
      res.score.completedLevels.add(res.score.levelNumber);

      // console.log("res.score.levelNumber: " + res.score.levelNumber);
      // console.log("MapPaths.length: " + MapPaths.length);

      if (res.score.levelNumber + 1 >= MapPaths.length) {
        // game won
        res.score.pendingTransition = true;
        res.score.timestampForGameOver = res.time.time + 3000;
        res.score.victory = true;
        res.text.upperText = "YOU WIN";
      } else {
        // next level
        res.score.pendingTransition = true;
        res.score.timestampForNextLevel = res.time.time + 3000;
        res.text.upperText = "LEVEL COMPLETE";
      }
      return;
    }
  }
);
