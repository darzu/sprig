import { EM } from "./ecs/ecs.js";
import { GAME_INIT, GAME_NAMES } from "./main.js";
import { assert } from "./utils/util-no-import.js";
import { WebNavDef } from "./web/webnav.js";

export async function startGameBasedOnURLHash() {
  const { webNav } = await EM.whenResources(WebNavDef);
  const gameName = webNav.getHash();
  const gameInit = GAME_INIT[gameName];
  assert(
    gameInit,
    `Invalid game name from hash "${gameName}".\n Possible names are:\n${GAME_NAMES.join(
      "\n"
    )}`
  );
  gameInit();
}
