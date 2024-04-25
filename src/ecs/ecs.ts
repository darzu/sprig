import { _entities } from "./em-entities.js";
import { EMComponents, _components } from "./em-components.js";
import { EMInit, _init } from "./em-init.js";
import { EMResources, _resources } from "./em-resources.js";
import { EMSystems, _systems } from "./em-systems.js";
import { EMEntities } from "./em-entities.js";

// EM -> backronym for "Emporium" (originally Entity Manager)

export interface EMStats {
  emStats: { queryTime: number; dbgLoops: number };
  update(): void;
}

function createEMStats(): EMStats {
  const emStats = {
    queryTime: 0,
    dbgLoops: 0,
  };

  function update() {
    // TODO(@darzu): can EM.update() be a system?
    let madeProgress: boolean;
    do {
      madeProgress = false;
      madeProgress ||= _init.progressInitFns();
      madeProgress ||= _resources.progressResourcePromises();
      madeProgress ||= _entities.progressEntityPromises();
    } while (madeProgress);

    _systems.callSystems();
    _stats.emStats.dbgLoops++;
  }

  const res: EMStats = {
    emStats,
    update,
  };

  return res;
}

export interface ECS
  extends EMEntities,
    EMStats,
    EMInit,
    EMResources,
    EMSystems,
    EMComponents {}

export const _stats = createEMStats();

export const EM: ECS = {
  ..._stats,
  ..._systems,
  ..._resources,
  ..._entities,
  ..._init,
  ..._components,
};
