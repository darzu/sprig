import { EM, EntityManager } from "./entity-manager.js";

export const DeletedDef = EM.defineComponent("deleted", () => true);

export function registerDeleteEntitiesSystem(em: EntityManager) {
  em.registerSystem([DeletedDef], [], (entities) => {
    for (let entity of entities) {
      // TODO: remove from renderer
      em.removeAllComponents(entity.id);
    }
  });
}
