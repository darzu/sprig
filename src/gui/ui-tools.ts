// NOTE: Since this file imports from many places, it is only allowed to
//   export TYPES so that this doesn't become a many-to-many dependency nightmare

// TODO(@darzu): hmmmmmm how to impl w/ resources

interface ShipyardUI {
  kind: "shipyard";
  ribCount: number;
  // TODO(@darzu): other params
}

interface GameTextUI {
  kind: "gametxt";
  upper: string;
  lower: string;
  debug: string;
}

type UITool = ShipyardUI | GameTextUI;
type UIToolKind = UITool["kind"];
