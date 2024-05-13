import { Color, HSL, RGB } from "../color/color.js";
import { bast } from "./bast.js";
import { never } from "../utils/util-no-import.js";
import { even, max, sum } from "../utils/math.js";

// types
export type _XY = { x: number; y: number };
export interface Sized {
  size: _XY;
}

// TODO(@darzu): remove
function add(a: _XY, b: _XY): _XY {
  return { x: a.x + b.x, y: a.y + b.y };
}

// TODO: rework this to be bast-to-sized-bast or something less verbose. Or call it "resizer"
/*
tast: Typescript AST
bast: Blocks AST
sast: Sized AST
rast: Renderable AST
*/

type BlockLook = "event" | "statement" | "norm_exp" | "bool_exp";

const WRAP_INDENT = 8;
export const B_INNER_W_M = 8;
export const B_INNER_H_M = 4;
const CHAR_H = 16;
export const B_CHAR_W = 9.6;
export const B_NODE_SPACER = B_CHAR_W;
export const B_MOUTH_INDENT = WRAP_INDENT * 2;
const MIN_WIDTH = 12;
// export const MIN_WIDTH = 164; // TODO: why was this set to 164?
const LABEL_MARGIN = 12;
export const B_STACK_GAP = 12;
// TODO: handle non-fixed size fonts
// TODO: calibrate numbers

// renderable
type BLine<T> = { nodes: T[]; size: _XY };
export interface BRenderableSection {
  lines: BLine<BRenderable>[];
  // inner size
  innerSize: _XY; // TODO: currently unused
  outerSize: _XY;
  kind: "wrap" | "mouth";
}
export interface BRenderableBlockLook {
  corner: bast.CornerShape;
  // category: BlockCategory,
  color: Color;
  look: BlockLook;
  size: _XY;
}
export interface BRenderableBlock extends BRenderableBlockLook {
  kind: "block";
  // outer size
  sections: BRenderableSection[];
}
export interface BRenderableLabel {
  kind: "label";
  // outer size
  size: _XY;
  text: string;
}
export interface BRenderableDropdown extends BRenderableBlockLook {
  kind: "dropdown";
  // outer size
  text: string;
}
export interface BRenderableStack {
  kind: "stack";
  size: _XY;
  children: BRenderable[];
}
// TODO(@darzu): RENAME!
// TODO: add more renderable terminals like image, etc
export type BRenderable =
  | BRenderableBlock
  | BRenderableLabel
  | BRenderableDropdown
  | BRenderableStack;

export function wrapNodes<T extends Sized>(
  nodes: T[],
  maxWidth: number
): BLine<T>[] {
  let lines: BLine<T>[] = [];

  let currLine: BLine<T> = {
    nodes: [],
    size: { x: 0, y: 0 },
  };
  for (let n of nodes) {
    let { x: w, y: h } = n.size;

    let proposedLineAdd = (currLine.size.x > 0 ? B_NODE_SPACER : 0) + w;
    if (currLine.size.x + proposedLineAdd > maxWidth && currLine.size.x > 0) {
      // line break
      // console.log("LINE BREAK!") // TODO
      lines.push(currLine);

      // new line
      currLine = {
        nodes: [n],
        size: { x: WRAP_INDENT + w, y: h },
      };
    } else {
      // add to line
      currLine.nodes.push(n);
      currLine.size.x += proposedLineAdd;
      currLine.size.y = Math.max(currLine.size.y, h);
    }
  }

  lines.push(currLine);

  return lines;
}
export function sizeOfText(txt: string): _XY {
  return { x: B_CHAR_W * txt.length, y: CHAR_H };
}

function emitLbl(txt: string): BRenderable {
  return {
    kind: "label",
    text: txt,
    size: add(sizeOfText(txt), { x: 0, y: LABEL_MARGIN * 2 }),
  };
}
function emitStr(e: bast.StrLit): BRenderable {
  return {
    kind: "label",
    text: e.val,
    size: add(sizeOfText(e.val), { x: 0, y: LABEL_MARGIN * 2 }),
  };
}

function emitExpOrStmtBlock(
  exp: bast.ExpBlock | bast.StmtBlock,
  maxWidth: number
): BRenderable {
  // let maxBlockChildWidth = maxWidth - WRAP_INDENT;

  // sectionArgs = [codeTree.args.map(v => mkRenderable(v, maxBlockChildWidth))]

  const section = emitExpList(exp.es, maxWidth);
  // TODO @darzu: support multiple sections
  const sections = [section];

  // determine outer size
  let width = Math.max(...sections.map((s) => s.outerSize.x));
  let height = sections.map((s) => s.outerSize.y).reduce((p, n) => p + n, 0);

  let look: BlockLook = exp.kind === "stmt" ? "statement" : "norm_exp";

  // finalize
  return {
    kind: "block",
    corner: exp.corner,
    sections: [section],
    color: exp.color,
    look,
    size: { x: width, y: height },
  };
}

