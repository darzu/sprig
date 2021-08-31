import {
    BlockCategory, BlockLook, CornerShape
} from "./legacy-block-ast.js"
import { add, even, Sized, max, V2, sum } from "../math.js"
import * as bast from "./bast.js"
import { never } from "../util.js";
import { Color, HSL, RGB } from "./color.js";

// TODO: rework this to be bast-to-sized-bast or something less verbose. Or call it "resizer"
/*
tast: Typescript AST
bast: Blocks AST
sast: Sized AST
rast: Renderable AST
*/

export const WRAP_INDENT = 8;
export const INNER_W_M = 8;
export const INNER_H_M = 4;
export const CHAR_H = 16;
export const CHAR_W = 9.6;
export const NODE_SPACER = CHAR_W;
export const MOUTH_INDENT = WRAP_INDENT * 2;
export const MIN_WIDTH = 12;
// export const MIN_WIDTH = 164; // TODO: why was this set to 164?
export const LABEL_MARGIN = 12;
export const STACK_GAP = 12;
// TODO: handle non-fixed size fonts
// TODO: calibrate numbers


// renderable
type Line<T> = { nodes: T[], size: V2 }
export interface RenderableSection {
    lines: Line<Renderable>[],
    // inner size
    innerSize: V2, // TODO: currently unused
    outerSize: V2,
    kind: "wrap" | "mouth"
}
export interface RenderableBlockLook {
    corner: CornerShape,
    // category: BlockCategory,
    color: Color,
    look: BlockLook,
    size: V2
}
export interface RenderableBlock extends RenderableBlockLook {
    kind: "block",
    // outer size
    sections: RenderableSection[],
}
export interface RenderableLabel {
    kind: "label",
    // outer size
    size: V2,
    text: string
}
export interface RenderableDropdown extends RenderableBlockLook {
    kind: "dropdown",
    // outer size
    text: string
}
export interface RenderableStack {
    kind: "stack",
    size: V2,
    children: Renderable[],
}
// TODO: add more renderable terminals like image, etc
export type Renderable = RenderableBlock | RenderableLabel | RenderableDropdown | RenderableStack

export function wrapNodes<T extends Sized>(nodes: T[], maxWidth: number): Line<T>[] {
    let lines: Line<T>[] = []

    let currLine: Line<T> = {
        nodes: [],
        size: { x: 0, y: 0 }
    }
    for (let n of nodes) {
        let { x: w, y: h } = n.size;

        let proposedLineAdd = (currLine.size.x > 0 ? NODE_SPACER : 0) + w
        if (currLine.size.x + proposedLineAdd > maxWidth && currLine.size.x > 0) {
            // line break
            // console.log("LINE BREAK!") // TODO
            lines.push(currLine)

            // new line
            currLine = {
                nodes: [n],
                size: { x: WRAP_INDENT + w, y: h }
            }
        } else {
            // add to line
            currLine.nodes.push(n)
            currLine.size.x += proposedLineAdd;
            currLine.size.y = Math.max(currLine.size.y, h);
        }
    }

    lines.push(currLine)

    return lines;
}
export function sizeOfText(txt: string): V2 {
    return { x: CHAR_W * txt.length, y: CHAR_H }
}

function emitLbl(txt: string): Renderable {
    return {
        kind: "label",
        text: txt,
        size: add(sizeOfText(txt), { x: 0, y: LABEL_MARGIN * 2 })
    }
}
function emitStr(e: bast.StrLit): Renderable {
    return {
        kind: "label",
        text: e.val,
        size: add(sizeOfText(e.val), { x: 0, y: LABEL_MARGIN * 2 })
    }
}

function emitExpOrStmtBlock(exp: bast.ExpBlock | bast.StmtBlock, maxWidth: number): Renderable {
    // let maxBlockChildWidth = maxWidth - WRAP_INDENT;

    // sectionArgs = [codeTree.args.map(v => mkRenderable(v, maxBlockChildWidth))]

    const section = emitExpList(exp.es, maxWidth);
    // TODO @darzu: support multiple sections
    const sections = [section];

    // determine outer size
    let width = Math.max(...sections.map(s => s.outerSize.x))
    let height = sections
        .map(s => s.outerSize.y)
        .reduce((p, n) => p + n, 0)

    let look: BlockLook = exp.kind === "stmt" ? "statement" : "norm_exp";

    // finalize
    return {
        kind: "block",
        corner: exp.corner,
        sections: [section],
        color: exp.color,
        look,
        size: { x: width, y: height }
    }
}

