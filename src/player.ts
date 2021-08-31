// player controller component and system

import { MotionProps } from "./phys_motion.js";

export interface PlayerProps {
  jumpHeight: number;
}

export function createPlayerProps(): PlayerProps {
  return {
    jumpHeight: 5,
  };
}

export interface PlayerObj {
  id: number;
  player: PlayerProps;
  motion: MotionProps;
}

export function stepPlayers(player: Record<number, PlayerObj>, dt: number) {
  // TODO(@darzu): implement
}
