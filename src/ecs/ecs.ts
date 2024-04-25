import { _entities } from "./em-entities.js";
import { EMComponents, _components } from "./em-components.js";
import { EMInit, _init } from "./em-init.js";
import { EMResources, _resources } from "./em-resources.js";
import { EMSystems, _systems } from "./em-systems.js";
import { EMEntities } from "./em-entities.js";

export interface EMStats {
  emStats: { queryTime: number; dbgLoops: number };
}

function createEMStats(): EMStats {
  const emStats = {
    queryTime: 0,
    dbgLoops: 0,
  };

  const res: EMStats = {
    emStats,
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
