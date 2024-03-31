import { SVG } from "../utils/svg.js";

export const MISSING_CHAR_SVG: SVG = [
  { i: "M", x: -0.5, y: -0.5 },
  { i: "v", dy: 1 },
  { i: "h", dx: 1 },
  { i: "v", dy: -1 },
  { i: "h", dx: -1 },
];

export const CHAR_SVG: Record<string, SVG> = {
  "1": [
    { i: "M", x: 0, y: -0.5 },
    { i: "v", dy: 1 },
    { i: "m", dx: -0.2, dy: -0.2 },
    { i: "M", x: -0.2, y: -0.5 },
    { i: "h", dx: 0.4 },
  ],
  "2": [
    { i: "M", x: -0.3, y: 0.2 },
    { i: "a", rx: 0.3, dx: 0.6, dy: 0.0, largeArc: true },
    { i: "m", dx: -0.6, dy: -0.7 },
    { i: "h", dx: 0.6 },
  ],
  "3": [
    { i: "M", x: 0, y: 0 },
    { i: "a", rx: 0.3, dx: -0.3, dy: 0.3, largeArc: true },
    { i: "M", x: 0, y: 0 },
    { i: "a", rx: 0.3, dx: -0.3, dy: -0.3, largeArc: true, sweep: true },
  ],
  "4": [
    { i: "M", x: 0.1, y: -0.5 },
    { i: "v", dy: 1 },
    { i: "m", dx: -0.3, dy: -0.6 },
    { i: "h", dx: 0.5 },
  ],
  "5": [
    { i: "M", x: 0.3, y: 0.5 },
    { i: "h", dx: -0.6 },
    { i: "v", dy: -0.4 },
    { i: "a", rx: 0.4, dx: 0, dy: -0.6, largeArc: true, sweep: true },
  ],
  "6": [
    { i: "M", x: 0.3, y: 0.5 },
    { i: "a", rx: 0.4, dx: -0.6, dy: -0.4, sweep: true },
    // { i: "M", x: -0.3, y: 0 },
    { i: "v", dy: -0.2 },
    { i: "a", rx: 0.35, dx: 0, dy: -0.1, largeArc: true, sweep: true },
    { i: "v", dy: 0.1 },
  ],
  "7": [
    { i: "M", x: 0, y: -0.5 },
    { i: "m", dy: 1, dx: 0.3 },
    { i: "h", dx: -0.6 },
  ],
  "8": [
    { i: "M", x: 0.05, y: 0.1 },
    { i: "a", rx: 0.3, dx: -0.1, dy: 0, largeArc: true, sweep: true },
    { i: "a", rx: 0.25, dx: 0.1, dy: 0, largeArc: true, sweep: true },
  ],
  "9": [
    { i: "M", x: -0.3, y: -0.5 },
    { i: "a", rx: 0.4, dx: 0.6, dy: 0.4, sweep: true },
    // { i: "M", x: -0.3, y: 0 },
    { i: "v", dy: 0.2 },
    { i: "a", rx: 0.35, dx: 0, dy: 0.1, largeArc: true, sweep: true },
    { i: "v", dy: -0.1 },
  ],
  "0": [
    { i: "M", x: -0.3, y: 0.2 },
    { i: "a", rx: 0.3, dx: 0.6, dy: 0, largeArc: true },
    { i: "v", dy: -0.4 },
    { i: "a", rx: 0.3, dx: -0.6, dy: 0, largeArc: true },
    { i: "v", dy: 0.4 },
    // { i: "M", x: 0.3, y: 0.2 },
    // { i: "m", dx: -0.6, dy: -0.4 },
  ],
  J: [
    { i: "M", x: -0.3, y: -0.2 },
    { i: "a", rx: 0.3, dx: 0.6, dy: 0.0 },
    { i: "v", dy: 0.7 },
    { i: "h", dx: -0.4 },
  ],
  Q: [
    { i: "M", x: -0.3, y: 0.2 },
    { i: "a", rx: 0.3, dx: 0.6, dy: 0, largeArc: true },
    { i: "v", dy: -0.4 },
    { i: "a", rx: 0.3, dx: -0.6, dy: 0, largeArc: true },
    { i: "v", dy: 0.4 },
    { i: "M", x: 0.05, y: -0.2 },
    { i: "m", dx: 0.3, dy: -0.4 },
  ],
  K: [
    { i: "M", x: -0.3, y: -0.5 },
    { i: "v", dy: 1 },
    { i: "M", x: -0.3, y: -0.1 },
    { i: "m", dx: 0.6, dy: 0.5 },
    { i: "M", x: -0.1, y: 0.1 },
    { i: "m", dx: 0.4, dy: -0.6 },
  ],
  A: [
    { i: "M", x: -0.3, y: -0.5 },
    { i: "m", dx: 0.3, dy: 1 },
    { i: "M", x: 0.3, y: -0.5 },
    { i: "m", dx: -0.3, dy: 1 },
    { i: "M", x: -0.2, y: 0 },
    { i: "h", dx: 0.4 },
  ],
};
