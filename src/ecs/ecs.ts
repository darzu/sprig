import { EMComponents } from "./em-components.js";
import { EMInit } from "./em-init.js";
import { EMResources } from "./em-resources.js";
import { EMSystems } from "./em-systems.js";
import { EMEntities } from "./em-entities.js";
import { createEMEntities } from "./em-entities.js";
import { createEMComponents } from "./em-components.js";
import { createEMInit } from "./em-init.js";
import { createEMResources } from "./em-resources.js";
import { createEMSystems } from "./em-systems.js";

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
export const _entities = createEMEntities();
export const _components = createEMComponents();
export const _init = createEMInit();
export const _resources = createEMResources();
export const _systems = createEMSystems();

function createEmporiumECS(): ECS {
  return {
    ..._stats,
    ..._systems,
    ..._resources,
    ..._entities,
    ..._init,
    ..._components,
  };
}

export const EM: ECS = createEmporiumECS();
