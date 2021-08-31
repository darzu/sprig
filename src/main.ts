import {
    mkRenderable, legacyCodeTree, CornerShapes
} from "./legacy-block-ast.js";
import * as draw from "./draw.js";
import { pathToSvg, setPos } from "./draw.js";
import { emitBlocks } from "./resize.js";
import { ajax, setStyle } from "./util.js";
import * as bast from "./bast.js";
import { pxtColors } from "./color.js";
import { getBarsBottom, makeAllColorBars } from "./color-bars.js";
import { compileTs } from "./ts-host.js";
//// <reference path="./ext/typescript.d.ts" />

document.addEventListener('DOMContentLoaded', main, false);

async function main() {
    const perfMainStart = performance.now()
    // getJson("/blocks/sprite_defs_original.json", (status, blocksRaw) => {
    //   console.log("sprite_defs")
    //   console.log("#########")
    //   console.log(JSON.stringify(blocksRaw.map(trimDef)))
    //   // copy-paste output into /blocks/sprite_defs.json
    //   console.log("#########")
    // })

    // tryLoadSampleBlocks();

    console.log("loaded DOM")

    // let newDefs = x

    // TODO add to:
    // codeTree
    // runSampleBlocks()

    // // sampleTranspile()
    try {
        const maints = await ajax.getText('./samples/things.ts')
        // const maints = await ajax.getText('./samples/log.ts')
        codeTree = await compileTs(maints)
        refreshCode()
    } catch (e) {
        console.log(e)

    }

    console.log("loaded DOM2")

    // playing with colors:
    makeAllColorBars();

    // code render
    refreshCode()

    // perf
    const perfMainEnd = performance.now()
    const mainMs = perfMainEnd - perfMainStart
    const mainS = mainMs / 1000;
    console.log(`Main seconds: ${mainS.toPrecision(2)}`)
}

window.addEventListener("click", function (ev) {
    console.log(`(${ev.x}, ${ev.y})`);
})

console.log("loaded main 2")

// TODOs:
// [ ] default values for block definitions
// [ ] CSS based? https://news.ycombinator.com/item?id=20923792

// ========================================
// Sample
// ========================================

export let codeTree_tri_sizing: bast.Stmt[] = [
    {
        kind: "stmt",
        corner: "triangular",
        color: pxtColors["logic"],
        es: [
            {
                kind: "lbl",
                val: "if"
            },
            {
                kind: "exp",
                corner: "triangular",
                color: pxtColors["logic"],
                es: [
                    {
                        kind: "exp",
                        corner: "square",
                        color: pxtColors["logic"],
                        es: [
                            {
                                kind: "lbl",
                                val: "true"
                            },
                        ]
                    }
                ]
            },
        ]
    }
]
export let codeTree: bast.Stmt[] = [
    {
        kind: "multi",
        color: pxtColors["loops"],
        corner: "square",
        ess: [
            [
                {
                    kind: "lbl",
                    val: "if something"
                }
            ],
            [
                {
                    kind: "stmt",
                    corner: "square",
                    color: pxtColors["variables"],
                    es: [
                        {
                            kind: "lbl",
                            val: "Hello"
                        },
                        {
                            kind: "exp",
                            corner: "triangular",
                            color: pxtColors["location"],
                            es: [
                                {
                                    kind: "lbl",
                                    val: "outer"
                                },
                                {
                                    kind: "exp",
                                    corner: "circular",
                                    color: pxtColors["functions"],
                                    es: [
                                        {
                                            kind: "lbl",
                                            val: "inner"
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            kind: "lbl",
                            val: "world!"
                        },
                    ]
                },
                {
                    kind: "stmt",
                    corner: "square",
                    color: pxtColors["variables"],
                    es: [
                        {
                            kind: "lbl",
                            val: "Foobar"
                        },
                    ]
                }
            ],
        ]
    }
    ,

    {
        kind: "stmt",
        corner: "square",
        color: pxtColors["sprites"],
        es: [
            {
                kind: "lbl",
                val: "Hello"
            },
            {
                kind: "exp",
                corner: "circular",
                color: pxtColors["music"],
                es: [
                    {
                        kind: "lbl",
                        val: "boo :)"
                    }
                ]
            },
            {
                kind: "lbl",
                val: "world!"
            },
        ]
    }
]

export let world = <SVGSVGElement><unknown>document.getElementById("world");

// WORD WRAP BAR
// ========================================
let wwMaxWidth = 600;
namespace ww {
    let W = 7
    let H = world.height.baseVal.value - W * 4
    let wwPath = (x: number) => `m ${x},${W * 2} q 0,-${W} ${W},-${W} q ${W},0 ${W},${W} v ${H} q 0,${W} -${W},${W} q -${W},0 -${W},-${W} Z`
    const wwBar = pathToSvg(wwPath(wwMaxWidth))
    setStyle(wwBar, {
        cursor: "move",
        fill: "grey"
    })
    world.appendChild(wwBar)

    wwBar.addEventListener('mousedown', startDrag);
    world.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    // wwBar.addEventListener('mouseleave', endDrag);
    let dragging = false
    function startDrag(ev: MouseEvent) {
        // console.log("drag start")
        dragging = true
    }
    function drag(ev: MouseEvent) {
        // console.log("mv")
        if (dragging) {
            let x = Math.round(ev.clientX - 28 - W)
            if (x != wwMaxWidth) {
                wwMaxWidth = x - W
                refreshCode()
            }
            wwBar.setAttribute("d", wwPath(x))
        }
    }
    function endDrag(ev: MouseEvent) {
        // console.log("drag end")
        dragging = false
    }
}
// ========================================
// END WW

let rSvg: SVGElement;
export function refreshCode() {
    if (rSvg)
        world.removeChild(rSvg)
    let renderableTree2 = mkRenderable(legacyCodeTree, wwMaxWidth - 50)
    // let renderableTree2 = emitBlocks(codeTree, wwMaxWidth - 50)
    // TODO @darzu: :
    // let renderableTree = renderableTree2
    // console.dir(renderableTree)
    // console.log(JSON.stringify(renderableTree))
    // TODO(dz): update without full replacement

    const startY = getBarsBottom() + 50;

    rSvg = draw.render(renderableTree2)
    setPos(rSvg, 50, startY)
    world.appendChild(rSvg)

    let h = renderableTree2.size.y
    let hAndBuff = h + startY + 100
    resizeWorld(hAndBuff)
}

function resizeWorld(height: number) {
    world.setAttribute("viewBox", `0 0 640 ${height}`)

}

// EXPERIMENT
// ========================================

window.addEventListener("click", function (ev) {
    console.log(`(${ev.x}, ${ev.y})`);
})
