// NOTE: Since this file imports from many places, it is only allowed to
//   export TYPES so that this doesn't become a many-to-many dependency nightmare
import { ShipyardUI } from "../wood/shipyard.js";

// TODO(@darzu): hmmmmmm how to impl w/ resources

export interface GameTextUI {
  kind: "gametxt";
  upper: string;
  lower: string;
  debug: string;
}

export type UITool = ShipyardUI | GameTextUI;
export type UIToolKind = UITool["kind"];
