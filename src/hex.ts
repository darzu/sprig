/*
plane at q + r + s = 0
each hex is a cube in 3d
  cubes are connected by edges
  you move diagonly, always two coordinates change together
for axial, s = -q-r

IMPL NOTES:
  We're gonna use sparse storage since most coordinates will be empty

could do class w/ generic data stored at hex
or each tile could give an id which we can use elsewhere
like IdPair w/ negatives should work fine
or we just increment ids

hmm could we restrict outselves to positive q/r only?
  nah, too restrictive
*/

import { vec3 } from "./gl-matrix.js";
import { packI16s } from "./util.js";

// TODO(@darzu): is using [number,number] bad for perf?
export interface HexGrid<D> {
  _grid: Map<number, D>;
  has: (q: number, r: number) => boolean;
  set: (q: number, r: number, d: D) => void;
  get: (q: number, r: number) => D | undefined;
  delete: (q: number, r: number) => void;
}

export function createHexGrid<D>(): HexGrid<D> {
  const _grid: Map<number, D> = new Map();

  return {
    _grid,
    has: (q, r) => _grid.has(packI16s(q, r)),
    set: (q, r, d) => _grid.set(packI16s(q, r), d),
    get: (q, r) => _grid.get(packI16s(q, r)),
    delete: (q, r) => _grid.delete(packI16s(q, r)),
  };
}

const q_z_spc = Math.sqrt(3) / 2;
const r_z_spc = Math.sqrt(3);
export function hexZ(q: number, r: number, size: number): number {
  return -size * (q_z_spc * q + r_z_spc * r);
}
const q_x_spc = 3 / 2;
export function hexX(q: number, r: number, size: number): number {
  return -size * q_x_spc * q;
}

// export type Hex = { q: number; r: number };

export const HEX_DIRS = [
  { q: +0, r: -1 },
  { q: +1, r: -1 },
  { q: +1, r: -0 },
  { q: -0, r: +1 },
  { q: -1, r: +1 },
  { q: -1, r: +0 },
] as const;
export const HEX_N = HEX_DIRS[0];
export const HEX_NE = HEX_DIRS[1];
export const HEX_SE = HEX_DIRS[2];
export const HEX_S = HEX_DIRS[3];
export const HEX_SW = HEX_DIRS[4];
export const HEX_NW = HEX_DIRS[5];

// function flat_hex_to_pixel(hex):
//     var x = size * (     3./2 * hex.q                    )
//     var y = size * (sqrt(3)/2 * hex.q  +  sqrt(3) * hex.r)
//     return Point(x, y)
