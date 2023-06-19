import { EM } from "./entity-manager.js";
import { SyncDef } from "../net/components.js";
import { dbgLogOnce } from "../utils/util.js";
import { Phase } from "./sys-phase.js";
import { WARN_DEAD_CLEANUP } from "../flags.js";

export const DeletedDef = EM.defineComponent2(
  "deleted",
  () => ({
    processed: false,
  }),
  (p) => p
);

EM.registerSerializerPair(
  DeletedDef,
  () => {
    return;
  },
  () => {
    return;
  }
);

EM.addSystem("delete", Phase.PRE_GAME_WORLD, [DeletedDef], [], (entities) => {
  for (let entity of entities) {
    if (!entity.deleted.processed) {
      // TODO: remove from renderer
      // TODO(@darzu): yuck, we just wrote a destructor. Also not sure
      //    this is serializable or network-able
      if (OnDeleteDef.isOn(entity)) entity.onDelete(entity.id);

      EM.keepOnlyComponents(entity.id, [DeletedDef, SyncDef]);
      if (SyncDef.isOn(entity)) {
        entity.sync.dynamicComponents = [];
        entity.sync.fullComponents = [DeletedDef.id];
      }
      entity.deleted.processed = true;
    }
  }
});

// TODO(@darzu): uh oh. this seems like memory/life cycle management.
//    currently this is needed for entities that "own" other
//    entities but might be deleted in several ways
export const OnDeleteDef = EM.defineComponent2(
  "onDelete",
  () => (deletedId: number) => {},
  (p, onDelete: (deletedId: number) => void) => onDelete
);

// Idea: needed for entity pools. EM wont call a system w/ a Dead entity unless
//    that system explicitly asks for Dead.
export const DeadDef = EM.defineComponent2(
  "dead",
  () => ({
    processed: false,
  }),
  (p) => p
);

// TODO(@darzu): this is entity specific...
if (WARN_DEAD_CLEANUP) {
  EM.addSystem(
    "deadCleanupWarning",
    Phase.POST_GAME_WORLD,
    [DeadDef],
    [],
    (entities) => {
      for (let e of entities) {
        if (!e.dead.processed) dbgLogOnce(`dead entity not processed: ${e.id}`);
      }
    }
  );
}
