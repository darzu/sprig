import { enumAsList, enumNamesAsList } from "../utils/util.js";

export enum Phase {
  NETWORK,
  PRE_GAME_WORLD,
  GAME_WORLD,
  POST_GAME_WORLD,
  AUDIO,
  PRE_READ_INPUT,
  READ_INPUTS,
  PRE_GAME_PLAYERS,
  GAME_PLAYERS,
  POST_GAME_PLAYERS,
  PRE_PHYSICS,
  PHYSICS,
  POST_PHYSICS,
  PRE_RENDER,
  RENDER_WORLDFRAMES,
  RENDER_PRE_DRAW,
  RENDER_DRAW,
}
export type PhaseName = keyof typeof Phase;
export const PhaseNameList: PhaseName[] = enumNamesAsList(Phase);
export const PhaseValueList: Phase[] = enumAsList(Phase);
