import { enumAsList, enumNamesAsList } from "../utils/util";

export enum Phase {
  NETWORK,
  PRE_GAME_WORLD,
  GAME_WORLD,
  POST_GAME_WORLD,
  AUDIO,
  PRE_READ_INPUT,
  READ_INPUTS,
  GAME_PLAYERS,
  POST_GAME_PLAYERS,
  PRE_PHYSICS,
  PHYSICS,
  POST_PHYSICS,
  PRE_RENDER,
  RENDER,
}
export type PhaseName = keyof typeof Phase;
export const PhaseNameList: PhaseName[] = enumNamesAsList(Phase);
export const PhaseValueList: Phase[] = enumAsList(Phase);
