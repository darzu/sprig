// https://chat.openai.com/chat: "Write a rasterization algorithm in javascript"
// TODO(@darzu): don't think I like using AI for this..
// TODO(@darzu): raster doesn't work yet

import { vec2 } from "./sprig-matrix.js";
import { assert } from "./util.js";

// TODO(@darzu): can we be more efficient by rasterizing a quad directly?
export function rasterizeTri(
  v1: vec2.InputT,
  v2: vec2.InputT,
  v3: vec2.InputT,
  write: (x: number, y: number) => void
) {
  // Sort the vertices by y-coordinate in ascending order
  const verts = [v1, v2, v3].sort((a, b) => a[1] - b[1]);

  // Get the coordinates of the vertices
  const [x1, y1] = verts[0];
  const [x2, y2] = verts[1];
  const [x3, y3] = verts[2];

  // Compute the slopes of the sides
  //  run over rise so: x = m*y
  const m12 = (x2 - x1) / (y2 - y1);
  const m13 = (x3 - x1) / (y3 - y1);
  const m23 = (x3 - x2) / (y3 - y2);

  // console.log(m1, m2, m3);
  // throw "foo";

  // Initialize the x-coordinates of the edges
  // NOTE: these are floats and updated as such
  let x13 = x1;
  let x123 = x1;

  // const f1 = (n: number) => Math.floor(n);
  const f1 = (n: number) => n;
  // const f2 = (n: number) => Math.ceil(n);
  // const f2 = (n: number) => Math.floor(n);
  const f2 = (n: number) => n;
  // const f = Math.floor;

  // TODO(@darzu): do sub-pixel stuff
  // Loop through the rows between edge 1 and 2
  for (let y = f1(y1); y <= f2(y2); y++) {
    // console.log(`ya: ${y}`);
    // write out that row
    const minX = f1(Math.min(x13, x123));
    const maxX = f2(Math.max(x13, x123));
    // console.log(minX, maxX);
    // throw "foo";
    assert(isFinite(maxX - minX), `${x13}, ${x123}, y: ${y}, ${y1} ${y2}`);
    for (let x = minX; x <= maxX; x++) {
      // console.log(`xa: ${x}`);
      // TODO(@darzu): is round the right thing? probably not..
      // TODO(@darzu): follow "top-left" rule?
      // write(Math.round(x), Math.round(y));
      write(x, y);
    }

    // Update the x-coordinates of the edges
    x13 += m13;
    x123 += m12;
  }

  // we're swapping edges for 2-3, but the other edge continues to 1-3
  x13 = x1 + m13 * (y2 - y1);
  x123 = x2;

  // Loop through the rows between edge 2 and 3
  for (let y = f1(y2); y <= f2(y3); y++) {
    // console.log(`yb: ${y}`);
    // write out that row
    const minX = f1(Math.min(x13, x123));
    const maxX = f2(Math.max(x13, x123));
    // console.log(minX, maxX);
    assert(isFinite(maxX - minX), `${x13}, ${x123}`);
    for (let x = minX; x <= maxX; x++) {
      // console.log(`xa: ${x}`);
      write(x, y);
      // write(Math.round(x), Math.round(y));
    }

    // Update the x-coordinates of the edges
    x13 += m13;
    x123 += m23;
  }

  // throw "stop";
}
