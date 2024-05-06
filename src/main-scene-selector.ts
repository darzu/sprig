import { EM } from "./ecs/ecs.js";
import { GAME_LOADER } from "./game-loader.js";
import { assert } from "./utils/util-no-import.js";
import { WebNavDef } from "./web/webnav.js";

export async function main_sceneSelector() {
  startGameBasedOnURLHash();

  const linksTreeId = "linksTree";
  const linksTree = document.getElementById(
    linksTreeId
  ) as HTMLDivElement | null;
  assert(linksTree, `requires <div id="${linksTreeId}">`);

  const createGameLink = (gameName: string) => {
    const aEl = document.createElement("a");
    const destUrl = `#${gameName}`;
    aEl.setAttribute("href", destUrl);
    aEl.textContent = gameName;
    aEl.onclick = () => {
      window.location.assign(destUrl);
      window.location.reload();
    };
    return aEl;
  };

  linksTree.textContent = ""; // clear all children: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
  for (let name of GAME_LOADER.getAvailableGameNames()) {
    linksTree.appendChild(createGameLink(name));
  }
}

export async function startGameBasedOnURLHash() {
  const { webNav } = await EM.whenResources(WebNavDef);
  const gameName = webNav.getHash();
  GAME_LOADER.startGame(gameName);
}
