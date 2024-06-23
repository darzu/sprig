import { EM } from "./ecs/ecs.js";
import { GAME_LOADER, GameReg } from "./game-loader.js";
import { showcaseGameRegs } from "./main.js";
import { assert } from "./utils/util-no-import.js";
import { WebNavDef, getWebLocationHash } from "./web/webnav.js";

export async function main_sceneSelector() {
  window.addEventListener("hashchange", () => {
    // console.log("hash: " + window.location.hash);
    window.location.reload(); // TODO(@darzu): would be great to not reload
  });

  const gameKey = getWebLocationHash();
  GAME_LOADER.startGame(gameKey);

  const linksTreeId = "linksTree";
  const linksTree = document.getElementById(
    linksTreeId
  ) as HTMLDivElement | null;
  assert(linksTree, `requires <div id="${linksTreeId}">`);

  const createGameLink = (reg: GameReg) => {
    const aEl = document.createElement("a");
    const destUrl = `#${reg.key}`;
    aEl.setAttribute("href", destUrl);
    aEl.textContent = reg.displayName;
    aEl.onclick = () => {
      window.location.assign(destUrl);
    };
    if (gameKey === reg.key) {
      aEl.classList.add("active");
    }
    return aEl;
  };

  linksTree.textContent = ""; // clear all children: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
  // for (let name of GAME_LOADER.getAvailableGameNames()) {
  for (let reg of showcaseGameRegs) {
    linksTree.appendChild(createGameLink(reg));
  }
}
