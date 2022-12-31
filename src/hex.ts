import { vec2, vec3 } from "./gl-matrix.js";
import { packI16s, TupleN } from "./util.js";

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
export function hexXYZ(out: vec3, q: number, r: number, size: number): vec3 {
  out[0] = hexX(q, r, size);
  out[1] = 0;
  out[2] = hexZ(q, r, size);
  return out;
}

export function xzToHex(z: number, x: number, size: number) {
  const q = -((2 / 3) * z) / size;
  const r = -((-1 / 3) * z + (Math.sqrt(3) / 3) * x) / size;
  return hexRound(q, r);
}

export function hexRound(qf: number, rf: number): [number, number] {
  const sf = -qf - rf;

  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);

  const q_diff = Math.abs(q - qf);
  const r_diff = Math.abs(r - rf);
  const s_diff = Math.abs(s - sf);

  if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
  else if (r_diff > s_diff) r = -q - s;
  else s = -q - r;

  return [q, r];
}

export function hexDist(
  q1: number,
  r1: number,
  q2: number,
  r2: number
): number {
  const dq = q2 - q1;
  const dr = r2 - r1;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export function* hexesWithin(
  cq: number,
  cr: number,
  radius: number
): Generator<[number, number]> {
  const w = Math.floor(radius);
  for (let q = -w; q <= w; q++) {
    for (let r = -w; r <= w; r++) {
      for (let s = -w; s <= w; s++) {
        if (q + r + s === 0) {
          yield [q + cq, r + cr];
        }
      }
    }
  }
}

// export type Hex = { q: number; r: number };

export const HEX_DIRS: TupleN<vec2, 6> = [
  [+0, -1],
  [+1, -1],
  [+1, -0],
  [-0, +1],
  [-1, +1],
  [-1, +0],
];
export const HEX_N_IDX = 0;
export const HEX_NE_IDX = 1;
export const HEX_SE_IDX = 2;
export const HEX_S_IDX = 3;
export const HEX_SW_IDX = 4;
export const HEX_NW_IDX = 5;
export const HEX_N = HEX_DIRS[0];
export const HEX_NE = HEX_DIRS[1];
export const HEX_SE = HEX_DIRS[2];
export const HEX_S = HEX_DIRS[3];
export const HEX_SW = HEX_DIRS[4];
export const HEX_NW = HEX_DIRS[5];

export const HEX_E_DIR = [+1, -0.5, -0.5];
export const HEX_W_DIR = [-1, +0.5, +0.5];

export function hexDirAdd(dirIdx: number, n: number): number {
  return (dirIdx + HEX_DIRS.length + n) % HEX_DIRS.length;
}
export function hexLeft(dirIdx: number): number {
  return (dirIdx + HEX_DIRS.length - 1) % HEX_DIRS.length;
}
export function hexRight(dirIdx: number): number {
  return (dirIdx + 1) % HEX_DIRS.length;
}

export function hexNeighborDirs(dirIdx: number = 0): TupleN<vec2, 6> {
  return [
    HEX_DIRS[dirIdx],
    HEX_DIRS[hexDirAdd(dirIdx, 1)],
    HEX_DIRS[hexDirAdd(dirIdx, 2)],
    HEX_DIRS[hexDirAdd(dirIdx, 3)],
    HEX_DIRS[hexDirAdd(dirIdx, 4)],
    HEX_DIRS[hexDirAdd(dirIdx, 5)],
  ];
}

export function hexDirCCW90(dirIdx: number = 0): vec3 {
  return hexAvg(
    HEX_DIRS[hexDirAdd(dirIdx, HEX_SW_IDX)],
    HEX_DIRS[hexDirAdd(dirIdx, HEX_NW_IDX)]
  );
}
export function hexDirCW90(dirIdx: number = 0): vec3 {
  return hexAvg(
    HEX_DIRS[hexDirAdd(dirIdx, HEX_SE_IDX)],
    HEX_DIRS[hexDirAdd(dirIdx, HEX_NE_IDX)]
  );
}

export function hexNeighbors(
  q: number,
  r: number,
  dirIdx: number = 0
): TupleN<vec2, 6> {
  const qr = [q, r] as const;
  return hexNeighborDirs(dirIdx).map((d) => vec2.add([0, 0], qr, d)) as TupleN<
    vec2,
    6
  >;
}

export function hexAvg(qr1: vec2, qr2: vec2): vec3 {
  return [
    (qr1[0] + qr2[0]) * 0.5,
    (qr1[1] + qr2[1]) * 0.5,
    (-qr1[0] - qr1[1] - qr2[0] - qr2[1]) * 0.5,
  ];
}
