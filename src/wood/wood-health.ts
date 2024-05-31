import { EM } from "../ecs/ecs.js";
import { WoodState, TRACK_MAX_BOARD_SEG_IDX } from "./wood-builder.js";

export function createWoodHealth(w: WoodState): WoodHealth {
  if (TRACK_MAX_BOARD_SEG_IDX) {
    const maxBoardIdx = w.groups.reduce((p, n) => p + n.boards.length, 0);
    let maxSegIdx = -1;
    for (let g of w.groups) {
      for (let b of g.boards) {
        maxSegIdx = Math.max(maxSegIdx, b.segments.length);
      }
    }
    console.log(`maxBoardIdx: ${maxBoardIdx}`);
    console.log(`maxSegIdx: ${maxSegIdx}`);
  }

  const groups: BoardGroupHealth[] = w.groups.map((g) => {
    const boards: BoardHealth[] = g.boards.map((b) => {
      let lastSeg = b.segments.reduce((p, n) => {
        const h: SegHealth = {
          prev: p,
          health: 1,
          broken: false,
        };
        return h;
      }, undefined as SegHealth | undefined);
      if (!lastSeg) return [] as SegHealth[];
      // patch up "next" ptrs
      while (lastSeg.prev) {
        lastSeg.prev.next = lastSeg;
        lastSeg = lastSeg.prev;
      }
      let nextSeg: SegHealth | undefined = lastSeg;
      const segHealths: SegHealth[] = [];
      while (nextSeg) {
        segHealths.push(nextSeg);
        nextSeg = nextSeg.next;
      }
      // console.dir(segHealths);
      return segHealths;
    });
    return {
      boards,
    };
  });

  return {
    groups,
  };
}
export function resetWoodHealth(wh: WoodHealth) {
  wh.groups.forEach((g) => {
    g.boards.forEach((b) =>
      b.forEach((s) => {
        s.health = 1;
        s.broken = false;
        s.splinterTopIdx = undefined;
        s.splinterBotIdx = undefined;
      })
    );
  });
}
export interface SegHealth {
  prev?: SegHealth;
  next?: SegHealth;
  health: number;
  broken: boolean;
  splinterTopIdx?: number;
  splinterBotIdx?: number;
}
export type BoardHealth = SegHealth[];
export interface BoardGroupHealth {
  boards: BoardHealth[];
}
export interface WoodHealth {
  // TODO(@darzu): why no pointer to state?
  groups: BoardGroupHealth[];
} // export type TimberBuilder = ReturnType<typeof createTimberBuilder>;

export const WoodHealthDef = EM.defineNonupdatableComponent(
  "woodHealth",
  (s: WoodHealth) => {
    return s;
  }
);
