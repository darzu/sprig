import { EM } from "../entity-manager.js";

export enum GameState {
  LOBBY,
  PLAYING,
  GAMEOVER,
}

export const GameStateDef = EM.defineComponent("gameState", () => {
  return { state: GameState.LOBBY };
});

EM.registerSerializerPair(
  GameStateDef,
  (gameState, buf) => buf.writeUint8(gameState.state),
  (gameState, buf) => (gameState.state = buf.readUint8())
);
