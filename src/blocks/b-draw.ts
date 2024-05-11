import { CornerShape } from "./b-bast.js";
import {
  clampHSL,
  clampLCH,
  Color,
  contrastClamp,
  parseHex,
  toHex,
  toHSL,
  toLCH,
  white,
} from "./b-color.js";
import { V2, max, Sized, clamp } from "./b-math.js";
import {
  INNER_H_M,
  INNER_W_M,
  MOUTH_INDENT,
  NODE_SPACER,
  Renderable,
  RenderableBlock,
  RenderableDropdown,
  RenderableStack,
  STACK_GAP,
} from "./b-resize.js";
import { edges, never, setStyle } from "./b-util.js";

// TODO: consider WebGL

const DBG_TXT = !!0;
const DBG_OUTLINES = !!0;
const CLAMP_COLORS = false;

/*
Sprite block:
  d="m 0,0 m 29,0 H 309.4296188354492 a 29 29 0 0 1 0 58 H 29 a 29 29 0 0 1 0 -58 z"
Image block:
  m 0,0 m 25,0 H 49 a 25 25 0 0 1 0 50 H 25 a 25 25 0 0 1 0 -50 z
Color block:
  m 0,0 m 16,0 H 24 a 16 16 0 0 1 0 32 H 16 a 16 16 0 0 1 0 -32 z
*/

// bezier curve corners
const l2tlBez = (r: number) => `q 0 -${r} ${r} -${r}`;
const t2trBez = (r: number) => `q ${r} 0 ${r} ${r}`;
const r2brBez = (r: number) => `q 0 ${r} -${r} ${r}`;
const r2blBez = (r: number) => `q 0 ${r} ${r} ${r}`;
const b2blBez = (r: number) => `q -${r} 0 -${r} -${r}`;
const b2tlBez = (r: number) => `q -${r} 0 -${r} ${r}`;

// arc corners
const l2tlArc = (r: number) => `a ${r} ${r} 0 0 1  ${r} -${r}`;
const t2trArc = (r: number) => `a ${r} ${r} 0 0 1  ${r}  ${r}`;
const r2brArc = (r: number) => `a ${r} ${r} 0 0 1 -${r}  ${r}`;
const r2blArc = (r: number) => `a ${r} ${r} 0 0 0  ${r}  ${r}`;
const b2blArc = (r: number) => `a ${r} ${r} 0 0 1 -${r} -${r}`;
const b2tlArc = (r: number) => `a ${r} ${r} 0 0 0 -${r}  ${r}`;

// triangular corners
//M 16,0  h 16 l 16,16 l -16,16 h -16 l -16,-16 l 16,-16 z
const l2tlTri = (r: number) => `l  ${r} -${r}`;
const t2trTri = (r: number) => `l  ${r}  ${r}`;
const r2brTri = (r: number) => `l -${r}  ${r}`;
const r2blTri = (r: number) => `l  ${r}  ${r}`;
const b2blTri = (r: number) => `l -${r} -${r}`;
const b2tlTri = (r: number) => `l -${r}  ${r}`;

// statement notch
const R = 4;
const r_d2 = R / 2;
const r_x3 = R * 3;
const NOTCH_W = /*ramp*/ (R + R + R) * 2 + /*plateau*/ r_x3;
const NOTCH_PAD = R * 2;
const l2rNotch = `q  ${r_d2},0  ${R},${r_d2} l  ${R},${R} q  ${r_d2},${r_d2}  ${R},${r_d2} h  ${r_x3} q  ${r_d2},0  ${R},-${r_d2} l  ${R},-${R} q  ${r_d2},-${r_d2}  ${R},-${r_d2}`;
const r2lNotch = `q -${r_d2},0 -${R},${r_d2} l -${R},${R} q -${r_d2},${r_d2} -${R},${r_d2} h -${r_x3} q -${r_d2},0 -${R},-${r_d2} l -${R},-${R} q -${r_d2},-${r_d2} -${R},-${r_d2}`;
const rightOfNotch = (w: number, r: number) => w - NOTCH_W - NOTCH_PAD - r * 2;

function topHelper(
  w: number,
  notch: boolean,
  fromMouth: boolean,
  r: number
): string {
  // overkill; for if not can't fit
  if (notch && w < NOTCH_W + NOTCH_PAD + r * 2 + (fromMouth ? MOUTH_INDENT : 0))
    notch = false;

  const leftRect = `${fromMouth ? "" : `m 0,${r}`} ${
    fromMouth ? r2blArc(r) : l2tlArc(r)
  }`;
  const roomForMouth = fromMouth ? MOUTH_INDENT : 0;
  const withNotch = `${leftRect} h ${NOTCH_PAD} ${l2rNotch} h ${
    rightOfNotch(w, r) - roomForMouth
  } ${t2trArc(r)}`;
  const withoutNotch = `${leftRect} h ${w - roomForMouth - r * 2} ${t2trArc(
    r
  )}`;
  // const top2 = `${r2blRect(r)} h ${NOTCH_PAD} ${l2rNotch} h ${right_of_notch(w, r) - mouthBarWidth} ${t2trCorn(r)}`
  return notch ? withNotch : withoutNotch;
}

