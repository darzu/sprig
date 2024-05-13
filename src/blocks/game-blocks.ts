import { GAME_LOADER } from "../game-loader.js";
import { emitBlocks } from "./blocks-resize.js";
import { codeTree } from "./sample-blocks.js";
import { getBarsBottom, makeAllColorBars } from "./color-bars.js";
import { pathToSvgDom, domSetPos, setStyle } from "../utils/util-dom.js";
import { BDraw } from "./blocks-draw.js";

GAME_LOADER.registerGame({ name: "blocks", init: initBlocksGame });

export async function initBlocksGame() {
  // TODO(@darzu): IMPL
  console.log("hello blocks!");

  const perfMainStart = performance.now();

  try {
    // refreshCode();
  } catch (e) {
    console.log(e);
  }

  console.log("loaded DOM2");

  // playing with colors:
  makeAllColorBars();

  // code render
  refreshCode();

  // perf
  const perfMainEnd = performance.now();
  const mainMs = perfMainEnd - perfMainStart;
  const mainS = mainMs / 1000;
  console.log(`Main seconds: ${mainS.toPrecision(2)}`);

  createWordWrapBar();
}

export let world = <SVGSVGElement>(<unknown>document.getElementById("world"));

// WORD WRAP BAR
// ========================================
let wwMaxWidth = 600;
function createWordWrapBar() {
  let W = 7;
  let H = world.height.baseVal.value - W * 4;
  let wwPath = (x: number) =>
    `m ${x},${
      W * 2
    } q 0,-${W} ${W},-${W} q ${W},0 ${W},${W} v ${H} q 0,${W} -${W},${W} q -${W},0 -${W},-${W} Z`;
  const wwBar = pathToSvgDom(wwPath(wwMaxWidth));
  setStyle(wwBar, {
    cursor: "move",
    fill: "grey",
  });
  world.appendChild(wwBar);

  wwBar.addEventListener("mousedown", startDrag);
  world.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", endDrag);
  // wwBar.addEventListener('mouseleave', endDrag);
  let dragging = false;
  function startDrag(ev: MouseEvent) {
    // console.log("drag start")
    dragging = true;
  }
  function drag(ev: MouseEvent) {
    // console.log("mv")
    if (dragging) {
      let x = Math.round(ev.clientX - 28 - W);
      if (x != wwMaxWidth) {
        wwMaxWidth = x - W;
        refreshCode();
      }
      wwBar.setAttribute("d", wwPath(x));
    }
  }
  function endDrag(ev: MouseEvent) {
    // console.log("drag end")
    dragging = false;
  }
}
// ========================================
// END WW

let rSvg: SVGElement;
export function refreshCode() {
  if (rSvg) world.removeChild(rSvg);
  let renderableTree2 = emitBlocks(codeTree, wwMaxWidth - 50);
  // TODO @darzu: :
  // let renderableTree = renderableTree2
  // console.dir(renderableTree)
  // console.log(JSON.stringify(renderableTree))
  // TODO(dz): update without full replacement

  const startY = getBarsBottom() + 50;

  rSvg = BDraw.render(renderableTree2);
  domSetPos(rSvg, 50, startY);
  world.appendChild(rSvg);

  let h = renderableTree2.size.y;
  let hAndBuff = h + startY + 100;
  resizeWorld(hAndBuff);
}

function resizeWorld(height: number) {
  world.setAttribute("viewBox", `0 0 640 ${height}`);
}
