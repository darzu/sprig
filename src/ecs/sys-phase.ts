import { assert, enumAsList, enumNamesAsList, toMap } from "../utils/util.js";

export enum Phase {
  NETWORK,
  PRE_GAME_WORLD,
  GAME_WORLD,
  POST_GAME_WORLD,
  AUDIO,
  PRE_READ_INPUT,
  READ_INPUTS,
  POST_READ_INPUTS,
  PRE_GAME_PLAYERS,
  GAME_PLAYERS,
  POST_GAME_PLAYERS,
  PRE_PHYSICS,
  PHYSICS_MOTION,
  PHYSICS_FINISH_LOCAL,
  PHYSICS_WORLD_FROM_LOCAL,
  PHYSICS_CONTACT,
  PHYSICS_FINISH_WORLD,
  POST_PHYSICS,
  PRE_RENDER,
  RENDER_WORLDFRAMES,
  RENDER_PRE_DRAW,
  RENDER_DRAW,
}
export type PhaseName = keyof typeof Phase;
export const PhaseFromName = (n: PhaseName) => Phase[n];
export const NameFromPhase = (v: Phase) => Phase[v] as PhaseName;
export const PhaseNameList: PhaseName[] = enumNamesAsList(Phase);
export const PhaseValueList: Phase[] = enumAsList(Phase);
export const MetaPhases = [
  "NETWORK",
  "GAME_WORLD",
  "AUDIO",
  "INPUT",
  "GAME_PLAYERS",
  "PHYSICS",
  "RENDER",
] as const; // for debugging / stats
export const PhaseNameToMetaPhase = toMap(
  PhaseNameList,
  (n) => n,
  (n) => {
    for (let m of MetaPhases) if (n.includes(m)) return m;
    assert(false, `Phase ${n} doesnt belong to a meta phase`);
  }
);