function emitExp(e: bast.Exp, maxWidth: number): BRenderable {
  if (e.kind === "bool") return emitLbl(`(${e.val})`);
  else if (e.kind === "num") return emitLbl(`(${e.val})`);
  else if (e.kind === "str") return emitStr(e);
  else if (e.kind === "exp") {
    return emitExpOrStmtBlock(e, maxWidth);
  } else if (e.kind === "lbl") {
    return emitLbl(e.val);
  }
  never(e);
}

function emitStmtList(
  es: bast.StmtBlock[],
  maxWidth: number
): BRenderableSection {
  let maxMouthChildWidth = maxWidth - B_MOUTH_INDENT;

  let rs = es.map((e) => emitExpOrStmtBlock(e, maxMouthChildWidth));

  let lines = rs.map((a) => ({ nodes: [a], size: a.size }));
  let innerW = max(rs.map((a) => a.size.x));
  let innerH = sum(lines.map((a) => a.size.y));

  let outerW = Math.min(
    Math.max(innerW + B_INNER_W_M * 2 + B_MOUTH_INDENT, MIN_WIDTH),
    maxWidth
  );

  return {
    kind: "mouth",
    innerSize: { x: innerW, y: innerH },
    outerSize: { x: outerW, y: innerH },
    lines: lines,
  };
}

function emitMulti(e: bast.MultiStmt, maxWidth: number): BRenderable {
  // TODO(@darzu):
  let sections = e.ess.map((es) =>
    bast.isStmtList(es) ? emitStmtList(es, maxWidth) : emitExpList(es, maxWidth)
  );

  // add an end cap if it's missing
  if (even(sections.length)) {
    // TODO(@darzu): seems like a heuristic..
    let innerSize: _XY = { x: 0, y: 16 + 8 };
    sections.push({
      lines: [],
      innerSize,
      outerSize: add(innerSize, { x: B_INNER_W_M * 2, y: B_INNER_H_M * 2 }),
      kind: "wrap",
    });
  }

  // determine outer size
  let width = Math.max(...sections.map((s) => s.outerSize.x));
  let height = sections.map((s) => s.outerSize.y).reduce((p, n) => p + n, 0);

  // TODO(@darzu): hue, etc.
  let look: BlockLook = e.ess?.length === 1 ? "event" : "statement";

  // finalize
  return {
    kind: "block",
    corner: e.corner,
    sections: sections,
    color: e.color,
    look,
    size: { x: width, y: height },
  };
}

function emitExpList(es: bast.Exp[], maxWidth: number): BRenderableSection {
  let maxChildWidth = maxWidth - WRAP_INDENT;

  const nodes = es.map((e) => emitExp(e, maxChildWidth));

  let lines = wrapNodes(nodes, maxWidth - B_INNER_W_M * 2);

  let innerW = max(lines.map((l) => l.size.x));
  let innerH = sum(lines.map((l) => l.size.y));
  let innerSize: _XY = { x: innerW, y: innerH };

  let outerW = Math.min(
    Math.max(innerW + B_INNER_W_M * 2, MIN_WIDTH),
    maxWidth
  );

  return {
    kind: "wrap",
    innerSize,
    outerSize: { x: outerW, y: innerH + B_INNER_H_M * 2 },
    lines: lines,
  };
}

export function emitBlock(block: bast.Block, maxWidth: number): BRenderable {
  if (block.kind === "multi") return emitMulti(block, maxWidth);
  return emitExpOrStmtBlock(block, maxWidth);
}

export function emitBlocks(
  es: bast.Stmt[],
  maxWidth: number
): BRenderableStack {
  const rs = es.map((e) =>
    e.kind === "multi"
      ? emitMulti(e, maxWidth)
      : emitExpOrStmtBlock(e, maxWidth)
  );
  const height = rs
    .map((r) => r.size.y)
    .reduce((p, n) => (p ? p + n + B_STACK_GAP : n), 0);
  const width = max(rs.map((r) => r.size.x));
  return {
    kind: "stack",
    children: rs,
    size: { x: width, y: height },
  };
}