function emitExp(e: bast.Exp, maxWidth: number): Renderable {
    if (e.kind === "bool")
        return emitLbl(`(${e.val})`)
    else if (e.kind === "num")
        return emitLbl(`(${e.val})`)
    else if (e.kind === "str")
        return emitStr(e)
    else if (e.kind === "exp") {
        return emitExpOrStmtBlock(e, maxWidth)
    } else if (e.kind === "lbl") {
        return emitLbl(e.val)
    }
    never(e);
}

function emitStmtList(es: bast.StmtBlock[], maxWidth: number): RenderableSection {
    let maxMouthChildWidth = maxWidth - MOUTH_INDENT;

    let rs = es.map(e => emitExpOrStmtBlock(e, maxMouthChildWidth))

    let lines = rs.map(a => ({ nodes: [a], size: a.size }))
    let innerW = max(rs.map(a => a.size.x))
    let innerH = sum(lines.map(a => a.size.y))

    let outerW = Math.min(
        Math.max(
            innerW + INNER_W_M * 2 + MOUTH_INDENT,
            MIN_WIDTH
        ),
        maxWidth
    )

    return {
        kind: "mouth",
        innerSize: { x: innerW, y: innerH },
        outerSize: { x: outerW, y: innerH },
        lines: lines
    }
}

function emitMulti(e: bast.MultiStmt, maxWidth: number): Renderable {
    // TODO(@darzu): 
    let sections = e.ess.map(es => bast.isStmtList(es) ? emitStmtList(es, maxWidth) : emitExpList(es, maxWidth))

    // add an end cap if it's missing
    if (even(sections.length)) { // TODO(@darzu): seems like a heuristic..
        let innerSize: V2 = { x: 0, y: 16 + 8 }
        sections.push({
            lines: [],
            innerSize,
            outerSize: add(innerSize, { x: INNER_W_M * 2, y: INNER_H_M * 2 }),
            kind: "wrap"
        })
    }

    // determine outer size
    let width = Math.max(...sections.map(s => s.outerSize.x))
    let height = sections
        .map(s => s.outerSize.y)
        .reduce((p, n) => p + n, 0)

    // TODO(@darzu): hue, etc.
    let look: BlockLook = e.ess?.length === 1 ? "event" : "statement";

    // finalize
    return {
        kind: "block",
        corner: e.corner,
        sections: sections,
        color: e.color,
        look,
        size: { x: width, y: height }
    }
}

function emitExpList(es: bast.Exp[], maxWidth: number): RenderableSection {
    let maxChildWidth = maxWidth - WRAP_INDENT;

    const nodes = es.map(e => emitExp(e, maxChildWidth));

    let lines = wrapNodes(nodes, maxWidth - INNER_W_M * 2);

    let innerW = max(lines.map(l => l.size.x))
    let innerH = sum(lines.map(l => l.size.y))
    let innerSize: V2 = { x: innerW, y: innerH }

    let outerW = Math.min(
        Math.max(
            innerW + INNER_W_M * 2,
            MIN_WIDTH
        ),
        maxWidth
    )

    return {
        kind: "wrap",
        innerSize,
        outerSize: { x: outerW, y: innerH + INNER_H_M * 2 },
        lines: lines,
    }
}

export function emitBlock(block: bast.Block, maxWidth: number): Renderable {
    if (block.kind === "multi")
        return emitMulti(block, maxWidth)
    return emitExpOrStmtBlock(block, maxWidth)
}

export function emitBlocks(es: bast.Stmt[], maxWidth: number): RenderableStack {
    const rs = es.map(e => e.kind === "multi" ? emitMulti(e, maxWidth) : emitExpOrStmtBlock(e, maxWidth));
    const height = rs.map(r => r.size.y).reduce((p, n) => p ? p + n + STACK_GAP : n, 0)
    const width = max(rs.map(r => r.size.x))
    return {
        kind: "stack",
        children: rs,
        size: { x: width, y: height }
    }
}