import { Entity } from "./entity-manager.js";

// TODO(@darzu): make not a class

/*
multi-scene

pipelines
disable old scene entities (take out of systems lists, take out of renderer)
enable new scene entities 

push scene
pop scene

optional marking/annotations on systems and entities ?

active / deactive scene

resource tagging

or worlds:
  all resources attached to a world
  world swapped loaded/unloaded,
    all caches swapped

maybe resources are shared
everything else isn't

goal:
  scene swapping is useful for game too
    swap missions areas, store, etc.

questions:
  is it a new namespace for systems?

for global system queries,
  which entities match?
    each scene, concated

multiplayer netcode:
  events and updates refer to entities which aren't active any more?

local multi-player:
  split screen: 
    two cameras, same scenes
    or two iframes running two spriglands

*/

export class EMScene {
  // entities: Map<number, Entity> = new Map();
}

export const globalScene = new EMScene();
