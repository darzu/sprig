import { PoseDef, tweenToPose } from "../animation/skeletal.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM, EntityW } from "../ecs/entity-manager.js";
import { Phase } from "../ecs/sys-phase.js";
import { LocalPlayerEntityDef } from "../hyperspace/hs-player.js";
import { InputsDef } from "../input/inputs.js";
import { quat, vec3 } from "../matrix/sprig-matrix.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { vec3Dbg } from "../utils/utils-3d.js";
import { SpaceSuitDef } from "./space-suit-controller.js";
import { PartyDef } from "../camera/party.js";
import { bubblePipeline } from "../render/pipelines/xp-bubble.js";
import { TextDef } from "../gui/ui.js";
import { SpacePathDef } from "./space-path.js";

export const BubbleDef = EM.defineNonupdatableComponent("bubble", () => true);

export const BreathingPlayerDef = EM.defineNonupdatableComponent(
  "breathingPlayer",
  () => true
);

const STARTING_OXYGEN = 100;
const STARTING_FUEL = 100;
// amount of oxygen / cubic meter
const OXYGEN_DENSITY = 0.001;

// oxygen consumed per ms
const OXYGEN_CONSUMPTION_RATE = 1 / 1000;

const FUEL_CONSUMPTION_RATE = 1 / 300;

export const OXYGEN_PER_ORE = 50;

export const FUEL_PER_ORE = 60;

const STARTING_PLAYER_OXYGEN = 20;

enum GameStatus {
  Playing,
  Defeat,
  Victory,
}

export const LD54GameStateDef = EM.defineResource("ld54GameState", () => ({
  oxygen: STARTING_OXYGEN,
  fuel: STARTING_FUEL,
  playerOxygen: STARTING_PLAYER_OXYGEN,
  bubbleRadius: 0,
  status: GameStatus.Playing,
}));

EM.addEagerInit([], [LD54GameStateDef], [], () => {
  EM.addSystem(
    "updateLD54GameState",
    Phase.PRE_GAME_WORLD,
    [BreathingPlayerDef, PositionDef],
    [LD54GameStateDef, PartyDef, TimeDef, TextDef],
    (es, res) => {
      if (res.ld54GameState.status === GameStatus.Victory) {
        res.text.upperText = "YOU WON!";
        res.text.lowerText = "refresh to play again";
        return;
      }
      if (res.ld54GameState.status === GameStatus.Defeat) {
        res.text.upperText = "YOU DIED";
        res.text.lowerText = "refresh to play again";
        return;
      }
      // playing!

      // fuel
      res.ld54GameState.fuel -= FUEL_CONSUMPTION_RATE * res.time.dt;
      res.ld54GameState.fuel = Math.max(0, res.ld54GameState.fuel);

      // oxygen
      res.ld54GameState.oxygen -= OXYGEN_CONSUMPTION_RATE * res.time.dt;
      res.ld54GameState.bubbleRadius = Math.pow(
        res.ld54GameState.oxygen / OXYGEN_DENSITY,
        1 / 3
      );

      // is the player in the bubble?
      const player = es[0];
      if (player) {
        const playerToShip = vec3.dist(player.position, res.party.pos);
        if (playerToShip <= res.ld54GameState.bubbleRadius) {
          res.ld54GameState.playerOxygen = STARTING_PLAYER_OXYGEN;
        } else {
          res.ld54GameState.playerOxygen -=
            OXYGEN_CONSUMPTION_RATE * res.time.dt;
          if (res.ld54GameState.playerOxygen <= 0) {
            res.ld54GameState.status = GameStatus.Defeat;
          }
        }
      }

      // have we reached the end of the path and won?

      const path = EM.filterEntities([SpacePathDef])[0];
      if (path) {
        const distanceToEnd = vec3.dist(
          res.party.pos,
          path.spacePath.path[path.spacePath.path.length - 1].pos
        );
        if (distanceToEnd <= 0.1) {
          res.ld54GameState.status = GameStatus.Victory;
        }
      }

      res.text.upperText = `player o2: ${res.ld54GameState.playerOxygen.toFixed(
        0
      )} | ship o2: ${res.ld54GameState.oxygen.toFixed(
        0
      )} fuel: ${res.ld54GameState.fuel.toFixed(0)}`;
    }
  );

  EM.addSystem(
    "updateBubble",
    Phase.PRE_GAME_PLAYERS,
    [BubbleDef],
    [LD54GameStateDef, RendererDef, TimeDef],
    (es, res) => {
      // other systems will use this to determine that the game has ended, or add to it when oxygen is delivered
      const bubbleRadius = res.ld54GameState.bubbleRadius;
      res.renderer.renderer.updateScene({
        bubbleRadius,
      });

      for (let e of es) {
        EM.set(e, ScaleDef, [bubbleRadius, bubbleRadius, bubbleRadius]);
      }
    }
  );
});