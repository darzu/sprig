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

// EM -> backronym for "Emporium" (originally EntityManager)

export interface EMMeta {
  emStats: { queryTime: number; dbgLoops: number };
  update(): void;
}

function createEMMeta(): EMMeta {
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
    _meta.emStats.dbgLoops++;
  }

  const res: EMMeta = {
    emStats,
    update,
  };

  return res;
}

export interface ECS
  extends EMEntities,
    EMMeta,
    EMInit,
    EMResources,
    EMSystems,
    EMComponents {}

export const _meta = createEMMeta();
export const _entities = createEMEntities();
export const _components = createEMComponents();
export const _systems = createEMSystems();
export const _resources = createEMResources();
export const _init = createEMInit();

function createEmporiumECS(): ECS {
  return {
    ..._meta,
    ..._entities,
    ..._components,
    ..._systems,
    ..._resources,
    ..._init,
  };
}

export const EM: ECS = createEmporiumECS();
