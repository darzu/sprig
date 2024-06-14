import { EM } from "./ecs/ecs.js";
import { GAME_LOADER } from "./game-loader.js";
import { showcaseGameRegs } from "./main.js";
import { assert } from "./utils/util-no-import.js";
import { WebNavDef } from "./web/webnav.js";

export async function main_sceneSelector() {
  window.onhashchange = () => {
    // console.log("hash: " + window.location.hash);
    window.location.reload(); // TODO(@darzu): would be great to not reload
  };

  (async () => {
    const { webNav } = await EM.whenResources(WebNavDef);
    const gameName = webNav.getHash();
    GAME_LOADER.startGame(gameName);
  })();

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
    };
    return aEl;
  };

  linksTree.textContent = ""; // clear all children: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
  // for (let name of GAME_LOADER.getAvailableGameNames()) {
  for (let reg of showcaseGameRegs) {
    linksTree.appendChild(createGameLink(reg.name));
  }
}
