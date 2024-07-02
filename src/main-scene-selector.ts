import { EM } from "./ecs/ecs.js";
import { GAME_LOADER, GameReg } from "./game-loader.js";
import { gameRegs } from "./main.js";
import { assert } from "./utils/util-no-import.js";
import { mkEl } from "./web/html-builder.js";
import {
  WebNavDef,
  getWebLocationHash,
  getWebQueryString,
} from "./web/webnav.js";

// TODO(@darzu): add a github code link for each game

export const showcaseGameRegs = [
  gameRegs.shipyard,
  gameRegs.painterly,
  gameRegs.particles,
  gameRegs.mp,
  // TODO(@darzu): FIX AND SHOW THESE GAMES!
  // TODO(@darzu): TOP PRIORITY:
  // gameRegs.mp,
  // gameRegs["graybox-ship-arena"],
  // gameRegs.hyperspace,
  // TODO(@darzu): mid priority:
  // gameRegs.font,
  // gameRegs.gallery,
  // gameRegs.modeling,
];

// prettier-ignore
const externalLinks = {
  "Ludum Dare 54": "https://ldjam.com/events/ludum-dare/54/space-knight",
  "Ludum Dare 53": "https://ldjam.com/events/ludum-dare/53/blockade-runner",
  "Ludum Dare 52": "https://ldjam.com/events/ludum-dare/52/purple-grain-sailors",
  "Ludum Dare 51": "https://ldjam.com/events/ludum-dare/51/darkstar-sailor",
  "Ludum Dare 50": "https://ldjam.com/events/ludum-dare/50/gemship-wars",
};

export async function main_sceneSelector() {
  let gameKey = getWebLocationHash();
  // HACK: doing the location assign on blank load is triggering the event listener below. Skip one reload.
  let _hack_oneChangeIgnore = false;

  if (!gameKey) {
    gameKey = showcaseGameRegs[0].key;
    _hack_oneChangeIgnore = true;
    window.location.assign(`#${showcaseGameRegs[0].key}`);
  }

  window.addEventListener("hashchange", () => {
    if (_hack_oneChangeIgnore) {
      _hack_oneChangeIgnore = false;
      return;
    }

    // console.log("hash: " + window.location.hash);
    window.location.reload(); // TODO(@darzu): would be great to not reload
  });

  if (gameKey === "about") {
    // TODO(@darzu): HACK.
    showAboutPage();
  } else {
    GAME_LOADER.startGame(gameKey);
  }

  const linksTreeId = "linksTree";
  const linksTree = document.getElementById(
    linksTreeId
  ) as HTMLDivElement | null;
  if (linksTree) {
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

    const createExternalLink = (displayName: string, destUrl: string) => {
      const aEl = document.createElement("a");
      aEl.setAttribute("href", destUrl);
      aEl.setAttribute("target", "_blank");
      aEl.textContent = `${displayName}`;
      return aEl;
    };

    linksTree.textContent = ""; // clear all children: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
    // for (let name of GAME_LOADER.getAvailableGameNames()) {
    for (let reg of showcaseGameRegs) {
      linksTree.appendChild(createGameLink(reg));
    }
    for (let [name, url] of Object.entries(externalLinks)) {
      linksTree.appendChild(createExternalLink(name, url));
    }
  }
}

function showAboutPage() {
  const aEl = document.getElementById("aboutLink")!;
  aEl.classList.add("active");
  // TODO(@darzu):

  const canvasHolderEl = document.getElementsByClassName(
    "canvasHolder"
  )[0] as HTMLDivElement;
  for (let child of canvasHolderEl.children)
    child.setAttribute("style", "display:none;");

  const aboutDivEl = document.getElementById("aboutDiv")! as HTMLDivElement;
  aboutDivEl.removeAttribute("style");
}
