import { V, V2, V3 } from "../matrix/sprig-matrix.js";
import { createAABB2 } from "../physics/aabb.js";
import { sum, wrap } from "./math.js";
import { PI, never } from "./util-no-import.js";
import { assert } from "./util.js";

// Reference: https://www.w3.org/TR/SVG2/paths.html

// TODO(@darzu): svg committe consindering making arcs easier?
/*
turtle graphics will break the "command generates new current point" paradigm
https://www.w3.org/2011/11/04-svg-minutes.html#item08
*/

interface svg_M {
  i: "M";
  x: number;
  y: number;
}
interface svg_v {
  i: "v";
  dy: number;
}
interface svg_h {
  i: "h";
  dx: number;
}
// a rx ry x-axis-rotation large-arc-flag sweep-flag dx dy
interface svg_a {
  i: "a";
  rx: number;
  ry?: undefined; // TODO(@darzu): support
  xAxisRot?: undefined; // TODO(@darzu): support
  largeArc?: undefined; // TODO(@darzu): support
  /*
  If sweep-flag is '1', then the arc will be drawn in a "positive-angle" direction (i.e., the ellipse formula 
    x=cx+rx*cos(theta) and y=cy+ry*sin(theta) is evaluated such that theta starts at an angle corresponding 
    to the current point and increases positively until the arc reaches (x,y)

    cx = x0 - rx *cos(theta)
    cx = x1 - rx *cos(theta)
    a = 1/2 dist(v0, v1)
    b = sqrt(rx**2 - a**2)

  */
  sweep?: boolean;
  dx: number;
  dy: number;
}
type svg_instr = svg_M | svg_v | svg_h | svg_a;
type SVG = svg_instr[];

function parseSVG() {
  const aabb = createAABB2(V(-1, -2), V(3, 4));
  const radius = 3;
  const width = 5;
  const height = 7;

  const foo: SVG = [
    { i: "M", x: aabb.min[0] - radius, y: aabb.min[1] },
    { i: "v", dy: height },
    { i: "a", rx: radius, dx: +radius, dy: +radius },
    { i: "h", dx: width },
    { i: "a", rx: radius, dx: +radius, dy: -radius },
    { i: "v", dy: -height },
    { i: "a", rx: radius, dx: -radius, dy: -radius },
    { i: "h", dx: -width },
    { i: "a", rx: radius, dx: -radius, dy: +radius },
  ];
}

// TODO(@darzu): MOVE elsewhere
export function getCircleCenter(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  s: -1 | 1,
  out?: V2
): V2 {
  // https://math.stackexchange.com/questions/1781438/finding-the-center-of-a-circle-given-two-points-and-a-radius-algebraically
  const x01 = (x1 - x0) * 0.5;
  const y01 = (y1 - y0) * 0.5;
  const aSqr = x01 ** 2 + y01 ** 2;
  const a = Math.sqrt(aSqr);
  const b = Math.sqrt(r ** 2 - aSqr);
  assert(!isNaN(b));
  const ba = b / a;
  const cx = x0 + x01 + ba * y01 * s;
  const cy = y0 + y01 - ba * x01 * s;
  out = out ?? V2.tmp();
  out[0] = cx;
  out[1] = cy;
  return out;
}

function svgLength(start: V2.InputT, instr: svg_instr): number {
  if (instr.i === "M") {
    return 0;
  } else if (instr.i === "h") {
    return instr.dx;
  } else if (instr.i === "v") {
    return instr.dy;
  } else if (instr.i === "a") {
    const vx = start[0] + instr.dx;
    const vy = start[1] + instr.dy;
    const s = instr.sweep ? -1 : 1; // TODO(@darzu): TEST AND VERIFY!
    const c = getCircleCenter(start[0], start[1], vx, vy, instr.rx, s);
    const uTheta = Math.atan2(start[1] - c[1], start[0] - c[1]);
    const vTheta = Math.atan2(vy - c[1], vx - c[1]);
    const smallTheta = Math.abs(uTheta - vTheta);
    const arcTheta = instr.largeArc ? 2 * PI - smallTheta : smallTheta;
    const l = 2 * PI * arcTheta;
    return l;
  } else never(instr);
}

function svgEnd(start: V2.InputT, instr: svg_instr, out?: V2): V2 {
  out = out ?? V2.tmp();
  if (instr.i === "M") {
    out[0] = instr.x;
    out[1] = instr.y;
  } else if (instr.i === "h") {
    out[0] = start[0] + instr.dx;
    out[1] = start[1];
  } else if (instr.i === "v") {
    out[0] = start[0];
    out[1] = start[1] + instr.dy;
  } else if (instr.i === "a") {
    out[0] = start[0] + instr.dx;
    out[1] = start[1] + instr.dy;
  } else never(instr);
  return out;
}

function compileSVG(svg: SVG) {
  const pos = V(0, 0);

  const lengths: number[] = [];

  svg.forEach((instr, i) => {
    throw "TODO";
  });

  const perimeter = sum(lengths);

  const parametric = (t: number) => {
    t = wrapT(t);
    let toTravel = t * perimeter;
    let i = 0;
    while (toTravel > lengths[i] && i < lengths.length - 1) {
      toTravel -= lengths[i];
      i++;
    }
    const localT = toTravel / lengths[i];
  };

  throw "TODO impl";
}

// TODO(@darzu): MOVE
// wraps t into [0,1]
function wrapT(t: number): number {
  return t >= 0 ? t % 1.0 : (t % 1.0) + 1.0;
}

// TODO(@darzu): support parsing strings & .svg like:
/*
  const path = `
  M ${aabb.min[0] - radius},${aabb.min[1]} 
  v ${height} 
  a ${radius} ${radius} 0 0 ${+radius} ${+radius}
  h ${width}
  a ${radius} ${radius} 0 0 ${+radius} ${-radius}
  v ${-height}
  a ${radius} ${radius} 0 0 ${-radius} ${-radius}
  h ${-width}
  a ${radius} ${radius} 0 0 ${-radius} ${+radius}
`;
*/
