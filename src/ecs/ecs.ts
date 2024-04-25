import { _entities } from "./em-entities.js";
import { EMComponents, _components } from "./em-components.js";
import { EMInit, _init } from "./em-init.js";
import { EMResources, _resources } from "./em-resources.js";
import { EMSystems, _systems } from "./em-systems.js";
import { EMEntities } from "./em-entities.js";

export interface ECS
  extends EMEntities,
    EMInit,
    EMResources,
    EMSystems,
    EMComponents {}

export const EM: ECS = {
  ..._systems,
  ..._resources,
  ..._entities,
  ..._init,
  ..._components,
};
