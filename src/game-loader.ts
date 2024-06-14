import { assert } from "./utils/util-no-import.js";

export interface GameReg {
  name: string;
  init: () => Promise<void>;
}

export type GameLoader = ReturnType<typeof createGameLoader>;
export const GAME_LOADER: GameLoader = createGameLoader();

function createGameLoader() {
  const gameRegistry: Record<string, GameReg> = {};
  let _lastGameStarted: string | undefined = undefined;

  function getAvailableGameNames(): string[] {
    return Object.keys(gameRegistry);
  }
  function registerGame(reg: GameReg) {
    gameRegistry[reg.name] = reg;
    return reg;
  }
  function startGame(name: string) {
    const reg = gameRegistry[name];
    assert(
      reg,
      `Invalid game name "${name}".\n Possible names are:\n${getAvailableGameNames().join(
        "\n"
      )}`
    );

    _lastGameStarted = name;

    reg.init();
  }
  function getGameName() {
    return _lastGameStarted;
  }

  return {
    registerGame,
    startGame,
    getGameName,
    getAvailableGameNames,
  };
}
