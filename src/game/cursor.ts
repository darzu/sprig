import { ComponentDef, EM, EntityManager, EntityW } from "../entity-manager.js";
import { Mesh } from "../render/mesh-pool.js";
import { RenderableDef } from "../render/renderer.js";
import { PositionDef } from "../physics/transform.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "./game.js";

export const GlobalCursor3dDef = EM.defineComponent("globalCursor3d", () => {
  return {
    entityId: -1,
  };
});

export const Cursor3dDef = EM.defineComponent("cursor3d", () => true);

export function getCursor<CS extends ComponentDef[]>(
  em: EntityManager,
  cs: [...CS]
): EntityW<[typeof Cursor3dDef, ...CS]> | undefined {
  const gb = em.findSingletonComponent(GlobalCursor3dDef);
  if (!gb) return undefined;
  const e = em.findEntity(gb.globalCursor3d.entityId, [Cursor3dDef, ...cs]);
  return e;
}

export function registerBuildCursor(em: EntityManager) {
  em.addSingletonComponent(GlobalCursor3dDef);

  em.registerSystem(
    null,
    [GlobalCursor3dDef, AssetsDef],
    (_, res) => {
      if (res.globalCursor3d.entityId === -1) {
        const cursor = em.newEntity();
        const id = cursor.id;
        res.globalCursor3d.entityId = id;
        em.addComponent(id, Cursor3dDef);
        em.addComponent(id, PositionDef);
        const wireframe: Mesh = { ...res.assets.ball.mesh, tri: [] };
        em.addComponent(id, RenderableDef, wireframe, false);
        em.addComponent(id, ColorDef, [0, 1, 1]);
      }
    },
    "buildCursor"
  );
}