function bottomHelper(
  w: number,
  notch: boolean,
  toMouth: boolean,
  r: number
): string {
  // if notch can't fit
  if (notch && w < NOTCH_W + NOTCH_PAD + r * 2 + (toMouth ? MOUTH_INDENT : 0))
    notch = false;

  const leftRect = toMouth ? b2tlArc(r) : b2blArc(r);
  const roomForMouth = toMouth ? MOUTH_INDENT : 0;
  const withNotch = `${r2brArc(r)} h -${
    rightOfNotch(w, r) - roomForMouth
  } ${r2lNotch} h -${NOTCH_PAD} ${leftRect}`;
  const withoutNotch = `${r2brArc(r)} h -${
    w - roomForMouth - r * 2
  } ${leftRect}`;
  return notch ? withNotch : withoutNotch;
}

function sideHelper(h: number, r: number): string {
  return `v ${h - 2 * r}`;
}

export interface Drawer {
  top(w: number, notch: boolean, fromMouth: boolean): string;
  bottom(w: number, notch: boolean, toMouth: boolean): string;
  side(h: number): string;
}

class RectDrawer implements Drawer {
  constructor(private r: number) {}
  top(w: number, notch: boolean, fromMouth: boolean): string {
    return topHelper(w, notch, fromMouth, this.r);
  }
  bottom(w: number, notch: boolean, toMouth: boolean): string {
    return bottomHelper(w, notch, toMouth, this.r);
  }
  side(h: number): string {
    return sideHelper(h, this.r);
  }
}

class CircDrawer implements Drawer {
  constructor(private r: number) {}
  top(w: number, notch: boolean, fromMouth: boolean): string {
    // TODO(dz): clean up APIs so this isn't a concern
    if (notch || fromMouth)
      console.error(
        "Illegal to call CircDrawer with notch=true or from/toMouth=true"
      );
    notch = false;
    fromMouth = false;

    let r = this.r;

    return `m 0,${r} ${l2tlArc(r)} h ${w - r * 2} ${t2trArc(r)}`;
  }
  bottom(w: number, notch: boolean, toMouth: boolean): string {
    let r = this.r;
    return `${r2brArc(r)} h -${w - r * 2} ${b2blArc(r)}`;
  }
  side(h: number): string {
    return sideHelper(h, this.r);
  }
}

class TriDrawer implements Drawer {
  constructor(private r: number) {}
  top(w: number, notch: boolean, fromMouth: boolean): string {
    // TODO(dz): clean up APIs so this isn't a concern
    if (notch || fromMouth)
      console.error(
        "Illegal to call CircDrawer with notch=true or from/toMouth=true"
      );
    notch = false;
    fromMouth = false;

    let r = this.r;

    return `m 0,${r} ${l2tlTri(r)} h ${w - r * 2} ${t2trTri(r)}`;
  }
  bottom(w: number, notch: boolean, toMouth: boolean): string {
    let r = this.r;
    return `${r2brTri(r)} h -${w - r * 2} ${b2blTri(r)}`;
  }
  side(h: number): string {
    return sideHelper(h, this.r);
  }
}

// TODO(dz): hmm this doesn't seem effecient, at least cache these
export const rect = new RectDrawer(4);
export const circ = (r: number) => new CircDrawer(r);
export const tri = (r: number) => new TriDrawer(r);

function renderLabel(r: { size: V2; text: string }): SVGTextElement {
  let h = r.size.y;
  let dy = h / 2;
  let s = document.createElementNS("http://www.w3.org/2000/svg", "text");
  s.setAttribute("dominant-baseline", "central");
  s.setAttribute("dy", dy.toString());
  s.textContent = r.text;
  return s;
}
function renderDropdown(r: RenderableDropdown): SVGGElement {
  // TODO(dz):
  let cornerHeight = r.size.y / 2;
  let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  let path = mkBlockSimplePath(r.size, r.corner, cornerHeight);
  let blk = pathToSvg(path);
  // TODO(@darzu):
  // blk.setAttribute("class", `${r.category}-block`);
  const { h, s, l } = toHSL(r.color);
  setStyle(blk, { fill: toHex(r.color), stroke: { h, s, l: l - 25 } });
  g.appendChild(blk);
  let lbl = renderLabel(r);
  g.appendChild(lbl);
  return g;
}

