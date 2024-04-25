import { Entity, EntityW } from "./em-entities.js";
import { ComponentDef } from "./em-components.js";
import { IdxPool, createIdxPool } from "../utils/idx-pool.js";
import { assert } from "../utils/util.js";
import { never } from "../utils/util-no-import.js";

// Object-pool pattern for entities.
// TODO(@darzu): perhaps this should be refined and co-implemented w/ archtypes?
//    in a long running game, any regularly created entities should be using pools or archtypes.

// TODO(@darzu): would be nice to have a generation idx on entities

// TODO(@darzu): spawn parameters would be nice
export interface EntityPoolParams<CS extends readonly ComponentDef[]> {
  max: number;
  maxBehavior: "crash" | "rand-despawn"; // | "ring-buffer",
  // TODO(@darzu): specify max behavior: ring buffer, "random free", crash?
  // TODO(@darzu): we might want to allow these to be async, especially create().
  create: () => EntityW<CS>;
  onSpawn: (e: EntityW<CS>) => void;
  onDespawn: (e: EntityW<CS>) => void;
}

export interface EntityPool<CS extends readonly ComponentDef[]> {
  params: EntityPoolParams<CS>;
  spawn: () => EntityW<CS>;
  despawn: (e: Entity) => void;
}

export function createEntityPool<CS extends readonly ComponentDef[]>(
  params: EntityPoolParams<CS>
): EntityPool<CS> {
  const ents: EntityW<CS>[] = [];
  const entIdToIdx = new Map<number, number>();
  const idxPool = createIdxPool(params.max);

  function spawn() {
    if (idxPool.numFree() === 0) {
      if (params.maxBehavior === "crash") throw `Entity pool full!`;
      else if (params.maxBehavior === "rand-despawn") {
        let toDespawnIdx = idxPool._cursor();
        let toDespawn = ents[toDespawnIdx]!;
        params.onDespawn(toDespawn);
        idxPool.free(toDespawnIdx);
      } else never(params.maxBehavior);
    }
    const idx = idxPool.next()!;
    let ent: EntityW<CS>;
    if (!ents[idx]) {
      // new entity
      ent = params.create();
      ents[idx] = ent;
      entIdToIdx.set(ent.id, idx);
    }
    // take existing
    else ent = ents[idx];
    // spawn
    params.onSpawn(ent);
    return ent;
  }
  function despawn(e: Entity) {
    const idx = entIdToIdx.get(e.id);
    // if (!(idx !== undefined && ents[idx] === e)) {
    //   console.dir(entIdToIdx);
    //   console.dir(ents);
    //   console.dir(e);
    //   console.log(idx);
    // }
    assert(
      idx !== undefined && ents[idx] === e,
      `despawning entity that isnt in pool: ${e.id}`
    );
    params.onDespawn(e as EntityW<CS>);
    idxPool.free(idx); // TODO(@darzu): ignore double free param?
  }
  return {
    params,
    spawn,
    despawn,
  };
}