function mkBlockSimplePath(
  size: V2,
  cornerShape: CornerShape,
  cornerHeight?: number
): string {
  let drawer: Drawer = rect;
  if (cornerHeight) {
    if (cornerShape === "circular") drawer = circ(cornerHeight);
    else if (cornerShape === "triangular") drawer = tri(cornerHeight);
  }

  let path =
    drawer.top(size.x, false, false) +
    drawer.side(size.y) +
    drawer.bottom(size.x, false, false) +
    "Z";
  return path;
}
function mkBlockFullPath(r: RenderableBlock): string {
  let isStmt = r.look === "statement";
  let outerSectionSizes = r.sections.map((s) => ({ size: s.outerSize }));

  let w = Math.max(
    ...r.sections.filter((s) => s.kind === "wrap").map((s) => s.outerSize.x)
  );

  let drawer: Drawer;
  if (r.corner === "square") {
    drawer = rect;
  } else {
    // TODO(dz): make more efficient ?
    let maxH = max(
      r.sections.map((s) =>
        max(s.lines.map((l) => max(l.nodes.map((n) => n.size.y))))
      )
    );
    let rad = (maxH + INNER_H_M * 2) / 2;
    if (rad * 2 > r.size.x) rad = r.size.x / 2;
    if (r.corner === "circular") drawer = circ(rad);
    else if (r.corner === "triangular") drawer = tri(rad);
  }

  let es = edges(outerSectionSizes);
  let secs = es.map(([a, b], i) => {
    if (!a) return drawer.top(w, isStmt, false);
    let { size } = a;
    let { y: h } = size;
    let thisIsMouth = i % 2 == 0;
    let nextIsMouth = !!b && !thisIsMouth;
    return (
      drawer.side(h) +
      (thisIsMouth
        ? drawer.top(w, thisIsMouth, thisIsMouth)
        : drawer.bottom(w, isStmt || nextIsMouth, nextIsMouth))
    );
  });

  return secs.join() + "Z";
}

export function pathToSvg(d: string): SVGPathElement {
  let blk = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let path = d;
  blk.setAttribute("d", path);
  return blk;
}
export function setPos(e: SVGElement, x: number, y: number) {
  // TODO(dz): worried about perf, might prefer to use "M x,y" in path string
  // e.setAttribute("x", x.toString());
  // e.setAttribute("y", y.toString());
  e.setAttribute("transform", `translate(${x},${y})`);
}

function renderBlock(r: RenderableBlock): SVGGElement {
  // let absX = 0;
  // let absY = 0;
  let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  // setPos(g, absX, absY)

  let secs = r.sections instanceof Array ? r.sections : [r.sections];

  let outline = DBG_OUTLINES ? renderRect(r) : pathToSvg(mkBlockFullPath(r));

  let fillClr = toLCH(r.color);
  let strokeClr = toLCH(r.color);
  strokeClr.l -= 10;
  strokeClr = clampLCH(strokeClr);
  setStyle(outline, {
    fill: toHex(fillClr),
    stroke: toHex(strokeClr),
  });
  g.appendChild(outline);

  let secY = 0;
  for (let sec of secs) {
    let isMouth = sec.kind === "mouth";
    let linX = isMouth ? MOUTH_INDENT : INNER_W_M;
    let linY = secY + (isMouth ? 0 : INNER_H_M);
    for (let line of sec.lines) {
      let nodX = linX;
      let nodY = linY;
      for (let n of line.nodes) {
        // render
        let offY = (line.size.y - n.size.y) / 2;
        let cSvg = render(n);
        setPos(cSvg, nodX, nodY + offY);
        g.appendChild(cSvg);

        nodX += n.size.x + NODE_SPACER;
      }
      linY += line.size.y;
    }
    secY += sec.outerSize.y;
  }

  // let secX = 0
  // let secY = 0
  // for (let sec of secs) {
  //   let currLine = 0;
  //   let currLineHeight = sec.lineHeights[currLine];
  //   let pad = div(sub(sec.outerSize, sec.size), 2)
  //   let [childX, childY] = add([secX, secY], pad)
  //   for (let child of sec.nodes) {
  //     let cSvg = render(child)
  //     let [cw, ch] = child.size;
  //     let yOff = (currLineHeight / 2) - (ch / 2)
  //     setPos(cSvg, childX, childY + yOff)
  //     g.appendChild(cSvg)
  //     childX += cw + CHILD_W_M
  //   }
  //   secY += sec.outerSize.y
  // }
  return g;
}
function renderRect({ size: { x, y } }: Sized): SVGElement {
  return pathToSvg(`m 0,0 l ${x},0 l 0,${y} l -${x},0 l 0,-${y}`);
}
function renderStack(stack: RenderableStack): SVGGElement {
  let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  let absX = 0;
  let absY = 0;
  for (let e of stack.children) {
    const child = render(e);
    setPos(child, absX, absY);
    g.appendChild(child);
    absY += e.size.y + STACK_GAP;
  }

  // setPos(g, absX, absY)
  return g;
}
export function render(r: Renderable): SVGElement {
  if (r.kind === "block") {
    return renderBlock(r);
  } else if (r.kind === "label") {
    if (DBG_TXT) {
      let rec = renderRect(r);
      setStyle(rec, {
        fill: "#ffffffaa",
        stroke: "#ffffffaa",
      });
      // return rec
      let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.appendChild(rec);
      g.appendChild(renderLabel(r));
      return g;
    }

    return renderLabel(r);
  } else if (r.kind === "dropdown") {
    return renderDropdown(r);
  } else if (r.kind === "stack") {
    return renderStack(r);
  } else {
    let _: never = r;
    return _;
  }
}
